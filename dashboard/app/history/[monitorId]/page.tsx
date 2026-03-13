import { getPriceHistory, getLatestPredictions } from "../../../lib/db";
import { ALL_MONITORS } from "../../../lib/monitors";
import { PriceChart } from "../../../components/PriceChart";
import Link from "next/link";

export const revalidate = 300;

export default async function HistoryPage({ params }: { params: { monitorId: string } }) {
  const monitor = ALL_MONITORS.find(m => m.id === params.monitorId);
  if (!monitor) return (
    <div style={{ color:"var(--text2)" }}>
      Monitor not found. <Link href="/" style={{ color:"var(--accent2)" }}>← Back</Link>
    </div>
  );

  const [history, preds] = await Promise.all([
    getPriceHistory(params.monitorId, 60),
    getLatestPredictions(),
  ]);
  const pred = preds.find(p => p.monitor_id === params.monitorId);

  const prices = history.map((h: any) => parseFloat(h.total_price));
  const minP = prices.length ? Math.min(...prices) : null;
  const maxP = prices.length ? Math.max(...prices) : null;
  const avgP = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : null;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm flex items-center gap-1 hover:opacity-70"
        style={{ color:"var(--text3)" }}>← Back to Dashboard</Link>

      <div>
        <h1 className="text-2xl font-bold">
          {monitor.origin} → {monitor.destination}
        </h1>
        <p className="text-sm mt-1" style={{ color:"var(--text2)" }}>
          {monitor.id} · price history (60 days)
        </p>
      </div>

      <div className="card p-6"><PriceChart history={history} prediction={pred} /></div>

      {prices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label:"All-time Low", value:`CAD ${minP!.toFixed(2)}`, color:"var(--green)" },
            { label:"All-time High", value:`CAD ${maxP!.toFixed(2)}`, color:"var(--red)" },
            { label:"Average", value:`CAD ${avgP!.toFixed(2)}`, color:"var(--text1)" },
            { label:"Data Points", value:prices.length.toString(), color:"var(--accent2)" },
          ].map(s => (
            <div key={s.label} className="card p-4 text-center">
              <div className="text-xs mb-1" style={{ color:"var(--text3)" }}>{s.label}</div>
              <div className="mono text-lg font-bold" style={{ color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {pred && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-3">🤖 7-Day ML Prediction</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label:"Min", val:pred.predicted_min, color:"var(--green)" },
              { label:"Mean", val:pred.predicted_mean, color:"var(--text1)" },
              { label:"Max", val:pred.predicted_max, color:"var(--red)" },
            ].map(s => (
              <div key={s.label}>
                <div className="text-xs mb-1" style={{ color:"var(--text3)" }}>{s.label}</div>
                <div className="mono font-bold" style={{ color:s.color }}>
                  CAD {parseFloat(s.val).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs mt-2 text-center" style={{ color:"var(--text3)" }}>
            Confidence: {(parseFloat(pred.confidence) * 100).toFixed(0)}%
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card p-5 overflow-x-auto">
          <h3 className="text-sm font-semibold mb-3">Recent Quotes</h3>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color:"var(--text3)", borderBottom:"1px solid var(--border)" }}>
                {["Departure","Price","Airline","Provider","Checked"].map(h => (
                  <th key={h} className="text-left py-2 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().slice(0,25).map((row: any, i: number) => (
                <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.03)", color:"var(--text2)" }}>
                  <td className="py-2 pr-4">{String(row.departure_date).split("T")[0]}</td>
                  <td className="py-2 pr-4 mono font-medium" style={{ color:"var(--text1)" }}>
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
      )}
    </div>
  );
}
