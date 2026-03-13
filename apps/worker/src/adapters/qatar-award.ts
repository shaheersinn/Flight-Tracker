// apps/worker/src/adapters/qatar-award.ts
// Scrapes Qatar Airways Privilege Club for award availability
// Primary: Qatar Airways website | Fallback: seats.aero API

import axios from "axios";
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

export class QatarAwardAdapter implements ScrapeAdapter {
  name = "Qatar Airways (Award)";
  priority = 1;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async scrapeWindow(_monitor: CashMonitor): Promise<FlightResult[]> {
    return []; // Cash fares not supported
  }

  async scrapeMonth(monitor: AwardMonitor): Promise<FlightResult[]> {
    // Try seats.aero first (faster, more reliable) if API key present
    if (process.env.SEATS_AERO_API_KEY) {
      try {
        const results = await retryWithBackoff(
          () => this.scrapeSeatsAero(monitor),
          2,
          3000
        );
        if (results.length > 0) return results;
      } catch (err: any) {
        console.warn(`[Qatar-Award] seats.aero failed: ${err.message}`);
      }
    }

    // Fallback to Playwright scraping of Qatar Privilege Club
    return retryWithBackoff(
      () => this.scrapeQatarWebsite(monitor),
      3,
      8000
    );
  }

  // ─── seats.aero API ────────────────────────────────────────────────

  private async scrapeSeatsAero(monitor: AwardMonitor): Promise<FlightResult[]> {
    const [year, monthNum] = monitor.month.split("-");
    const startDate = `${year}-${monthNum}-01`;
    const endDate = `${year}-${monthNum}-${this.daysInMonth(parseInt(year), parseInt(monthNum))}`;

    const response = await axios.get("https://seats.aero/partnerapi/availability", {
      headers: {
        "Partner-Authorization": process.env.SEATS_AERO_API_KEY!,
        "Content-Type": "application/json",
      },
      params: {
        origin_airport: monitor.origin,
        destination_airport: monitor.destination,
        start_date: startDate,
        end_date: endDate,
        cabin: this.mapCabinToSeatsAero(monitor.cabin),
      },
      timeout: 15000,
    });

    const data = response.data?.data ?? [];
    const results: FlightResult[] = [];

    for (const slot of data) {
      if (!slot.available) continue;

      const result: FlightResult = {
        provider: "seats.aero",
        monitorId: monitor.id,
        kind: "award",
        origin: monitor.origin,
        destination: monitor.destination,
        departureDate: slot.date,
        pointsCost: slot.mileageCost ?? slot.points,
        cashSurcharge: slot.taxesFees,
        currency: "CAD",
        cabin: monitor.cabin ?? "business",
        airline: "Qatar Airways",
        stops: slot.stops ?? 1,
        duration: slot.duration ?? "Unknown",
        bookingUrl: `https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html`,
        scrapedAt: new Date().toISOString(),
      };
      (result as any).fingerprint = buildFingerprint(result);
      results.push(result);
    }

    return results;
  }

  // ─── Qatar Airways Website Scraper ────────────────────────────────

  private async scrapeQatarWebsite(monitor: AwardMonitor): Promise<FlightResult[]> {
    if (!this.browser) await this.initBrowser();

    const page = await this.context!.newPage();
    const results: FlightResult[] = [];

    try {
      // Navigate to Qatar Privilege Club search
      const url = `https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(3000);

      // Fill in search form
      // Origin
      const originInput = await page.waitForSelector(
        'input[placeholder*="From"], input[name*="origin"], [data-testid*="origin"]',
        { timeout: 10000 }
      );
      await originInput?.fill(monitor.origin);
      await sleep(1000);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");

      // Destination
      const destInput = await page.waitForSelector(
        'input[placeholder*="To"], input[name*="destination"], [data-testid*="destination"]',
        { timeout: 8000 }
      );
      await destInput?.fill(monitor.destination);
      await sleep(1000);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");

      // Date - set to first day of the month
      const [year, monthNum] = monitor.month.split("-");
      const dateStr = `${year}-${monthNum}-01`;

      const dateInput = await page.waitForSelector(
        'input[type="date"], [data-testid*="date"]',
        { timeout: 8000 }
      );
      await dateInput?.fill(dateStr);
      await sleep(500);

      // Submit search
      const searchBtn = await page.waitForSelector(
        'button[type="submit"], [data-testid*="search"]',
        { timeout: 8000 }
      );
      await searchBtn?.click();
      await sleep(5000);

      // Parse results
      try {
        await page.waitForSelector(
          '[class*="flight-result"], [class*="award-result"], [data-testid*="flight"]',
          { timeout: 15000 }
        );

        const flights = await page.evaluate(() => {
          const cards = document.querySelectorAll(
            '[class*="flight-result"], [class*="award"], [data-testid*="flight"]'
          );
          return Array.from(cards).map((card) => {
            const pointsEl = card.querySelector('[class*="points"], [class*="miles"], [class*="avios"]');
            const points = parseInt(
              pointsEl?.textContent?.replace(/\D/g, "") ?? "0"
            );
            const dateEl = card.querySelector('[class*="date"], time');
            const dateText = dateEl?.textContent?.trim() ?? "";
            const durationEl = card.querySelector('[class*="duration"]');
            const duration = durationEl?.textContent?.trim() ?? "Unknown";
            return { points, dateText, duration };
          });
        });

        for (const f of flights) {
          if (!f.points) continue;
          const result: FlightResult = {
            provider: this.name,
            monitorId: monitor.id,
            kind: "award",
            origin: monitor.origin,
            destination: monitor.destination,
            departureDate: dateStr,
            pointsCost: f.points,
            currency: "CAD",
            cabin: monitor.cabin ?? "business",
            airline: "Qatar Airways",
            stops: 1,
            duration: f.duration,
            bookingUrl: url,
            scrapedAt: new Date().toISOString(),
          };
          (result as any).fingerprint = buildFingerprint(result);
          results.push(result);
        }
      } catch {
        // No results found for this month
        console.log(`[Qatar-Award] No award seats found for ${monitor.id}`);
      }
    } finally {
      await page.close();
    }

    return results;
  }

  private async initBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.context = await this.browser.newContext({
      proxy: PROXY_CONFIG,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-CA",
    });
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;
  }

  private mapCabinToSeatsAero(
    cabin?: string
  ): string {
    const map: Record<string, string> = {
      economy: "Y",
      premium_economy: "W",
      business: "J",
      first: "F",
    };
    return map[cabin ?? "business"] ?? "J";
  }

  private daysInMonth(year: number, month: number): string {
    return new Date(year, month, 0).getDate().toString().padStart(2, "0");
  }
}
