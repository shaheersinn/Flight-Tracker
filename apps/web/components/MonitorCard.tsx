// apps/web/components/MonitorCard.tsx
import { Monitor, CashMonitor, AwardMonitor } from "@flight-tracker/shared";
import { QuoteRow } from "@/lib/db";
import Link from "next/link";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleString("en-CA", {
    month: "long",
    year: "numeric",
  });
}

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MonitorCard({
  monitor,
  latestQuote,
}: {
  monitor: Monitor;
  latestQuote: QuoteRow | null;
}) {
  const isCash = monitor.kind === "cash";
  const cm = monitor as CashMonitor;
  const am = monitor as AwardMonitor;

  return (
    <Link href={`/history/${monitor.id}`} className="block group">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-sky-700 transition-colors">
        {/* Route */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">
              {isCash ? `${cm.origin} → ${cm.destination}` : `${am.origin} → ${am.destination}`}
            </span>
            {!isCash && (
              <span className="text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full">
                Award
              </span>
            )}
          </div>
          <span className="text-sky-500 text-xs group-hover:text-sky-400">
            View →
          </span>
        </div>

        {/* Date window or month */}
        <div className="text-gray-400 text-xs mb-3">
          {isCash ? (
            cm.dateFrom === cm.dateTo ? (
              formatDate(cm.dateFrom)
            ) : (
              `${formatDate(cm.dateFrom)} – ${formatDate(cm.dateTo)}`
            )
          ) : (
            <>
              {formatMonth(am.month)} · {am.cabin ?? "Business"} class
            </>
          )}
        </div>

        {/* Price */}
        {latestQuote ? (
          <div className="mt-2">
            {latestQuote.total_price != null ? (
              <div className="text-2xl font-bold text-green-400">
                CAD ${latestQuote.total_price.toFixed(2)}
              </div>
            ) : latestQuote.points_cost != null ? (
              <div className="text-2xl font-bold text-purple-400">
                {latestQuote.points_cost.toLocaleString()} Avios
                {latestQuote.cash_surcharge != null && (
                  <span className="text-sm font-normal text-gray-400 ml-1">
                    + ${latestQuote.cash_surcharge} {latestQuote.currency}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-sm">No data yet</div>
            )}

            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>via {latestQuote.provider}</span>
              <span>{latestQuote.airline}</span>
              <span>{timeSince(latestQuote.checked_at)}</span>
            </div>

            {latestQuote.departure_date && (
              <div className="text-xs text-gray-500 mt-1">
                Departs {formatDate(latestQuote.departure_date)}
                {latestQuote.stops === 0 && (
                  <span className="ml-2 text-green-600">Nonstop</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-600 text-sm mt-2">No data yet</div>
        )}

        {/* Monitor ID */}
        <div className="mt-3 text-gray-700 text-xs font-mono truncate">
          {monitor.id}
        </div>
      </div>
    </Link>
  );
}
