// apps/web/app/runs/page.tsx
import { getRecentRuns } from "../../lib/db";

export const revalidate = 60;

export default async function RunsPage() {
  const runs = await getRecentRuns(20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>
          Scraper Runs
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
          History of daily automated scraping jobs
        </p>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-xs"
              style={{
                color: "var(--text-3)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th className="text-left px-5 py-3">Run #</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Started</th>
              <th className="text-left px-5 py-3">Duration</th>
              <th className="text-left px-5 py-3">Monitors</th>
              <th className="text-left px-5 py-3">Quotes</th>
              <th className="text-left px-5 py-3">Alerts</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run: any) => {
              const statusColors: Record<string, string> = {
                success: "var(--green)",
                partial: "var(--amber)",
                failed: "var(--red)",
                running: "var(--accent-light)",
              };
              const color = statusColors[run.status] ?? "var(--text-2)";
              const duration =
                run.completed_at && run.started_at
                  ? `${Math.round(
                      (new Date(run.completed_at).getTime() -
                        new Date(run.started_at).getTime()) /
                        1000
                    )}s`
                  : "—";

              return (
                <tr
                  key={run.id}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    color: "var(--text-2)",
                  }}
                >
                  <td className="px-5 py-3 font-mono text-xs">#{run.id}</td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: `${color}20`, color }}
                    >
                      <span
                        className="status-dot"
                        style={{ background: color, width: 6, height: 6 }}
                      />
                      {run.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {new Date(run.started_at).toLocaleString("en-CA", {
                      timeZone: "America/Toronto",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-5 py-3 text-xs font-mono">{duration}</td>
                  <td className="px-5 py-3 text-xs">{run.monitors_checked}</td>
                  <td className="px-5 py-3 text-xs">{run.quotes_saved}</td>
                  <td className="px-5 py-3 text-xs">{run.alerts_sent}</td>
                </tr>
              );
            })}
            {runs.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-8 text-center text-sm"
                  style={{ color: "var(--text-3)" }}
                >
                  No runs yet. Trigger the GitHub Actions workflow to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
