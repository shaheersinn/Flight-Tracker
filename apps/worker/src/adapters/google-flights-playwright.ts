// apps/worker/src/adapters/google-flights-playwright.ts
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { CashMonitor, AwardMonitor, FlightResult } from "@flight-tracker/shared";
import { ScrapeAdapter, sleep } from "./base";

interface RawFlight {
  price: string;
  airline: string;
  departure: string;
  arrival: string;
  duration: string;
  stops: string;
  flightNumber: string;
}

export class GoogleFlightsPlaywrightAdapter implements ScrapeAdapter {
  name = "Google Flights (Playwright)";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
      locale: "en-CA",
      timezoneId: "America/Toronto",
    });

    // Evade webdriver detection
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      // @ts-ignore
      window.chrome = { runtime: {} };
    });
  }

  private buildUrl(origin: string, destination: string, date: string): string {
    // Google Flights URL format for one-way search
    const d = date.replace(/-/g, "");
    return (
      `https://www.google.com/travel/flights/search?` +
      `tfs=CBwQAhooagcIARIDWVlDEgoyMDI2LTA2LTI4cgcIARIDWVlaKAIyAjEwQAFIAXABmAEB&` +
      `hl=en-CA&gl=ca&curr=CAD`
    );
    // Note: for production, construct the tfs parameter properly or use
    // direct URL: https://www.google.com/travel/flights?q=Flights+from+{origin}+to+{destination}+on+{date}
  }

  private buildSearchUrl(
    origin: string,
    destination: string,
    date: string
  ): string {
    const formattedDate = date; // YYYY-MM-DD
    return (
      `https://www.google.com/travel/flights?` +
      `q=${encodeURIComponent(
        `Flights from ${origin} to ${destination} on ${formattedDate} one way`
      )}&hl=en-CA&gl=ca&curr=CAD`
    );
  }

  private async scrapeDate(
    page: Page,
    origin: string,
    destination: string,
    date: string,
    monitorId: string
  ): Promise<FlightResult[]> {
    const url = this.buildSearchUrl(origin, destination, date);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait for results – Google Flights loads dynamically
      await sleep(3000, 1500);

      // Try to find flight result cards
      const flightCards = await page
        .locator('[data-pb-id]')
        .or(page.locator('li[class*="pIav2d"]'))
        .or(page.locator('[jsname="IWWDBc"]'))
        .all();

      if (flightCards.length === 0) {
        console.warn(
          `[GoogleFlights] No cards found for ${origin}→${destination} on ${date}`
        );
        return [];
      }

      const results: FlightResult[] = [];

      for (const card of flightCards.slice(0, 5)) {
        try {
          const text = await card.innerText();
          const lines = text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);

          // Heuristic parsing of the card text
          const priceMatch = text.match(/\$[\d,]+|\bCAD[\s$]*([\d,]+)/i);
          const price = priceMatch
            ? parseFloat(priceMatch[0].replace(/[^0-9.]/g, ""))
            : null;

          if (!price) continue;

          const airlineHint =
            lines.find(
              (l) =>
                l.match(/Air Canada|WestJet|Flair|Porter|Swoop/i) !== null
            ) ?? "Unknown";

          const durationHint =
            lines.find((l) => l.match(/\d+\s*hr/i)) ?? "";
          const stopsHint = lines.find((l) =>
            l.match(/nonstop|1 stop|2 stop/i)
          );
          const stops = stopsHint
            ? stopsHint.toLowerCase().includes("nonstop")
              ? 0
              : parseInt(stopsHint) || 1
            : 0;

          results.push({
            provider: this.name,
            monitorId,
            origin,
            destination,
            departureDate: date,
            totalPrice: price,
            currency: "CAD",
            airline: airlineHint,
            flightNumber: "",
            stops,
            duration: durationHint,
            bookingUrl: url,
            scrapedAt: new Date().toISOString(),
            isAward: false,
          });
        } catch {
          // skip malformed card
        }
      }

      return results;
    } catch (err) {
      console.error(
        `[GoogleFlights] Error scraping ${origin}→${destination} ${date}:`,
        err
      );
      return [];
    }
  }

  async scrapeWindow(monitor: CashMonitor): Promise<FlightResult[]> {
    if (!this.context) await this.initialize();

    const page = await this.context!.newPage();
    const results: FlightResult[] = [];

    try {
      // Enumerate every date in the window
      const start = new Date(monitor.dateFrom);
      const end = new Date(monitor.dateTo);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const dayResults = await this.scrapeDate(
          page,
          monitor.origin,
          monitor.destination,
          dateStr,
          monitor.id
        );
        results.push(...dayResults);
        await sleep(2000, 1000); // polite delay between dates
      }
    } finally {
      await page.close();
    }

    return results;
  }

  async scrapeMonth(monitor: AwardMonitor): Promise<FlightResult[]> {
    // Google Flights Playwright is for cash fares; award scraping handled
    // by the Qatar Airways adapter. Return empty here.
    return [];
  }

  async isHealthy(): Promise<boolean> {
    if (!this.context) {
      try {
        await this.initialize();
      } catch {
        return false;
      }
    }
    try {
      const page = await this.context!.newPage();
      await page.goto("https://www.google.com/travel/flights", {
        timeout: 15000,
      });
      await page.close();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }
}
