// apps/worker/src/adapters/qatar-award.ts
//
// Scrapes Qatar Airways Privilege Club award calendar for business class
// availability. Falls back to Seats.aero API if SEATS_AERO_API_KEY is set.

import { chromium, Browser, BrowserContext } from "playwright";
import { CashMonitor, AwardMonitor, FlightResult } from "@flight-tracker/shared";
import { ScrapeAdapter, sleep } from "./base";

export class QatarAwardAdapter implements ScrapeAdapter {
  name = "Qatar Airways (Award)";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private seatsAeroKey: string | null;

  constructor(seatsAeroKey?: string) {
    this.seatsAeroKey = seatsAeroKey ?? null;
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-GB",
    });
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
  }

  // ── Seats.aero fallback ─────────────────────────────────────────────────

  private async scrapeSeatsAero(
    monitor: AwardMonitor
  ): Promise<FlightResult[]> {
    if (!this.seatsAeroKey) return [];

    const airportMap: Record<string, string> = {
      ISB: "ISB",
      IST: "IST",
      SAW: "SAW",
    };

    const dest = airportMap[monitor.destination] ?? monitor.destination;
    const [year, month] = monitor.month.split("-");
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-28`; // seats.aero handles month-end

    try {
      const url =
        `https://api.seats.aero/partnerapi/availability?` +
        `origin_airport=YYZ&destination_airport=${dest}` +
        `&start_date=${startDate}&end_date=${endDate}` +
        `&cabin=business&source=qr`; // qr = Qatar Airways

      const resp = await fetch(url, {
        headers: {
          "Partner-Authorization": this.seatsAeroKey,
          "Content-Type": "application/json",
        },
      });

      if (!resp.ok) {
        console.warn(`[SeatsAero] HTTP ${resp.status}`);
        return [];
      }

      const json = await resp.json();
      const trips: any[] = json?.data ?? [];

      return trips
        .filter((t) => t.YAvailable || t.JAvailable) // Y=eco, J=biz
        .map((t) => ({
          provider: "Seats.aero",
          monitorId: monitor.id,
          origin: "YYZ",
          destination: monitor.destination,
          departureDate: t.Date,
          pointsCost: t.JMileageCost ?? t.YMileageCost ?? 0,
          cashSurcharge: t.JTaxes ?? t.YTaxes ?? 0,
          currency: "USD",
          cabin: "business",
          airline: "Qatar Airways",
          stops: 1,
          duration: "~18h",
          bookingUrl: "https://www.qatarairways.com/en/privilege-club/redeem/flight-rewards.html",
          scrapedAt: new Date().toISOString(),
          isAward: true,
        }));
    } catch (err) {
      console.error("[SeatsAero] Error:", err);
      return [];
    }
  }

  // ── Qatar Airways Privilege Club direct scrape ──────────────────────────

  private async scrapeQatarPrivilegeClub(
    monitor: AwardMonitor
  ): Promise<FlightResult[]> {
    if (!this.context) await this.initialize();

    const page = await this.context!.newPage();
    const results: FlightResult[] = [];

    try {
      const [year, month] = monitor.month.split("-");
      // Privilege Club award search URL
      const url =
        `https://www.qatarairways.com/en/privilege-club/redeem/flight-rewards.html` +
        `?widget=QR&searchType=F&addTaxToMiles=on` +
        `&upsellCallID=&bookingClass=J` +
        `&tripType=O&fromStation=YYZ&toStation=${monitor.destination}` +
        `&departingHidden=${year}-${month}-01` +
        `&returnHidden=&numOfAdults=1&numOfChildren=0&numOfInfants=0`;

      console.log(
        `[QatarAward] Checking ${monitor.origin}→${monitor.destination} ${monitor.month}`
      );
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(4000, 2000);

      // Click "Search" button if present
      try {
        const searchBtn = page.locator('[id*="btnSearch"], button[type="submit"]').first();
        if (await searchBtn.isVisible({ timeout: 3000 })) {
          await searchBtn.click();
          await sleep(5000, 2000);
        }
      } catch {
        // may already be searching
      }

      // Look for available dates in the calendar
      const availableCells = await page
        .locator(
          '.calendar-cell.available, [class*="available"][class*="date"], ' +
            '[data-available="true"]'
        )
        .all();

      console.log(
        `[QatarAward] Found ${availableCells.length} available dates`
      );

      for (const cell of availableCells.slice(0, 20)) {
        try {
          const dateAttr = await cell.getAttribute("data-date");
          const milesText = await cell.innerText();
          const milesMatch = milesText.match(/([\d,]+)\s*miles?/i);
          const miles = milesMatch
            ? parseInt(milesMatch[1].replace(/,/g, ""))
            : null;

          const dateStr =
            dateAttr ?? `${year}-${month}-${String(results.length + 1).padStart(2, "0")}`;

          if (miles) {
            results.push({
              provider: this.name,
              monitorId: monitor.id,
              origin: monitor.origin,
              destination: monitor.destination,
              departureDate: dateStr,
              pointsCost: miles,
              cashSurcharge: 250, // typical QR surcharge estimate
              currency: "USD",
              cabin: monitor.cabin ?? "business",
              airline: "Qatar Airways",
              stops: 1,
              duration: "~18h",
              bookingUrl: url,
              scrapedAt: new Date().toISOString(),
              isAward: true,
            });
          }
        } catch {
          // skip cell
        }
      }

      // If direct scrape found nothing but cells exist – flag availability
      if (results.length === 0 && availableCells.length > 0) {
        results.push({
          provider: this.name,
          monitorId: monitor.id,
          origin: monitor.origin,
          destination: monitor.destination,
          departureDate: `${year}-${month}`,
          pointsCost: undefined,
          currency: "USD",
          cabin: monitor.cabin ?? "business",
          airline: "Qatar Airways",
          stops: 1,
          duration: "~18h",
          bookingUrl: url,
          scrapedAt: new Date().toISOString(),
          isAward: true,
        });
      }
    } catch (err) {
      console.error(
        `[QatarAward] Error for ${monitor.destination} ${monitor.month}:`,
        err
      );
    } finally {
      await page.close();
    }

    return results;
  }

  async scrapeWindow(_monitor: CashMonitor): Promise<FlightResult[]> {
    return []; // not applicable
  }

  async scrapeMonth(monitor: AwardMonitor): Promise<FlightResult[]> {
    // Try Seats.aero first (more reliable), fall back to direct scrape
    const seatsAeroResults = await this.scrapeSeatsAero(monitor);
    if (seatsAeroResults.length > 0) {
      console.log(
        `[QatarAward] Seats.aero returned ${seatsAeroResults.length} results for ${monitor.id}`
      );
      return seatsAeroResults;
    }

    return await this.scrapeQatarPrivilegeClub(monitor);
  }

  async isHealthy(): Promise<boolean> {
    return true; // always try
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }
}
