// apps/worker/src/adapters/kayak.ts
import { chromium, Browser, BrowserContext } from "playwright";
import { CashMonitor, AwardMonitor, FlightResult } from "@flight-tracker/shared";
import { ScrapeAdapter, buildFingerprint, sleep, retryWithBackoff } from "./base";

const PROXY_CONFIG = process.env.PROXY_ENDPOINT
  ? {
      server: process.env.PROXY_ENDPOINT,
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD,
    }
  : undefined;

export class KayakAdapter implements ScrapeAdapter {
  name = "Kayak";
  priority = 3;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.context = await this.browser.newContext({
      proxy: PROXY_CONFIG,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-CA",
    });
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async scrapeWindow(monitor: CashMonitor): Promise<FlightResult[]> {
    if (!this.browser) await this.initialize();
    const results: FlightResult[] = [];

    const dates = this.getDateRange(monitor.dateFrom, monitor.dateTo);
    // Sample a few dates from the window to avoid excessive requests
    const sampleDates = dates.filter((_, i) => i % 2 === 0);

    for (const date of sampleDates) {
      try {
        const dayResults = await retryWithBackoff(
          () => this.scrapeDate(monitor, date),
          2,
          6000
        );
        results.push(...dayResults);
        await sleep(4000 + Math.random() * 3000);
      } catch (err: any) {
        console.warn(`[Kayak] ${monitor.id} on ${date}: ${err.message}`);
      }
    }
    return results;
  }

  private async scrapeDate(
    monitor: CashMonitor,
    date: string
  ): Promise<FlightResult[]> {
    const page = await this.context!.newPage();
    const results: FlightResult[] = [];

    try {
      const url = `https://www.ca.kayak.com/flights/${monitor.origin}-${monitor.destination}/${date}?sort=price_a`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(3000 + Math.random() * 2000);

      try {
        await page.waitForSelector('[class*="nrc6"]', { timeout: 10000 });
      } catch {
        return [];
      }

      await sleep(2000);

      const flights = await page.evaluate(() => {
        const cards = document.querySelectorAll('[class*="nrc6"]');
        const extracted: any[] = [];
        cards.forEach((card) => {
          try {
            const priceEl = card.querySelector('[class*="price-text"]') ||
              card.querySelector('[class*="mainPrice"]');
            const priceText = priceEl?.textContent ?? "";
            const priceMatch = priceText.match(/[\d,]+/);
            if (!priceMatch) return;
            const price = parseInt(priceMatch[0].replace(",", ""), 10);

            const airlineEl = card.querySelector('[class*="codeshares-airline-names"]') ||
              card.querySelector('[class*="carrier-name"]');
            const airline = airlineEl?.textContent?.trim() ?? "Unknown";

            const durationEl = card.querySelector('[class*="duration"]');
            const duration = durationEl?.textContent?.trim() ?? "Unknown";

            const stopsEl = card.querySelector('[class*="stops-text"]');
            const stopsText = stopsEl?.textContent ?? "nonstop";
            const stops = stopsText.toLowerCase().includes("nonstop") ? 0 :
              parseInt(stopsText.match(/\d+/)?.[0] ?? "1", 10);

            extracted.push({ price, airline, duration, stops });
          } catch {}
        });
        return extracted;
      });

      for (const f of flights.slice(0, 5)) {
        const result: FlightResult = {
          provider: this.name,
          monitorId: monitor.id,
          kind: "cash",
          origin: monitor.origin,
          destination: monitor.destination,
          departureDate: date,
          totalPrice: f.price,
          currency: "CAD",
          airline: f.airline,
          stops: f.stops,
          duration: f.duration,
          bookingUrl: url,
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

  async scrapeMonth(_monitor: AwardMonitor): Promise<FlightResult[]> {
    return [];
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;
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
