// apps/web/app/history/[monitorId]/page.tsx
import { getPriceHistory, getLatestPredictions } from "../../../lib/db";
import { monitors } from "@flight-tracker/shared";
import { PriceChart } from "../../../components/PriceChart";
import Link from "next/link";

export const revalidate = 300;

interface Props {
  params: { monitorId: string };
}

export default async function HistoryPage({ params }: Props) {
  const monitor = monitors.find((m) => m.id === params.monitorId);
  if (!monitor) {
    return (
      <div style={{ color: "var(--text-2)" }}>
        Monitor not found.{" "}
        <Link href="/" style={{ color: "var(--accent-light)" }}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  const [history, predictions] = await Promise.all([
    getPriceHistory(params.monitorId, 60),
    getLatestPredictions(),
  ]);

  const pred = predictions.find((p) => p.monitor_id === params.monitorId);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/"
        className="text-sm flex items-center gap-1 hover:opacity-80"
        style={{ color: "var(--text-3)" }}
      >
        ← Back to Dashboard
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>
          {monitor.kind === "cash"
            ? `${monitor.origin} → ${monitor.destination}`
            : `${monitor.origin} → ${monitor.destination}`}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
          {monitor.id} · Price history (last 60 days)
        </p>
      </div>

      {/* Chart */}
      <div className="glass p-6 rounded-xl">
        <PriceChart history={history} prediction={pred} />
      </div>

      {/* Stats */}
      {history.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "All-time Low",
              value: `CAD ${Math.min(...history.map((h: any) => parseFloat(h.total_price))).toFixed(2)}`,
              color: "var(--green)",
            },
            {
              label: "All-time High",
              value: `CAD ${Math.max(...history.map((h: any) => parseFloat(h.total_price))).toFixed(2)}`,
              color: "var(--red)",
            },
            {
              label: "Average",
              value: `CAD ${(
                history.reduce((sum: number, h: any) => sum + parseFloat(h.total_price), 0) /
                history.length
              ).toFixed(2)}`,
              color: "var(--text-1)",
            },
            {
              label: "Data Points",
              value: history.length.toString(),
              color: "var(--accent-light)",
            },
          ].map((stat) => (
            <div key={stat.label} className="glass p-4 rounded-xl text-center">
              <div className="text-xs mb-1" style={{ color: "var(--text-3)" }}>
                {stat.label}
              </div>
              <div
                className="price-badge text-lg font-bold"
                style={{ color: stat.color }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Prediction info */}
      {pred && (
        <div className="glass p-5 rounded-xl">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-1)" }}>
            🤖 7-Day ML Prediction
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--text-3)" }}>Predicted Min</div>
              <div className="price-badge text-base font-bold" style={{ color: "var(--green)" }}>
                CAD {parseFloat(pred.predicted_min).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--text-3)" }}>Predicted Mean</div>
              <div className="price-badge text-base font-bold" style={{ color: "var(--text-1)" }}>
                CAD {parseFloat(pred.predicted_mean).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--text-3)" }}>Confidence</div>
              <div className="price-badge text-base font-bold" style={{ color: "var(--accent-light)" }}>
                {(parseFloat(pred.confidence) * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raw data table */}
      {history.length > 0 && (
        <div className="glass p-5 rounded-xl">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-1)" }}>
            Recent Quotes
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left py-2 pr-4">Departure</th>
                  <th className="text-left py-2 pr-4">Price</th>
                  <th className="text-left py-2 pr-4">Airline</th>
                  <th className="text-left py-2 pr-4">Provider</th>
                  <th className="text-left py-2">Checked</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(-20).reverse().map((row: any, i: number) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      color: "var(--text-2)",
                    }}
                  >
                    <td className="py-2 pr-4">{row.departure_date?.toString().split("T")[0]}</td>
                    <td className="py-2 pr-4 price-badge" style={{ color: "var(--text-1)" }}>
                      CAD {parseFloat(row.total_price).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4">{row.airline}</td>
                    <td className="py-2 pr-4">{row.provider}</td>
                    <td className="py-2">{new Date(row.checked_at).toLocaleDateString("en-CA")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
