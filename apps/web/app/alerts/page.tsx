// apps/web/app/alerts/page.tsx
import { getRecentAlerts, AlertRow } from "@/lib/db";

export const revalidate = 60;

const alertTypeStyle: Record<string, string> = {
  new_low: "bg-green-900 text-green-300",
  price_drop: "bg-blue-900 text-blue-300",
  award_available: "bg-purple-900 text-purple-300",
  threshold_breach: "bg-yellow-900 text-yellow-300",
};

export default async function AlertsPage() {
  let alerts: AlertRow[] = [];
  try {
    alerts = await getRecentAlerts(100);
  } catch (err) {
    console.error(err);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Alert History</h1>

      {alerts.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
          No alerts sent yet.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3">Sent At</th>
                <th className="text-left px-4 py-3">Monitor</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr
                  key={alert.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/20"
                >
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(alert.sent_at).toLocaleString("en-CA", {
                      timeZone: "America/Toronto",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">
                    {alert.monitor_id}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        alertTypeStyle[alert.alert_type] ??
                        "bg-gray-800 text-gray-300"
                      }`}
                    >
                      {alert.alert_type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">
                    {alert.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
