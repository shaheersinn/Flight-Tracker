// apps/web/app/page.tsx
import { monitors } from "@flight-tracker/shared";
import { getLatestQuotePerMonitor, getRecentRuns, QuoteRow, RunRow } from "@/lib/db";
import { MonitorCard } from "@/components/MonitorCard";

export const revalidate = 300; // 5 minutes

export default async function HomePage() {
  let latestQuotes: QuoteRow[] = [];
  let recentRuns: RunRow[] = [];

  try {
    [latestQuotes, recentRuns] = await Promise.all([
      getLatestQuotePerMonitor(),
      getRecentRuns(5),
    ]);
  } catch (err) {
    console.error("DB error:", err);
  }

  const quoteMap = new Map(latestQuotes.map((q) => [q.monitor_id, q]));
  const lastRun = recentRuns[0];

  const cashMonitors = monitors.filter((m) => m.kind === "cash");
  const awardMonitors = monitors.filter((m) => m.kind === "award");

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Flight Price Dashboard</h1>
        <p className="text-gray-400 text-sm">
          Monitoring {monitors.length} routes · Updates daily at 11:17 UTC
        </p>
        {lastRun && (
          <div className="mt-3 flex items-center gap-3 text-xs">
            <span
              className={`px-2 py-1 rounded-full font-medium ${
                lastRun.status === "success"
                  ? "bg-green-900 text-green-300"
                  : lastRun.status === "partial"
                  ? "bg-yellow-900 text-yellow-300"
                  : "bg-red-900 text-red-300"
              }`}
            >
              Last run: {lastRun.status}
            </span>
            <span className="text-gray-500">
              {new Date(lastRun.started_at).toLocaleString("en-CA", {
                timeZone: "America/Toronto",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              EDT
            </span>
            <span className="text-gray-500">
              {lastRun.monitors_checked} monitors · {lastRun.quotes_saved} quotes
            </span>
          </div>
        )}
      </div>

      {/* Cash Fare Section */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <span>💰</span> Cash Fare Monitors
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cashMonitors.map((monitor) => (
            <MonitorCard
              key={monitor.id}
              monitor={monitor}
              latestQuote={quoteMap.get(monitor.id) ?? null}
            />
          ))}
        </div>
      </section>

      {/* Award Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <span>🏆</span> Qatar Airways Award Monitors
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {awardMonitors.map((monitor) => (
            <MonitorCard
              key={monitor.id}
              monitor={monitor}
              latestQuote={quoteMap.get(monitor.id) ?? null}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
