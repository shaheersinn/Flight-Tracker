// apps/worker/src/scraper.ts
// Main orchestrator: runs all monitors, evaluates alert conditions,
// collects everything, sends ONE Telegram digest at the end.

import {
  monitors,
  cashMonitors,
  awardMonitors,
  CashMonitor,
  AwardMonitor,
  FlightResult,
  AlertRecord,
  RunSummary,
} from "@flight-tracker/shared";

import {
  getHistoricalBest,
  getLastCheckedPrice,
  saveQuote,
  saveAlert,
  startRun,
  finishRun,
  canUseRapidApi,
} from "./db";

import { RapidApiGoogleFlightsAdapter } from "./adapters/google-flights-rapid";
import { GoogleFlightsPlaywrightAdapter } from "./adapters/google-flights-playwright";
import { KayakAdapter } from "./adapters/kayak";
import { QatarAwardAdapter } from "./adapters/qatar-award";
import { TelegramAlerter } from "./telegram/bot";
import { buildFingerprint } from "./adapters/base";

const PRICE_DROP_THRESHOLD_PCT = 15; // Alert if price drops 15%+

export async function runScraper(): Promise<void> {
  const runId = await startRun();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚀 Flight Tracker Run #${runId} — ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}\n`);

  const summary: RunSummary = {
    startedAt: new Date().toISOString(),
    monitorsChecked: 0,
    quotesFound: 0,
    alertsTriggered: 0,
    errors: [],
    cashResults: [],
    awardResults: [],
    alerts: [],
  };

  // ─── Initialize Adapters ────────────────────────────────────────
  const rapidApi = new RapidApiGoogleFlightsAdapter();
  const googlePlaywright = new GoogleFlightsPlaywrightAdapter();
  const kayak = new KayakAdapter();
  const qatarAward = new QatarAwardAdapter();
  const telegram = new TelegramAlerter();

  const rapidAvailable = await canUseRapidApi() && !!process.env.RAPIDAPI_KEY;
  console.log(`📡 RapidAPI available this month: ${rapidAvailable ? "YES" : "NO (limit reached or no key)"}`);

  // ─── Cash Monitors ───────────────────────────────────────────────
  console.log(`\n📋 Processing ${cashMonitors.length} cash fare monitors...\n`);

  for (const monitor of cashMonitors) {
    console.log(`  ▶ ${monitor.id} (${monitor.origin}→${monitor.destination} ${monitor.dateFrom}–${monitor.dateTo})`);
    summary.monitorsChecked++;

    let results: FlightResult[] = [];

    try {
      // Strategy: try RapidAPI first (if budget allows), then Playwright, then Kayak
      if (rapidAvailable) {
        console.log(`    → Trying RapidAPI...`);
        results = await rapidApi.scrapeWindow(monitor);
        console.log(`    → RapidAPI: ${results.length} results`);
      }

      if (results.length === 0) {
        console.log(`    → Trying Google Flights (Playwright)...`);
        results = await googlePlaywright.scrapeWindow(monitor);
        console.log(`    → Playwright: ${results.length} results`);
      }

      if (results.length === 0) {
        console.log(`    → Trying Kayak fallback...`);
        results = await kayak.scrapeWindow(monitor);
        console.log(`    → Kayak: ${results.length} results`);
      }

      // Save quotes and evaluate alerts
      for (const result of results) {
        const fp = buildFingerprint(result);
        await saveQuote({
          monitorId: monitor.id,
          provider: result.provider,
          kind: "cash",
          origin: result.origin,
          destination: result.destination,
          departureDate: result.departureDate,
          totalPrice: result.totalPrice,
          currency: result.currency ?? "CAD",
          airline: result.airline,
          flightNumber: result.flightNumber,
          stops: result.stops,
          duration: result.duration,
          bookingUrl: result.bookingUrl,
          checkedAt: result.scrapedAt,
          fingerprint: fp,
        });
        summary.quotesFound++;
        summary.cashResults.push(result);
      }

      // Evaluate alert conditions for cheapest result
      if (results.length > 0) {
        const cheapest = results.reduce((min, r) =>
          (r.totalPrice ?? Infinity) < (min.totalPrice ?? Infinity) ? r : min
        );
        const alert = await evaluateCashAlert(monitor, cheapest);
        if (alert) {
          summary.alerts.push(alert);
          summary.alertsTriggered++;
        }
      }
    } catch (err: any) {
      const msg = `${monitor.id}: ${err.message}`;
      console.error(`    ❌ Error: ${msg}`);
      summary.errors.push(msg);
    }
  }

  // ─── Award Monitors ──────────────────────────────────────────────
  console.log(`\n🎫 Processing ${awardMonitors.length} Qatar award monitors...\n`);

  for (const monitor of awardMonitors) {
    console.log(`  ▶ ${monitor.id} (${monitor.origin}→${monitor.destination} ${monitor.month})`);
    summary.monitorsChecked++;

    try {
      const results = await qatarAward.scrapeMonth(monitor);
      console.log(`    → ${results.length} award slots found`);

      for (const result of results) {
        const fp = buildFingerprint(result);
        await saveQuote({
          monitorId: monitor.id,
          provider: result.provider,
          kind: "award",
          origin: result.origin,
          destination: result.destination,
          departureDate: result.departureDate,
          pointsCost: result.pointsCost,
          cashSurcharge: result.cashSurcharge,
          currency: "CAD",
          cabin: result.cabin,
          airline: result.airline,
          stops: result.stops,
          duration: result.duration,
          bookingUrl: result.bookingUrl,
          checkedAt: result.scrapedAt,
          fingerprint: fp,
        });
        summary.quotesFound++;
        summary.awardResults.push(result);
      }

      // Award alert: any new availability is worth flagging
      if (results.length > 0) {
        const cheapest = results.reduce((min, r) =>
          (r.pointsCost ?? Infinity) < (min.pointsCost ?? Infinity) ? r : min
        );
        summary.alerts.push({
          monitorId: monitor.id,
          alertType: "award_available",
          quote: cheapest,
        });
        summary.alertsTriggered++;
      }
    } catch (err: any) {
      const msg = `${monitor.id}: ${err.message}`;
      console.error(`    ❌ Error: ${msg}`);
      summary.errors.push(msg);
    }
  }

  // ─── Send ONE consolidated Telegram digest ───────────────────────
  console.log(`\n📨 Sending Telegram digest...`);
  try {
    const msgId = await telegram.sendDailyDigest(summary);

    // Save alert records to DB
    for (const alert of summary.alerts) {
      await saveAlert({
        monitorId: alert.monitorId,
        alertType: alert.alertType,
        message: `${alert.alertType} for ${alert.monitorId}`,
        telegramMessageId: msgId ?? undefined,
      });
    }
  } catch (err: any) {
    summary.errors.push(`Telegram: ${err.message}`);
    console.error(`❌ Telegram failed: ${err.message}`);
  }

  // ─── Cleanup ─────────────────────────────────────────────────────
  await googlePlaywright.close().catch(() => {});
  await kayak.close().catch(() => {});
  await qatarAward.close().catch(() => {});

  // ─── Finish Run ──────────────────────────────────────────────────
  const status =
    summary.errors.length === 0
      ? "success"
      : summary.monitorsChecked > 0
      ? "partial"
      : "failed";

  await finishRun(runId, status, {
    monitorsChecked: summary.monitorsChecked,
    quotesFound: summary.quotesFound,
    alertsSent: summary.alertsTriggered,
    errors: summary.errors,
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Run #${runId} complete — Status: ${status.toUpperCase()}`);
  console.log(`   Monitors: ${summary.monitorsChecked} | Quotes: ${summary.quotesFound} | Alerts: ${summary.alertsTriggered}`);
  if (summary.errors.length > 0) {
    console.log(`   Errors (${summary.errors.length}):`);
    summary.errors.forEach((e) => console.log(`     - ${e}`));
  }
  console.log(`${"=".repeat(60)}\n`);
}

// ─── Alert Evaluation ─────────────────────────────────────────────

async function evaluateCashAlert(
  monitor: CashMonitor,
  result: FlightResult
): Promise<AlertRecord | null> {
  if (!result.totalPrice) return null;

  const historicalBest = await getHistoricalBest(monitor.id);
  const lastPrice = await getLastCheckedPrice(monitor.id);

  // 1. New all-time low
  if (!historicalBest || result.totalPrice < historicalBest) {
    return {
      monitorId: monitor.id,
      alertType: "new_all_time_low",
      quote: result,
      previousBest: historicalBest ?? undefined,
    };
  }

  // 2. Significant drop (15%+ from last check)
  if (lastPrice) {
    const dropPct = ((lastPrice - result.totalPrice) / lastPrice) * 100;
    if (dropPct >= PRICE_DROP_THRESHOLD_PCT) {
      return {
        monitorId: monitor.id,
        alertType: "significant_drop",
        quote: result,
        previousBest: historicalBest,
        dropPercent: dropPct,
      };
    }
  }

  // 3. Threshold breach
  if (monitor.alertThreshold && result.totalPrice < monitor.alertThreshold) {
    return {
      monitorId: monitor.id,
      alertType: "threshold_breach",
      quote: result,
      previousBest: historicalBest ?? undefined,
    };
  }

  return null;
}
