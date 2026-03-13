// apps/web/lib/db.ts
import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_URL?.includes("localhost")
          ? false
          : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// Latest quote per monitor
export async function getLatestQuotes() {
  return query(`
    SELECT DISTINCT ON (monitor_id)
      monitor_id, provider, kind, origin, destination,
      departure_date, total_price, currency,
      points_cost, cash_surcharge, cabin, airline,
      stops, duration, booking_url, checked_at
    FROM quotes
    ORDER BY monitor_id, checked_at DESC
  `);
}

// Latest prediction per monitor
export async function getLatestPredictions() {
  return query(`
    SELECT DISTINCT ON (monitor_id)
      monitor_id, predicted_mean, predicted_min,
      predicted_max, confidence, forecast_days, generated_at
    FROM predictions
    ORDER BY monitor_id, generated_at DESC
  `);
}

// All-time best per monitor
export async function getAllTimeBest() {
  return query(`
    SELECT monitor_id, MIN(total_price) as best_price
    FROM quotes WHERE kind='cash' AND total_price IS NOT NULL
    GROUP BY monitor_id
  `);
}

// Price history for a monitor (last 30 days)
export async function getPriceHistory(monitorId: string, days = 30) {
  return query(
    `SELECT departure_date, total_price, provider, airline, checked_at
     FROM quotes
     WHERE monitor_id=$1 AND kind='cash' AND total_price IS NOT NULL
       AND checked_at > NOW() - INTERVAL '${days} days'
     ORDER BY checked_at ASC`,
    [monitorId]
  );
}

// Recent runs
export async function getRecentRuns(limit = 10) {
  return query(
    `SELECT * FROM runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
}

// Recent alerts
export async function getRecentAlerts(limit = 20) {
  return query(
    `SELECT a.*, q.total_price, q.points_cost, q.origin, q.destination,
            q.departure_date, q.airline
     FROM alerts a
     LEFT JOIN quotes q ON q.monitor_id = a.monitor_id
     ORDER BY a.sent_at DESC LIMIT $1`,
    [limit]
  );
}

// Award availability for a monitor
export async function getAwardSlots(monitorId: string) {
  return query(
    `SELECT departure_date, points_cost, cash_surcharge, cabin, airline, checked_at
     FROM quotes
     WHERE monitor_id=$1 AND kind='award' AND points_cost IS NOT NULL
     ORDER BY departure_date ASC, points_cost ASC`,
    [monitorId]
  );
}

// RapidAPI usage count this month
export async function getRapidApiUsage() {
  const rows = await query<{count: string}>(
    `SELECT COUNT(*) as count FROM rapid_api_calls
     WHERE called_at >= date_trunc('month', NOW())`
  );
  return parseInt(rows[0]?.count ?? "0", 10);
}
