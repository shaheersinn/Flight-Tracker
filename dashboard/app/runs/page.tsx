import { getRecentRuns } from "../../lib/db";

export const revalidate = 60;

export default async function RunsPage() {
  const runs = await getRecentRuns(20);
  const colors: Record<string, string> = {
    success:"var(--green)", partial:"var(--amber)",
    failed:"var(--red)", running:"var(--accent2)",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📋 Scraper Runs</h1>
        <p className="text-sm mt-1" style={{ color:"var(--text2)" }}>
          Daily GitHub Actions job history
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs" style={{ color:"var(--text3)", borderBottom:"1px solid var(--border)" }}>
              {["Run","Status","Started","Duration","Monitors","Quotes","Alerts"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r: any) => {
              const c = colors[r.status] ?? "var(--text2)";
              const dur = r.completed_at
                ? `${Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s`
                : "—";
              return (
                <tr key={r.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.03)", color:"var(--text2)" }}>
                  <td className="px-4 py-3 mono text-xs">#{r.id}</td>
                  <td className="px-4 py-3">
                    <span className="badge" style={{ background:`${c}18`, color:c }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:c, display:"inline-block" }} />
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(r.started_at).toLocaleString("en-CA", {
                      timeZone:"America/Toronto", dateStyle:"short", timeStyle:"short"
                    })}
                  </td>
                  <td className="px-4 py-3 mono text-xs">{dur}</td>
                  <td className="px-4 py-3 text-xs">{r.monitors_checked}</td>
                  <td className="px-4 py-3 text-xs">{r.quotes_saved}</td>
                  <td className="px-4 py-3 text-xs">{r.alerts_sent}</td>
                </tr>
              );
            })}
            {!runs.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm"
                style={{ color:"var(--text3)" }}>
                No runs yet. Trigger the GitHub Actions workflow to start.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
