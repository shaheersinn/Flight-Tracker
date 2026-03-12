// apps/web/app/runs/page.tsx
import { getRecentRuns, RunRow } from "@/lib/db";

export const revalidate = 60;

function statusColor(status: string) {
  return status === "success"
    ? "bg-green-900 text-green-300"
    : status === "partial"
    ? "bg-yellow-900 text-yellow-300"
    : status === "running"
    ? "bg-blue-900 text-blue-300"
    : "bg-red-900 text-red-300";
}

export default async function RunsPage() {
  let runs: RunRow[] = [];
  try {
    runs = await getRecentRuns(30);
  } catch (err) {
    console.error(err);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Scraper Run Logs</h1>

      {runs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
          No runs yet — the scraper hasn&apos;t run yet.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3">Run</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Started</th>
                <th className="text-left px-4 py-3">Duration</th>
                <th className="text-left px-4 py-3">Monitors</th>
                <th className="text-left px-4 py-3">Quotes</th>
                <th className="text-left px-4 py-3">Alerts</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const duration =
                  run.completed_at && run.started_at
                    ? Math.round(
                        (new Date(run.completed_at).getTime() -
                          new Date(run.started_at).getTime()) /
                          1000
                      )
                    : null;
                return (
                  <tr
                    key={run.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/20"
                  >
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                      #{run.id}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(run.started_at).toLocaleString("en-CA", {
                        timeZone: "America/Toronto",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {duration != null ? `${duration}s` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {run.monitors_checked}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {run.quotes_saved}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {run.alerts_sent > 0 ? (
                        <span className="text-green-400">{run.alerts_sent}</span>
                      ) : (
                        <span className="text-gray-600">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
