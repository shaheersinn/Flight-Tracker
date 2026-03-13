import { getRecentRuns } from "../../lib/db";

export const revalidate = 60;

export default async function RunsPage() {
  const runs = await getRecentRuns(20);
  const colors: Record<string, string> = {
    success: "var(--green)", partial: "var(--amber)",
    failed: "var(--red)", running: "var(--gold)",
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32,
          fontWeight: 600, color: "var(--ink0)", marginBottom: 6 }}>
          Scraper Runs
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 8 }}>
          <div style={{ height: 1, width: 32, background: "var(--gold-rule)" }} />
          <span style={{ color: "var(--gold3)", fontSize: 7, margin: "0 8px" }}>◆</span>
          <div style={{ height: 1, width: 32, background: "var(--gold-rule)" }} />
        </div>
        <p style={{ fontSize: 13, color: "var(--ink3)", fontFamily: "'Cormorant Garamond', serif",
          fontStyle: "italic" }}>
          Daily GitHub Actions job history
        </p>
      </div>

      <div className="card card-gold-rule" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontFamily: "'Cormorant Garamond', serif", fontSize: 13 }}>
          <thead>
            <tr style={{ fontSize: 10, color: "var(--ink3)", letterSpacing: "0.1em",
              textTransform: "uppercase", borderBottom: "2px solid var(--border)" }}>
              {["Run", "Status", "Started (ET)", "Duration", "Monitors", "Quotes", "Alerts"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "12px 20px", fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r: any) => {
              const c = colors[r.status] ?? "var(--ink2)";
              const dur = r.completed_at
                ? `${Math.round(
                    (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000
                  )}s`
                : "—";
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)",
                  color: "var(--ink2)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: 700, color: "var(--ink3)",
                    fontSize: 12 }}>#{r.id}</td>
                  <td style={{ padding: "10px 20px" }}>
                    <span className="badge" style={{ color: c, borderColor: `${c}50`, fontSize: 9 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%",
                        background: c, display: "inline-block" }} />
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 20px", fontSize: 12 }}>
                    {new Date(r.started_at).toLocaleString("en-CA", {
                      timeZone: "America/Toronto", dateStyle: "short", timeStyle: "short",
                    })}
                  </td>
                  <td style={{ padding: "10px 20px", fontVariantNumeric: "tabular-nums" }}>{dur}</td>
                  <td style={{ padding: "10px 20px" }}>{r.monitors_checked}</td>
                  <td style={{ padding: "10px 20px" }}>{r.quotes_saved}</td>
                  <td style={{ padding: "10px 20px" }}>{r.alerts_sent}</td>
                </tr>
              );
            })}
            {!runs.length && (
              <tr><td colSpan={7} style={{ padding: "40px 20px", textAlign: "center",
                color: "var(--ink3)", fontStyle: "italic" }}>
                No runs yet. Trigger the GitHub Actions workflow to start.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
