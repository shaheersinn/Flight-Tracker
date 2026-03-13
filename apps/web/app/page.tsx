// apps/web/app/page.tsx
import {
  getLatestQuotes,
  getLatestPredictions,
  getAllTimeBest,
  getRecentRuns,
  getRapidApiUsage,
} from "../lib/db";
import { monitors, cashMonitors, awardMonitors } from "@flight-tracker/shared";
import { MonitorCard } from "../components/MonitorCard";
import { AwardCard } from "../components/AwardCard";
import { RunStatusBar } from "../components/RunStatusBar";

export const revalidate = 300; // Revalidate every 5 minutes

export default async function HomePage() {
  const [quotes, predictions, bestPrices, runs, rapidApiUsed] =
    await Promise.all([
      getLatestQuotes(),
      getLatestPredictions(),
      getAllTimeBest(),
      getRecentRuns(1),
      getRapidApiUsage(),
    ]);

  const lastRun = runs[0] ?? null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-1)" }}>
            ✈️ Flight Price Tracker
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            Daily automated monitoring — YYC/YYZ routes + Qatar Airways awards
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* RapidAPI Usage */}
          <div className="glass px-3 py-1.5 text-xs flex items-center gap-2">
            <span style={{ color: "var(--text-2)" }}>RapidAPI</span>
            <span
              className="price-badge text-sm"
              style={{
                color: rapidApiUsed >= 10 ? "var(--red)" : rapidApiUsed >= 7 ? "var(--amber)" : "var(--green)",
              }}
            >
              {rapidApiUsed}/10
            </span>
            <span style={{ color: "var(--text-3)" }}>this month</span>
          </div>
        </div>
      </div>

      {/* Last Run Status */}
      {lastRun && <RunStatusBar run={lastRun} />}

      {/* Cash Monitors */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-1)" }}>
          <span>🏷️</span> Domestic Cash Fares
          <span className="text-sm font-normal ml-1" style={{ color: "var(--text-3)" }}>
            ({cashMonitors.length} monitors)
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cashMonitors.map((monitor) => {
            const quote = quotes.find((q) => q.monitor_id === monitor.id);
            const pred = predictions.find((p) => p.monitor_id === monitor.id);
            const best = bestPrices.find((b) => b.monitor_id === monitor.id);
            return (
              <MonitorCard
                key={monitor.id}
                monitor={monitor}
                latestQuote={quote}
                prediction={pred}
                allTimeBest={best?.best_price ? parseFloat(best.best_price) : null}
              />
            );
          })}
        </div>
      </section>

      {/* Award Monitors */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-1)" }}>
          <span>🎫</span> Qatar Airways Award Availability
          <span className="text-sm font-normal ml-1" style={{ color: "var(--text-3)" }}>
            (Business / Qsuite)
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {awardMonitors.map((monitor) => {
            const quote = quotes.find((q) => q.monitor_id === monitor.id);
            return (
              <AwardCard
                key={monitor.id}
                monitor={monitor}
                latestQuote={quote}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
