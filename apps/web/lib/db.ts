// apps/web/lib/db.ts
import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

// ── Typed query helpers ──────────────────────────────────────────────────

export type QuoteRow = {
  id: number;
  monitor_id: string;
  provider: string;
  kind: string;
  origin: string;
  destination: string;
  departure_date: string;
  total_price: number | null;
  currency: string;
  points_cost: number | null;
  cash_surcharge: number | null;
  cabin: string | null;
  airline: string;
  flight_number: string | null;
  stops: number;
  duration: string;
  booking_url: string;
  checked_at: string;
};

export type RunRow = {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  monitors_checked: number;
  quotes_saved: number;
  alerts_sent: number;
  errors: any;
};

export type AlertRow = {
  id: number;
  monitor_id: string;
  alert_type: string;
  message: string;
  sent_at: string;
};

export async function getLatestQuotePerMonitor(): Promise<QuoteRow[]> {
  return query<QuoteRow>(
    `SELECT DISTINCT ON (monitor_id) *
     FROM quotes
     ORDER BY monitor_id, checked_at DESC`
  );
}

export async function getQuoteHistory(
  monitorId: string,
  days = 30
): Promise<QuoteRow[]> {
  return query<QuoteRow>(
    `SELECT * FROM quotes
     WHERE monitor_id = $1
       AND checked_at > NOW() - INTERVAL '1 day' * $2
       AND (total_price IS NOT NULL OR points_cost IS NOT NULL)
     ORDER BY checked_at ASC`,
    [monitorId, days]
  );
}

export async function getRecentRuns(limit = 10): Promise<RunRow[]> {
  return query<RunRow>(
    `SELECT * FROM runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
}

export async function getRecentAlerts(limit = 50): Promise<AlertRow[]> {
  return query<AlertRow>(
    `SELECT * FROM alerts ORDER BY sent_at DESC LIMIT $1`,
    [limit]
  );
}
