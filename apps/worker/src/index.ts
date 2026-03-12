// apps/worker/src/index.ts
//
// Main entry point for the daily flight scraper.
// Run via:  npm run scrape
//
// Flow:
//   1. Initialize adapters
//   2. For each monitor: try Playwright first, supplement with RapidAPI if budget allows
//   3. Save new quotes to DB; compare with historical data
//   4. Collect all alert-worthy results
//   5. Send ONE consolidated Telegram message

import { monitors, Monitor, CashMonitor, AwardMonitor, FlightResult } from "@flight-tracker/shared";
import { GoogleFlightsPlaywrightAdapter } from "./adapters/google-flights-playwright";
import { RapidApiFlightsAdapter } from "./adapters/rapidapi-flights";
import { QatarAwardAdapter } from "./adapters/qatar-award";
import { buildFingerprint, sleep } from "./adapters/base";
import {
  db,
  saveQuote,
  getPreviousBest,
  getAveragePrice,
  createRun,
  finishRun,
} from "./db/client";
import { TelegramAlerter, AlertItem } from "./telegram/bot";

// ── Config ──────────────────────────────────────────────────────────────────

const PRICE_DROP_THRESHOLD_PCT = 0.12; // 12% drop triggers alert
const CASH_THRESHOLD_CAD = 160;        // always alert if under this
const POINTS_DROP_THRESHOLD_PCT = 0.10;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isCash(m: Monitor): m is CashMonitor {
  return m.kind === "cash";
}
function isAward(m: Monitor): m is AwardMonitor {
  return m.kind === "award";
}

