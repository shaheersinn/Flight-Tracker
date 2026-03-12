// apps/worker/src/adapters/base.ts
import { CashMonitor, AwardMonitor, FlightResult } from "@flight-tracker/shared";

export interface ScrapeAdapter {
  name: string;
  /** Scrape a date-window cash monitor */
  scrapeWindow(monitor: CashMonitor): Promise<FlightResult[]>;
  /** Scrape a full-month award monitor */
  scrapeMonth(monitor: AwardMonitor): Promise<FlightResult[]>;
  /** Quick health check */
  isHealthy(): Promise<boolean>;
  /** Cleanup resources */
  close(): Promise<void>;
}

/** Build a unique fingerprint to deduplicate quotes in the DB */
export function buildFingerprint(result: FlightResult): string {
  const key = [
    result.monitorId,
    result.departureDate,
    result.airline,
    result.flightNumber ?? "",
    result.totalPrice ?? result.pointsCost ?? 0,
    result.provider,
  ].join("|");
  return Buffer.from(key).toString("base64");
}

/** Sleep helper with optional jitter */
export async function sleep(ms: number, jitter = 0): Promise<void> {
  const delay = ms + Math.floor(Math.random() * jitter);
  return new Promise((resolve) => setTimeout(resolve, delay));
}
