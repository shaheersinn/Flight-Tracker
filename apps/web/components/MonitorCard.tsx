// apps/web/components/MonitorCard.tsx
import Link from "next/link";
import { CashMonitor } from "@flight-tracker/shared";

interface Props {
  monitor: CashMonitor;
  latestQuote?: any;
  prediction?: any;
  allTimeBest?: number | null;
}

export function MonitorCard({ monitor, latestQuote, prediction, allTimeBest }: Props) {
  const price = latestQuote?.total_price ? parseFloat(latestQuote.total_price) : null;
  const isAllTimeLow = price && allTimeBest && price <= allTimeBest;
  const isBelowThreshold = price && monitor.alertThreshold && price < monitor.alertThreshold;

  // Vs prediction
  let vsPrediction: number | null = null;
  if (price && prediction?.predicted_mean) {
    vsPrediction = price - parseFloat(prediction.predicted_mean);
  }

  const statusColor = isAllTimeLow
    ? "var(--green)"
    : isBelowThreshold
    ? "var(--amber)"
    : "var(--text-2)";

  const dateLabel =
    monitor.dateFrom === monitor.dateTo
      ? monitor.dateFrom
      : `${monitor.dateFrom} → ${monitor.dateTo}`;

  return (
    <Link href={`/history/${monitor.id}`} className="block">
      <div
        className="glass p-5 rounded-xl cursor-pointer transition-all duration-200"
        style={
          isAllTimeLow
            ? { borderColor: "rgba(34,197,94,0.4)", boxShadow: "0 0 20px rgba(34,197,94,0.1)" }
            : {}
        }
      >
        {/* Route Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xl font-bold" style={{ color: "var(--text-1)" }}>
              {monitor.origin}
            </span>
            <span className="mx-2" style={{ color: "var(--text-3)" }}>→</span>
            <span className="text-xl font-bold" style={{ color: "var(--text-1)" }}>
              {monitor.destination}
            </span>
          </div>
          {isAllTimeLow && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: "rgba(34,197,94,0.15)", color: "var(--green)" }}
            >
              🏆 BEST EVER
            </span>
          )}
          {isBelowThreshold && !isAllTimeLow && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: "rgba(245,158,11,0.15)", color: "var(--amber)" }}
            >
              🎯 DEAL
            </span>
          )}
        </div>

        {/* Date window */}
        <p className="text-xs mb-3" style={{ color: "var(--text-3)" }}>
          📅 {dateLabel}
        </p>

        {/* Price */}
        {price ? (
          <div className="mb-3">
            <span
              className="price-badge text-3xl font-bold"
              style={{ color: statusColor }}
            >
              CAD {price.toFixed(2)}
            </span>
            {allTimeBest && price !== allTimeBest && (
              <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                Best ever: CAD {allTimeBest.toFixed(2)}
              </div>
            )}
          </div>
        ) : (
          <div
            className="price-badge text-2xl font-bold mb-3"
            style={{ color: "var(--text-3)" }}
          >
            —
          </div>
        )}

        {/* Flight details */}
        {latestQuote && (
          <div className="text-xs space-y-1 mb-3" style={{ color: "var(--text-2)" }}>
            <div>✈️ {latestQuote.airline}{latestQuote.flight_number ? ` ${latestQuote.flight_number}` : ""}</div>
            <div>
              ⏱ {latestQuote.duration} ·{" "}
              {latestQuote.stops === 0 ? "Nonstop" : `${latestQuote.stops} stop(s)`}
            </div>
            <div>📅 Departs {latestQuote.departure_date?.toString().split("T")[0]}</div>
          </div>
        )}

        {/* Prediction */}
        {prediction && vsPrediction !== null && (
          <div
            className="text-xs p-2 rounded-lg mt-2"
            style={{ background: "var(--bg-3)" }}
          >
            <span style={{ color: "var(--text-3)" }}>vs 7-day forecast: </span>
            <span
              className="price-badge font-semibold"
              style={{ color: vsPrediction < 0 ? "var(--green)" : vsPrediction > 0 ? "var(--red)" : "var(--text-2)" }}
            >
              {vsPrediction > 0 ? "+" : ""}CAD {vsPrediction.toFixed(2)}
            </span>
            <span className="ml-2" style={{ color: "var(--text-3)" }}>
              ({(parseFloat(prediction.confidence) * 100).toFixed(0)}% confidence)
            </span>
          </div>
        )}

        {/* Threshold */}
        {monitor.alertThreshold && (
          <div className="text-xs mt-2" style={{ color: "var(--text-3)" }}>
            Alert threshold: CAD {monitor.alertThreshold}
          </div>
        )}

        {/* via / provider */}
        {latestQuote?.provider && (
          <div className="text-xs mt-2" style={{ color: "var(--text-3)" }}>
            via {latestQuote.provider}
          </div>
        )}
      </div>
    </Link>
  );
}