async function processResults(
  results: FlightResult[],
  monitor: Monitor
): Promise<AlertItem[]> {
  const alertItems: AlertItem[] = [];

  // Pick the single best result per monitor per run
  const best = results.reduce<FlightResult | null>((prev, curr) => {
    if (!prev) return curr;
    if (isCash(monitor) && (curr.totalPrice ?? Infinity) < (prev.totalPrice ?? Infinity))
      return curr;
    if (isAward(monitor) && (curr.pointsCost ?? Infinity) < (prev.pointsCost ?? Infinity))
      return curr;
    return prev;
  }, null);

  if (!best) return [];

  const fp = buildFingerprint(best);
  const kind = isCash(monitor) ? "cash" : "award";

  const quoteId = await saveQuote(monitor.id, {
    provider: best.provider,
    kind,
    origin: best.origin,
    destination: best.destination,
    departureDate: best.departureDate,
    totalPrice: best.totalPrice,
    currency: best.currency,
    pointsCost: best.pointsCost,
    cashSurcharge: best.cashSurcharge,
    cabin: best.cabin,
    airline: best.airline,
    flightNumber: best.flightNumber,
    stops: best.stops,
    duration: best.duration,
    bookingUrl: best.bookingUrl,
    fingerprint: fp,
  });

  const prevBest = await getPreviousBest(monitor.id, kind);
  const avgPrice = isCash(monitor)
    ? await getAveragePrice(monitor.id)
    : null;

  if (kind === "cash" && best.totalPrice) {
    const prev = prevBest?.totalPrice;
    const isNewLow = prev == null || best.totalPrice < prev;
    const isPriceDrop =
      prev != null &&
      (prev - best.totalPrice) / prev >= PRICE_DROP_THRESHOLD_PCT;
    const isBelowThreshold = best.totalPrice <= CASH_THRESHOLD_CAD;

    if (isNewLow || isPriceDrop || isBelowThreshold) {
      alertItems.push({
        result: best,
        alertType: isNewLow ? "new_low" : isBelowThreshold ? "threshold_breach" : "price_drop",
        previousPrice: prev,
        avgPrice: avgPrice ?? undefined,
      });
    }
  }

  if (kind === "award" && best.pointsCost) {
    const prev = prevBest?.pointsCost;
    const isNewLow = prev == null || best.pointsCost < prev;
    const isPointsDrop =
      prev != null &&
      (prev - best.pointsCost) / prev >= POINTS_DROP_THRESHOLD_PCT;

    if (isNewLow || isPointsDrop) {
      alertItems.push({
        result: best,
        alertType: isNewLow ? "new_low" : "price_drop",
        previousPoints: prev,
      });
    }
  }

  // Award availability alert: any new award result is noteworthy
  if (kind === "award" && quoteId != null) {
    const existing = alertItems.find(
      (a) => a.result.monitorId === monitor.id
    );
    if (!existing) {
      alertItems.push({
        result: best,
        alertType: "award_available",
      });
    }
  }

  return alertItems;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const runId = await createRun();
  console.log(`\n🚀 Flight Tracker run #${runId} starting…\n`);

  const errors: any[] = [];
  let monitorsChecked = 0;
  let quotesSaved = 0;
  const allAlerts: AlertItem[] = [];

  // Initialise adapters
  const gfAdapter = new GoogleFlightsPlaywrightAdapter();
  const rapidAdapter = process.env.RAPIDAPI_KEY
    ? new RapidApiFlightsAdapter(process.env.RAPIDAPI_KEY)
    : null;
  const qrAdapter = new QatarAwardAdapter(process.env.SEATS_AERO_API_KEY);

  const telegramToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const telegramChatId = requireEnv("TELEGRAM_CHAT_ID");
  const telegramAlerter = new TelegramAlerter(telegramToken, telegramChatId);

  try {
    await gfAdapter.initialize();

    for (const monitor of monitors) {
      console.log(`\n📍 Processing monitor: ${monitor.id}`);
      let results: FlightResult[] = [];

      try {
        if (isCash(monitor)) {
          // Primary: Google Flights via Playwright
          results = await gfAdapter.scrapeWindow(monitor);
          console.log(`  [Playwright] ${results.length} results`);

          // Supplement with RapidAPI if budget allows
          if (rapidAdapter && (await rapidAdapter.canCallThisMonth())) {
            const rapidResults = await rapidAdapter.scrapeWindow(monitor);
            console.log(`  [RapidAPI] ${rapidResults.length} results`);
            results.push(...rapidResults);
          }
        } else if (isAward(monitor)) {
          results = await qrAdapter.scrapeMonth(monitor);
          console.log(`  [QatarAward] ${results.length} results`);
        }

        const alerts = await processResults(results, monitor);
        allAlerts.push(...alerts);
        quotesSaved += results.length;
        monitorsChecked++;

        console.log(`  ✅ ${results.length} quotes, ${alerts.length} alerts`);
      } catch (err: any) {
        console.error(`  ❌ Error for ${monitor.id}:`, err.message);
        errors.push({ monitorId: monitor.id, error: err.message });
      }

      await sleep(1500, 500); // polite delay between monitors
    }

    // ── Send ONE consolidated Telegram alert ───────────────────────────────
    if (allAlerts.length > 0) {
      console.log(
        `\n📣 Sending consolidated alert (${allAlerts.length} items)…`
      );
      await telegramAlerter.sendConsolidatedAlert(allAlerts);
      console.log("  ✅ Telegram alert sent.");
    } else {
      console.log("\n💤 No alert-worthy results today. No Telegram message sent.");
      // Optionally send a no-deals notice
      // await telegramAlerter.sendMessage("✈️ Flight Tracker: No new deals today.");
    }

    const status = errors.length === 0 ? "success" : "partial";
    await finishRun(runId, status, {
      monitorsChecked,
      quotesSaved,
      alertsSent: allAlerts.length > 0 ? 1 : 0,
      errors,
    });

    console.log(`\n✅ Run #${runId} complete — ${monitorsChecked} monitors, ${quotesSaved} quotes\n`);
  } catch (fatalErr: any) {
    console.error("💥 Fatal error:", fatalErr);
    await finishRun(runId, "failed", {
      monitorsChecked,
      quotesSaved,
      alertsSent: 0,
      errors: [{ fatal: true, error: fatalErr.message }],
    });
  } finally {
    await gfAdapter.close();
    await qrAdapter.close();
    await db.end();
  }
}

main().catch(console.error);
