// apps/worker/src/adapters/google-flights-rapid.ts
// Uses Sky Scrapper API on RapidAPI (https://rapidapi.com/apiheya/api/sky-scrapper)
// LIMITED to 10 requests per month - managed via DB counter

import axios from "axios";
import { CashMonitor, AwardMonitor, FlightResult } from "@flight-tracker/shared";
import { ScrapeAdapter, buildFingerprint, sleep } from "./base";
import { canUseRapidApi, recordRapidApiCall } from "../db";

const RAPIDAPI_HOST = "sky-scrapper.p.rapidapi.com";
const BASE_URL = "https://sky-scrapper.p.rapidapi.com/api/v2/flights";

// Airport IATA → SkyScanner entity IDs (needed by Sky Scrapper API)
const AIRPORT_IDS: Record<string, string> = {
  YYC: "YYC-sky",
  YYZ: "YYZ-sky",
  ISB: "ISB-sky",
  IST: "IST-sky",
};

export class RapidApiGoogleFlightsAdapter implements ScrapeAdapter {
  name = "RapidAPI (Sky Scrapper)";
  priority = 1; // Highest priority when available

  private headers() {
    return {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY ?? "",
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    };
  }

  async isHealthy(): Promise<boolean> {
    if (!process.env.RAPIDAPI_KEY) return false;
    return canUseRapidApi();
  }

  async scrapeWindow(monitor: CashMonitor): Promise<FlightResult[]> {
    if (!(await canUseRapidApi())) {
      console.warn("[RapidAPI] Monthly limit reached (10/month). Skipping.");
      return [];
    }

    const results: FlightResult[] = [];
    const originId = AIRPORT_IDS[monitor.origin];
    const destId = AIRPORT_IDS[monitor.destination];

    if (!originId || !destId) {
      console.warn(`[RapidAPI] Unknown airport: ${monitor.origin} or ${monitor.destination}`);
      return [];
    }

    // Iterate over each date in the window
    const dates = this.getDateRange(monitor.dateFrom, monitor.dateTo);

    // We spend ONE API call per monitor window (batch cheapest date approach)
    // Use the middle date of the window to get representative pricing
    const midDate = dates[Math.floor(dates.length / 2)];

    try {
      console.log(`[RapidAPI] Fetching ${monitor.origin}→${monitor.destination} around ${midDate}`);
      await recordRapidApiCall();

      const response = await axios.get(`${BASE_URL}/searchFlights`, {
        headers: this.headers(),
        params: {
          originSkyId: monitor.origin,
          destinationSkyId: monitor.destination,
          originEntityId: originId,
          destinationEntityId: destId,
          date: midDate,
          cabinClass: "economy",
          adults: "1",
          sortBy: "best",
          currency: "CAD",
          market: "CA",
          countryCode: "CA",
        },
        timeout: 15000,
      });

      const itineraries =
        response.data?.data?.itineraries ?? [];

      for (const item of itineraries.slice(0, 5)) {
        const leg = item.legs?.[0];
        if (!leg) continue;

        const price = item.price?.raw;
        const airline = leg.carriers?.marketing?.[0]?.name ?? "Unknown";
        const flightNum = leg.segments?.[0]?.flightNumber;
        const departDate = leg.departure?.split("T")?.[0];

        if (!price || !departDate) continue;

        const result: FlightResult = {
          provider: this.name,
          monitorId: monitor.id,
          kind: "cash",
          origin: monitor.origin,
          destination: monitor.destination,
          departureDate: departDate,
          totalPrice: parseFloat(price),
          currency: "CAD",
          airline,
          flightNumber: flightNum,
          stops: leg.stopCount ?? 0,
          duration: this.formatDuration(leg.durationInMinutes ?? 0),
          bookingUrl: `https://www.google.com/travel/flights?hl=en-CA`,
          scrapedAt: new Date().toISOString(),
        };

        (result as any).fingerprint = buildFingerprint(result);
        results.push(result);
      }

      await sleep(2000);
    } catch (err: any) {
      console.error(`[RapidAPI] Error: ${err.message}`);
    }

    return results;
  }

  async scrapeMonth(monitor: AwardMonitor): Promise<FlightResult[]> {
    // RapidAPI doesn't support award searches well - return empty
    return [];
  }

  private getDateRange(from: string, to: string): string[] {
    const dates: string[] = [];
    const start = new Date(from);
    const end = new Date(to);
    const cur = new Date(start);
    while (cur <= end) {
      dates.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  private formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }
}
