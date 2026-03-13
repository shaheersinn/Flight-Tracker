// apps/web/app/alerts/page.tsx
import { getRecentAlerts } from "../../lib/db";

export const revalidate = 60;

const ALERT_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  new_all_time_low: { label: "New All-Time Low", color: "var(--green)", emoji: "🏆" },
  significant_drop: { label: "Significant Drop", color: "var(--amber)", emoji: "📉" },
  threshold_breach: { label: "Threshold Breach", color: "var(--amber)", emoji: "🎯" },
  award_available: { label: "Award Available", color: "var(--accent-light)", emoji: "🎫" },
  anomaly_detected: { label: "Anomaly Detected", color: "#e879f9", emoji: "⚡" },
};

export default async function AlertsPage() {
  const alerts = await getRecentAlerts(30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>
          Alert History
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
          Recent Telegram alerts triggered by price changes
        </p>
      </div>

      <div className="space-y-3">
        {alerts.map((alert: any) => {
          const meta = ALERT_LABELS[alert.alert_type] ?? {
            label: alert.alert_type,
            color: "var(--text-2)",
            emoji: "🔔",
          };

          return (
            <div key={alert.id} className="glass p-4 rounded-xl flex gap-4">
              <div
                className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ background: `${meta.color}18` }}
              >
                {meta.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: `${meta.color}20`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-3)" }}>
                    {alert.monitor_id}
                  </span>
                </div>
                {alert.total_price && (
                  <div
                    className="price-badge text-lg font-bold mt-1"
                    style={{ color: "var(--text-1)" }}
                  >
                    CAD {parseFloat(alert.total_price).toFixed(2)}
                  </div>
                )}
                {alert.points_cost && (
                  <div
                    className="price-badge text-lg font-bold mt-1"
                    style={{ color: "var(--accent-light)" }}
                  >
                    {parseInt(alert.points_cost).toLocaleString()} Avios
                  </div>
                )}
                {alert.departure_date && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                    Departs {alert.departure_date?.toString().split("T")[0]} · {alert.airline}
                  </div>
                )}
              </div>
              <div
                className="text-xs text-right flex-shrink-0"
                style={{ color: "var(--text-3)" }}
              >
                {new Date(alert.sent_at).toLocaleString("en-CA", {
                  timeZone: "America/Toronto",
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
            </div>
          );
        })}

        {alerts.length === 0 && (
          <div
            className="glass p-8 rounded-xl text-center text-sm"
            style={{ color: "var(--text-3)" }}
          >
            No alerts yet. Alerts will appear here once the tracker detects price drops.
          </div>
        )}
      </div>
    </div>
  );
}
