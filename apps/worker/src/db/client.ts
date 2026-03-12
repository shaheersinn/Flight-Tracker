// apps/worker/src/db/client.ts
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
});

/** Save a quote to the database, ignoring duplicates (by fingerprint) */
export async function saveQuote(
  monitorId: string,
  result: {
    provider: string;
    kind: "cash" | "award";
    origin: string;
    destination: string;
    departureDate?: string;
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
    fingerprint: string;
  }
): Promise<number | null> {
  try {
    const res = await db.query(
      `INSERT INTO quotes
         (monitor_id, provider, kind, origin, destination, departure_date,
          total_price, currency, points_cost, cash_surcharge, cabin,
          airline, flight_number, stops, duration, booking_url, fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (monitor_id, fingerprint) DO NOTHING
       RETURNING id`,
      [
        monitorId,
        result.provider,
        result.kind,
        result.origin,
        result.destination,
        result.departureDate ?? null,
        result.totalPrice ?? null,
        result.currency ?? "CAD",
        result.pointsCost ?? null,
        result.cashSurcharge ?? null,
        result.cabin ?? null,
        result.airline,
        result.flightNumber ?? null,
        result.stops,
        result.duration,
        result.bookingUrl,
        result.fingerprint,
      ]
    );
    return res.rows[0]?.id ?? null;
  } catch (err) {
    console.error("[DB] saveQuote error:", err);
    return null;
  }
}

/** Return the previous best price for a monitor */
export async function getPreviousBest(
  monitorId: string,
  kind: "cash" | "award"
): Promise<{ totalPrice?: number; pointsCost?: number } | null> {
  try {
    const field = kind === "cash" ? "total_price" : "points_cost";
    const res = await db.query(
      `SELECT ${field} as value FROM quotes
       WHERE monitor_id = $1 AND ${field} IS NOT NULL
         AND checked_at < NOW() - INTERVAL '1 hour'
       ORDER BY ${field} ASC
       LIMIT 1`,
      [monitorId]
    );
    if (!res.rows[0]) return null;
    return kind === "cash"
      ? { totalPrice: parseFloat(res.rows[0].value) }
      : { pointsCost: parseInt(res.rows[0].value) };
  } catch {
    return null;
  }
}

/** Return current average price for a monitor over last 14 days */
export async function getAveragePrice(monitorId: string): Promise<number | null> {
  try {
    const res = await db.query(
      `SELECT AVG(total_price) as avg FROM quotes
       WHERE monitor_id = $1
         AND total_price IS NOT NULL
         AND checked_at > NOW() - INTERVAL '14 days'`,
      [monitorId]
    );
    return res.rows[0]?.avg ? parseFloat(res.rows[0].avg) : null;
  } catch {
    return null;
  }
}

/** Create a run record and return its ID */
export async function createRun(): Promise<number> {
  const res = await db.query(
    `INSERT INTO runs (status) VALUES ('running') RETURNING id`
  );
  return res.rows[0].id;
}

/** Update run record on completion */
export async function finishRun(
  runId: number,
  status: "success" | "partial" | "failed",
  stats: { monitorsChecked: number; quotesSaved: number; alertsSent: number; errors?: any[] }
): Promise<void> {
  await db.query(
    `UPDATE runs
     SET status=$1, completed_at=NOW(),
         monitors_checked=$2, quotes_saved=$3,
         alerts_sent=$4, errors=$5
     WHERE id=$6`,
    [
      status,
      stats.monitorsChecked,
      stats.quotesSaved,
      stats.alertsSent,
      JSON.stringify(stats.errors ?? []),
      runId,
    ]
  );
}
