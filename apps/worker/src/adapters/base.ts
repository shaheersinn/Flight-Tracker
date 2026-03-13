// apps/worker/src/adapters/base.ts
import { FlightResult, CashMonitor, AwardMonitor } from "@flight-tracker/shared";

export interface ScrapeAdapter {
  name: string;
  priority: number;
  scrapeWindow(monitor: CashMonitor): Promise<FlightResult[]>;
  scrapeMonth(monitor: AwardMonitor): Promise<FlightResult[]>;
  isHealthy(): Promise<boolean>;
}

export function buildFingerprint(result: FlightResult): string {
  const parts = [
    result.monitorId,
    result.provider,
    result.departureDate ?? "",
    result.airline,
    result.flightNumber ?? "",
    result.stops.toString(),
    result.totalPrice?.toString() ?? result.pointsCost?.toString() ?? "",
  ];
  return Buffer.from(parts.join("|")).toString("base64").slice(0, 64);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 5000
): Promise<T> {
  let lastErr: Error | unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastErr;
}
