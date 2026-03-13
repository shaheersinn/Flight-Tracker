import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!;
    pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") || url.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 20000,
    });
  }
  return pool;
}

export async function q<T = Record<string, any>>(
  sql: string, params: any[] = []
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

// ── Typed query helpers ──────────────────────────────────────────────────────

export async function getLatestQuotes() {
  return q(`
    SELECT DISTINCT ON (monitor_id)
      monitor_id, provider, kind, origin, destination,
      departure_date, total_price, currency, points_cost,
      cash_surcharge, cabin, airline, stops, duration,
      booking_url, checked_at
    FROM quotes
    ORDER BY monitor_id, checked_at DESC
  `);
}

export async function getLatestPredictions() {
  return q(`
    SELECT DISTINCT ON (monitor_id)
      monitor_id, predicted_mean, predicted_min,
      predicted_max, confidence, forecast_days, generated_at
    FROM predictions
    ORDER BY monitor_id, generated_at DESC
  `);
}

export async function getAllTimeBest() {
  return q(`
    SELECT monitor_id, MIN(total_price) AS best_price
    FROM quotes WHERE kind='cash' AND total_price IS NOT NULL
    GROUP BY monitor_id
  `);
}

export async function getPriceHistory(monitorId: string, days = 60) {
  return q(
    `SELECT departure_date, total_price, provider, airline, checked_at
     FROM quotes
     WHERE monitor_id=$1 AND kind='cash' AND total_price IS NOT NULL
       AND checked_at > NOW() - ($2 || ' days')::INTERVAL
     ORDER BY checked_at ASC`,
    [monitorId, days]
  );
}

export async function getRecentRuns(limit = 15) {
  return q(
    `SELECT id, started_at, completed_at, status,
            monitors_checked, quotes_saved, alerts_sent, errors
     FROM runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
}

export async function getRecentAlerts(limit = 30) {
  return q(
    `SELECT a.id, a.monitor_id, a.alert_type, a.message, a.sent_at,
            a.telegram_message_id
     FROM alerts a
     ORDER BY a.sent_at DESC LIMIT $1`,
    [limit]
  );
}

export async function getRapidApiUsage(): Promise<number> {
  const rows = await q<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM rapid_api_calls
     WHERE called_at >= date_trunc('month', NOW())`
  );
  return parseInt(rows[0]?.cnt ?? "0", 10);
}
