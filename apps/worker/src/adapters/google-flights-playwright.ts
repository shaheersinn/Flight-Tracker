// apps/worker/src/adapters/google-flights-playwright.ts
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { CashMonitor, AwardMonitor, FlightResult } from "@flight-tracker/shared";
import { ScrapeAdapter, buildFingerprint, sleep, retryWithBackoff } from "./base";

const PROXY_CONFIG = process.env.PROXY_ENDPOINT
  ? {
      server: process.env.PROXY_ENDPOINT,
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD,
    }
  : undefined;

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export class GoogleFlightsPlaywrightAdapter implements ScrapeAdapter {
  name = "Google Flights (Playwright)";
  priority = 2;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
      ],
    });
    this.context = await this.browser.newContext({
      proxy: PROXY_CONFIG,
      userAgent: randomUserAgent(),
      viewport: { width: 1440, height: 900 },
      locale: "en-CA",
      timezoneId: "America/Toronto",
      extraHTTPHeaders: {
        "Accept-Language": "en-CA,en;q=0.9",
      },
    });

    // Stealth: override navigator.webdriver
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3],
      });
    });
  }

  async isHealthy(): Promise<boolean> {
    return true; // Always available as fallback
  }

  async scrapeWindow(monitor: CashMonitor): Promise<FlightResult[]> {
    if (!this.browser) await this.initialize();
    const results: FlightResult[] = [];

    const dates = this.getDateRange(monitor.dateFrom, monitor.dateTo);

    for (const date of dates) {
      try {
        const dayResults = await retryWithBackoff(
          () => this.scrapeOneDate(monitor, date),
          3,
          5000
        );
        results.push(...dayResults);
        // Human-like delay between date searches
        await sleep(3000 + Math.random() * 2000);
      } catch (err: any) {
        console.warn(
          `[GF-Playwright] Failed for ${monitor.origin}→${monitor.destination} on ${date}: ${err.message}`
        );
      }
    }

    return results;
  }

  private async scrapeOneDate(
    monitor: CashMonitor,
    date: string
  ): Promise<FlightResult[]> {
    const page = (await this.context!.newPage()) as Page;
    const results: FlightResult[] = [];

    try {
      const url = this.buildUrl(monitor, date);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Simulate reading behavior
      await sleep(2000 + Math.random() * 1500);
      await page.mouse.move(
        400 + Math.random() * 200,
        300 + Math.random() * 200
      );

      // Wait for flight results
      try {
        await page.waitForSelector('div[jsname="IWWDBc"]', { timeout: 12000 });
      } catch {
        // Try alternate selector
        await page.waitForSelector('[data-result-index]', { timeout: 8000 });
      }

      await sleep(2500);

      // Extract flights using evaluate
      const flights = await page.evaluate(() => {
        const cards = document.querySelectorAll('div[jsname="IWWDBc"]');
        const extracted: any[] = [];

        cards.forEach((card) => {
          try {
            // Price
            const priceEl =
              card.querySelector('[class*="YMlIz"]') ||
              card.querySelector('[class*="FpEdX"]') ||
              card.querySelector('[aria-label*="$"]') ||
              card.querySelector('[aria-label*="CA"]');
            const priceText = priceEl?.textContent ?? "";
            const priceMatch = priceText.match(/[\d,]+/);
            if (!priceMatch) return;
            const price = parseInt(priceMatch[0].replace(",", ""), 10);

            // Airline
            const airlineEl =
              card.querySelector('[class*="sSHqwe"]') ||
              card.querySelector('[class*="tPgKwe"]') ||
              card.querySelector('img[alt]');
            const airline =
              airlineEl instanceof HTMLImageElement
                ? airlineEl.alt
                : airlineEl?.textContent ?? "Unknown";

            // Duration
            const durationEl = card.querySelector('[class*="Ak5kof"]');
            const duration = durationEl?.textContent?.trim() ?? "Unknown";

            // Stops
            const stopsEl =
              card.querySelector('[class*="EfT7Ae"]') ||
              card.querySelector('[class*="stops"]');
            const stopsText = stopsEl?.textContent ?? "0 stops";
            const stops = stopsText.toLowerCase().includes("nonstop")
              ? 0
              : parseInt(stopsText.match(/\d+/)?.[0] ?? "1", 10);

            extracted.push({ price, airline, duration, stops });
          } catch {}
        });

        return extracted;
      });

      for (const f of flights) {
        const result: FlightResult = {
          provider: this.name,
          monitorId: monitor.id,
          kind: "cash",
          origin: monitor.origin,
          destination: monitor.destination,
          departureDate: date,
          totalPrice: f.price,
          currency: "CAD",
          airline: f.airline.trim(),
          stops: f.stops,
          duration: f.duration,
          bookingUrl: this.buildUrl(monitor, date),
          scrapedAt: new Date().toISOString(),
        };
        (result as any).fingerprint = buildFingerprint(result);
        results.push(result);
      }
    } finally {
      await page.close();
    }

    return results;
  }

  async scrapeMonth(monitor: AwardMonitor): Promise<FlightResult[]> {
    // Google Flights doesn't support award search - return empty
    return [];
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;
  }

  private buildUrl(monitor: CashMonitor, date: string): string {
    const stops = monitor.maxStops === 0 ? "0" : "";
    const base = `https://www.google.com/travel/flights?hl=en-CA&gl=CA&curr=CAD`;
    return (
      base +
      `#flt=${monitor.origin}.${monitor.destination}.${date};c:CAD;e:1;` +
      `sd:1;t:f${stops ? ";s:" + stops : ""}`
    );
  }

  private getDateRange(from: string, to: string): string[] {
    const dates: string[] = [];
    const cur = new Date(from);
    const end = new Date(to);
    while (cur <= end) {
      dates.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }
}
