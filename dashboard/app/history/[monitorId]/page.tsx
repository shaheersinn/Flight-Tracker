import { getPriceHistory, getLatestPredictions } from "../../../lib/db";
import { ALL_MONITORS } from "../../../lib/monitors";
import { PriceChart } from "../../../components/PriceChart";
import Link from "next/link";

export const revalidate = 300;

export default async function HistoryPage({ params }: { params: { monitorId: string } }) {
  const monitor = ALL_MONITORS.find(m => m.id === params.monitorId);
  if (!monitor) return (
    <div style={{ fontFamily: "'Cormorant Garamond', serif", color: "var(--ink2)", fontSize: 16 }}>
      Monitor not found.{" "}
      <Link href="/" style={{ color: "var(--gold)" }}>← Back to Dashboard</Link>
    </div>
  );

  const [history, preds] = await Promise.all([
    getPriceHistory(params.monitorId, 60),
    getLatestPredictions(),
  ]);
  const pred = preds.find((p: any) => p.monitor_id === params.monitorId);

  const prices = history.map((h: any) => parseFloat(h.total_price));
  const minP = prices.length ? Math.min(...prices) : null;
  const maxP = prices.length ? Math.max(...prices) : null;
  const avgP = prices.length ? prices.reduce((s: number, p: number) => s + p, 0) / prices.length : null;

  return (
    <div>
      <Link href="/" style={{ fontSize: 12, color: "var(--ink3)", textDecoration: "none",
        fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.05em",
        display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 24 }}>
        ← Back to Dashboard
      </Link>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 600, color: "var(--ink0)", marginBottom: 6 }}>
          {monitor.origin}
          <span style={{ color: "var(--gold3)", margin: "0 10px", fontSize: 16 }}>→</span>
          {monitor.destination}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 6 }}>
          <div style={{ height: 1, width: 32, background: "var(--gold-rule)" }} />
          <span style={{ color: "var(--gold3)", fontSize: 7, margin: "0 8px" }}>◆</span>
          <div style={{ height: 1, width: 32, background: "var(--gold-rule)" }} />
        </div>
        <p style={{ fontSize: 12, color: "var(--ink3)", fontFamily: "'Cormorant Garamond', serif",
          letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {monitor.id} · 60-day price history
        </p>
      </div>

      {/* Chart */}
      <div className="card card-gold-rule" style={{ padding: 24, marginBottom: 20 }}>
        <PriceChart history={history} prediction={pred} />
        {pred && (
          <p style={{ fontSize: 11, color: "var(--ink3)", textAlign: "right",
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", marginTop: 8 }}>
            † Forecast values — {(parseFloat(pred.confidence) * 100).toFixed(0)}% confidence
          </p>
        )}
      </div>

      {/* Stats row */}
      {prices.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "All-time Low",  value: `CAD ${minP!.toFixed(2)}`,   color: "var(--green)" },
            { label: "All-time High", value: `CAD ${maxP!.toFixed(2)}`,   color: "var(--red)" },
            { label: "Average",       value: `CAD ${avgP!.toFixed(2)}`,   color: "var(--gold)" },
            { label: "Data Points",   value: prices.length.toString(),    color: "var(--ink0)" },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--ink3)", marginBottom: 6,
                fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.1em",
                textTransform: "uppercase" }}>{s.label}</div>
              <div className="mono" style={{ fontSize: 18, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ML prediction panel */}
      {pred && (
        <div className="card card-gold-rule" style={{ padding: "18px 20px", marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, color: "var(--ink3)", letterSpacing: "0.1em",
            textTransform: "uppercase", fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600, marginBottom: 14 }}>
            7-Day ML Price Forecast
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, textAlign: "center" }}>
            {[
              { label: "Min",  val: pred.predicted_min,  color: "var(--green)" },
              { label: "Mean", val: pred.predicted_mean, color: "var(--gold)" },
              { label: "Max",  val: pred.predicted_max,  color: "var(--red)" },
            ].map((s, i) => (
              <div key={s.label} style={{
                borderRight: i < 2 ? "1px solid var(--border)" : "none", padding: "0 16px"
              }}>
                <div style={{ fontSize: 10, color: "var(--ink3)", marginBottom: 4,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  fontFamily: "'Cormorant Garamond', serif" }}>{s.label}</div>
                <div className="mono" style={{ fontSize: 20, color: s.color }}>
                  CAD {parseFloat(s.val).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: "var(--border)", margin: "14px 0 10px" }} />
          <p style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center",
            fontFamily: "'Cormorant Garamond', serif" }}>
            Confidence: {(parseFloat(pred.confidence) * 100).toFixed(0)}%
            &nbsp;·&nbsp; Based on last 60 days of data
          </p>
        </div>
      )}

      {/* Recent quotes table */}
      {history.length > 0 && (
        <div className="card" style={{ padding: "18px 0", overflowX: "auto" }}>
          <h3 style={{ fontSize: 13, color: "var(--ink3)", letterSpacing: "0.1em",
            textTransform: "uppercase", fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600, padding: "0 20px", marginBottom: 12 }}>
            Recent Quotes
          </h3>
          <table style={{ width: "100%", fontSize: 13,
            fontFamily: "'Cormorant Garamond', serif" }}>
            <thead>
              <tr style={{ color: "var(--ink3)", fontSize: 10, letterSpacing: "0.1em",
                textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
                {["Departure", "Price", "Airline", "Provider", "Checked"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 20px",
                    fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().slice(0, 25).map((row: any, i: number) => (
                <tr key={i} style={{ color: "var(--ink2)", borderBottom: "1px solid rgba(168,120,42,0.08)" }}>
                  <td style={{ padding: "8px 20px" }}>{String(row.departure_date).split("T")[0]}</td>
                  <td style={{ padding: "8px 20px", fontWeight: 700, color: "var(--gold)" }}>
                    CAD {parseFloat(row.total_price).toFixed(2)}
                  </td>
                  <td style={{ padding: "8px 20px" }}>{row.airline}</td>
                  <td style={{ padding: "8px 20px", color: "var(--ink3)" }}>{row.provider}</td>
                  <td style={{ padding: "8px 20px", color: "var(--ink3)" }}>
                    {new Date(row.checked_at).toLocaleDateString("en-CA")}
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
