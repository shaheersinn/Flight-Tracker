// apps/worker/src/db/index.ts
import { Pool, PoolClient } from "pg";
import dotenv from "dotenv";

dotenv.config();

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_URL?.includes("localhost")
          ? false
          : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on("error", (err) => {
      console.error("Unexpected pool error", err);
    });
  }
  return pool;
}

export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── RapidAPI Usage Tracker ──────────────────────────────────────

const RAPIDAPI_MONTHLY_LIMIT = 10;

export async function getRapidApiUsageThisMonth(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM rapid_api_calls
     WHERE called_at >= date_trunc('month', NOW())`
  );
  return parseInt(rows[0]?.count ?? "0", 10);
}

export async function recordRapidApiCall(): Promise<void> {
  await query(
    `INSERT INTO rapid_api_calls (called_at) VALUES (NOW())`
  );
}

export async function canUseRapidApi(): Promise<boolean> {
  const used = await getRapidApiUsageThisMonth();
  return used < RAPIDAPI_MONTHLY_LIMIT;
}

// ─── Quote Helpers ────────────────────────────────────────────────

export async function getHistoricalBest(monitorId: string): Promise<number | null> {
  const rows = await query<{ min_price: string }>(
    `SELECT MIN(total_price) as min_price FROM quotes WHERE monitor_id = $1`,
    [monitorId]
  );
  const val = rows[0]?.min_price;
  return val ? parseFloat(val) : null;
}

export async function getLastCheckedPrice(monitorId: string): Promise<number | null> {
  const rows = await query<{ total_price: string }>(
    `SELECT total_price FROM quotes WHERE monitor_id = $1
     ORDER BY checked_at DESC LIMIT 1`,
    [monitorId]
  );
  const val = rows[0]?.total_price;
  return val ? parseFloat(val) : null;
}

export async function saveQuote(quote: {
  monitorId: string;
  provider: string;
  kind: string;
  origin: string;
  destination: string;
  departureDate?: string;
  arrivalDate?: string;
  totalPrice?: number;
  currency?: string;
  pointsCost?: number;
  cashSurcharge?: number;
  cabin?: string;
  airline: string;
  flightNumber?: string;
  stops: number;
  duration: string;
  bookingUrl: string;
  checkedAt: string;
  fingerprint: string;
}): Promise<void> {
  await query(
    `INSERT INTO quotes (
      monitor_id, provider, kind, origin, destination,
      departure_date, arrival_date, total_price, currency,
      points_cost, cash_surcharge, cabin, airline, flight_number,
      stops, duration, booking_url, checked_at, fingerprint
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT (monitor_id, fingerprint) DO NOTHING`,
    [
      quote.monitorId,
      quote.provider,
      quote.kind,
      quote.origin,
      quote.destination,
      quote.departureDate ?? null,
      quote.arrivalDate ?? null,
      quote.totalPrice ?? null,
      quote.currency ?? "CAD",
      quote.pointsCost ?? null,
      quote.cashSurcharge ?? null,
      quote.cabin ?? null,
      quote.airline,
      quote.flightNumber ?? null,
      quote.stops,
      quote.duration,
      quote.bookingUrl,
      quote.checkedAt,
      quote.fingerprint,
    ]
  );
}

export async function saveAlert(alert: {
  monitorId: string;
  quoteFingerprint?: string;
  alertType: string;
  message: string;
  telegramMessageId?: string;
}): Promise<void> {
  await query(
    `INSERT INTO alerts (monitor_id, alert_type, message, telegram_message_id)
     VALUES ($1, $2, $3, $4)`,
    [
      alert.monitorId,
      alert.alertType,
      alert.message,
      alert.telegramMessageId ?? null,
    ]
  );
}

export async function startRun(): Promise<number> {
  const rows = await query<{ id: number }>(
    `INSERT INTO runs (started_at, status) VALUES (NOW(), 'running') RETURNING id`
  );
  return rows[0].id;
}

export async function finishRun(
  runId: number,
  status: "success" | "partial" | "failed",
  stats: {
    monitorsChecked: number;
    quotesFound: number;
    alertsSent: number;
    errors: string[];
  }
): Promise<void> {
  await query(
    `UPDATE runs SET completed_at=NOW(), status=$1, monitors_checked=$2,
     quotes_saved=$3, alerts_sent=$4, errors=$5
     WHERE id=$6`,
    [
      status,
      stats.monitorsChecked,
      stats.quotesFound,
      stats.alertsSent,
      JSON.stringify(stats.errors),
      runId,
    ]
  );
}
