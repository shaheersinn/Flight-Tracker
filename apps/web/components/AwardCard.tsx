// apps/web/components/AwardCard.tsx
import { AwardMonitor } from "@flight-tracker/shared";

interface Props {
  monitor: AwardMonitor;
  latestQuote?: any;
}

export function AwardCard({ monitor, latestQuote }: Props) {
  const points = latestQuote?.points_cost;
  const surcharge = latestQuote?.cash_surcharge;
  const hasAvailability = !!points;

  const [year, month] = monitor.month.split("-");
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString("en-CA", { month: "long" });

  return (
    <div
      className="glass p-5 rounded-xl transition-all duration-200"
      style={
        hasAvailability
          ? { borderColor: "rgba(67,97,238,0.4)", boxShadow: "0 0 20px rgba(67,97,238,0.1)" }
          : {}
      }
    >
      {/* Route Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-xl font-bold" style={{ color: "var(--text-1)" }}>
            {monitor.origin}
          </span>
          <span className="mx-2" style={{ color: "var(--text-3)" }}>→</span>
          <span className="text-xl font-bold" style={{ color: "var(--text-1)" }}>
            {monitor.destination}
          </span>
        </div>
        <div
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            background: hasAvailability ? "rgba(67,97,238,0.2)" : "rgba(255,255,255,0.05)",
            color: hasAvailability ? "var(--accent-light)" : "var(--text-3)",
          }}
        >
          {hasAvailability ? "✓ Available" : "Monitoring..."}
        </div>
      </div>

      {/* Destination label */}
      <p className="text-xs mb-1" style={{ color: "var(--text-2)" }}>
        {monitor.destinationLabel}
      </p>

      {/* Month */}
      <p className="text-xs mb-3" style={{ color: "var(--text-3)" }}>
        📅 {monthName} {year} · {monitor.cabin ?? "business"} class
      </p>

      {/* Points */}
      {hasAvailability ? (
        <div className="mb-3">
          <div
            className="price-badge text-2xl font-bold"
            style={{ color: "var(--accent-light)" }}
          >
            {parseInt(points).toLocaleString()} Avios
          </div>
          {surcharge && (
            <div className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
              + CAD {parseFloat(surcharge).toFixed(2)} taxes & fees
            </div>
          )}
          <a
            href="https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "var(--accent-dim)",
              color: "var(--accent-light)",
              border: "1px solid rgba(67,97,238,0.3)",
            }}
          >
            Book on Qatar →
          </a>
        </div>
      ) : (
        <div className="mb-3" style={{ color: "var(--text-3)" }}>
          <div className="text-sm">No award availability found yet</div>
          <div className="text-xs mt-1">Checking daily...</div>
        </div>
      )}

      {/* Airline badge */}
      <div className="text-xs mt-2 flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
        <span>✈️</span>
        <span>{monitor.airline} · Privilege Club</span>
      </div>
    </div>
  );
}
