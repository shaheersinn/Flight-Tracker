// apps/worker/src/adapters/rapidapi-flights.ts
//
// Uses the "Sky Scrapper" API on RapidAPI (host: sky-scrapper.p.rapidapi.com)
// which provides Google Flights data via official-ish API.
//
// IMPORTANT: Limited to 10 calls per calendar month. Usage is tracked in
// the `rapidapi_usage` database table. Once the limit is reached this
// adapter returns empty results so the Playwright adapter takes over.

import { CashMonitor, AwardMonitor, FlightResult } from "@flight-tracker/shared";
import { ScrapeAdapter } from "./base";
import { db } from "../db/client";

const RAPID_API_HOST = "sky-scrapper.p.rapidapi.com";
const MONTHLY_LIMIT = 10;

interface SkyScrapeFlightLeg {
  origin: { displayCode: string };
  destination: { displayCode: string };
  departure: string;
  arrival: string;
  durationInMinutes: number;
  carriers: { marketing: Array<{ name: string; alternateId: string }> };
  flightNumber: string;
  stopCount: number;
}

interface SkyScrapeItinerary {
  price: { raw: number; formatted: string };
  legs: SkyScrapeFlightLeg[];
}

export class RapidApiFlightsAdapter implements ScrapeAdapter {
  name = "RapidAPI (Sky Scrapper)";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Returns how many RapidAPI calls have been made this calendar month */
  private async getMonthlyUsage(): Promise<number> {
    const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    try {
      const row = await db.query(
        "SELECT call_count FROM rapidapi_usage WHERE year_month = $1",
        [yearMonth]
      );
      return row.rows[0]?.call_count ?? 0;
    } catch {
      return 0;
    }
  }

  /** Increments the monthly usage counter */
  private async incrementUsage(): Promise<void> {
    const yearMonth = new Date().toISOString().slice(0, 7);
    await db.query(
      `INSERT INTO rapidapi_usage (year_month, call_count)
       VALUES ($1, 1)
       ON CONFLICT (year_month)
       DO UPDATE SET call_count = rapidapi_usage.call_count + 1`,
      [yearMonth]
    );
  }

  /** Check if we can make another call this month */
  async canCallThisMonth(): Promise<boolean> {
    const used = await this.getMonthlyUsage();
    return used < MONTHLY_LIMIT;
  }

  private formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  private async fetchFlights(
    origin: string,
    destination: string,
    date: string, // YYYY-MM-DD
    monitorId: string
  ): Promise<FlightResult[]> {
    const url =
      `https://${RAPID_API_HOST}/api/v1/flights/searchFlights?` +
      `originSkyId=${origin}&destinationSkyId=${destination}` +
      `&originEntityId=&destinationEntityId=` +
      `&date=${date}&returnDate=&cabinClass=economy&adults=1` +
      `&sortBy=best&currency=CAD&market=en-CA&countryCode=CA`;

    const resp = await fetch(url, {
      headers: {
        "x-rapidapi-host": RAPID_API_HOST,
        "x-rapidapi-key": this.apiKey,
      },
    });

    if (!resp.ok) {
      throw new Error(`RapidAPI HTTP ${resp.status}: ${await resp.text()}`);
    }

    const data = await resp.json();
    const itineraries: SkyScrapeItinerary[] =
      data?.data?.itineraries ?? [];

    return itineraries.slice(0, 5).map((it) => {
      const leg = it.legs[0];
      const carrier = leg?.carriers?.marketing?.[0];
      return {
        provider: this.name,
        monitorId,
        origin,
        destination,
        departureDate: date,
        totalPrice: it.price.raw,
        currency: "CAD",
        airline: carrier?.name ?? "Unknown",
        flightNumber: carrier?.alternateId
          ? `${carrier.alternateId}${leg?.flightNumber ?? ""}`
          : leg?.flightNumber ?? "",
        stops: leg?.stopCount ?? 0,
        duration: this.formatDuration(leg?.durationInMinutes ?? 0),
        bookingUrl: `https://www.google.com/travel/flights?q=Flights+from+${origin}+to+${destination}+on+${date}`,
        scrapedAt: new Date().toISOString(),
        isAward: false,
      };
    });
  }

  async scrapeWindow(monitor: CashMonitor): Promise<FlightResult[]> {
    if (!(await this.canCallThisMonth())) {
      console.log(
        `[RapidAPI] Monthly limit of ${MONTHLY_LIMIT} reached — skipping`
      );
      return [];
    }

    const results: FlightResult[] = [];

    // For window monitors use ONE call on the midpoint date to save quota.
    // Playwright handles the full window; RapidAPI just supplements with
    // a single targeted call.
    const start = new Date(monitor.dateFrom);
    const end = new Date(monitor.dateTo);
    const midMs = (start.getTime() + end.getTime()) / 2;
    const midDate = new Date(midMs).toISOString().split("T")[0];

    try {
      console.log(
        `[RapidAPI] Calling for midpoint ${monitor.origin}→${monitor.destination} on ${midDate}`
      );
      const flights = await this.fetchFlights(
        monitor.origin,
        monitor.destination,
        midDate,
        monitor.id
      );
      await this.incrementUsage();
      results.push(...flights);
    } catch (err) {
      console.error(`[RapidAPI] Error:`, err);
    }

    return results;
  }

  async scrapeMonth(_monitor: AwardMonitor): Promise<FlightResult[]> {
    // RapidAPI cash-fare search doesn't support award availability
    return [];
  }

  async isHealthy(): Promise<boolean> {
    return this.apiKey?.length > 0 && (await this.canCallThisMonth());
  }

  async close(): Promise<void> {
    // no resources to free
  }
}
