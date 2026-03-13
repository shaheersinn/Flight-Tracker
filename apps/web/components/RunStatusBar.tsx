// apps/web/components/RunStatusBar.tsx

interface Props {
  run: any;
}

export function RunStatusBar({ run }: Props) {
  const statusColors: Record<string, string> = {
    success: "var(--green)",
    partial: "var(--amber)",
    failed: "var(--red)",
    running: "var(--accent-light)",
  };

  const color = statusColors[run.status] ?? "var(--text-2)";
  const ago = run.completed_at
    ? formatAgo(new Date(run.completed_at))
    : "In progress";

  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5 rounded-xl text-sm"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <span className="status-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span style={{ color: "var(--text-2)" }}>
        Last run: <span style={{ color }}>{run.status?.toUpperCase()}</span>
      </span>
      <span style={{ color: "var(--text-3)" }}>{ago}</span>
      <span className="ml-auto text-xs" style={{ color: "var(--text-3)" }}>
        {run.monitors_checked} monitors · {run.quotes_saved} quotes · {run.alerts_sent} alerts
      </span>
    </div>
  );
}

function formatAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
