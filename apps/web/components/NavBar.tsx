// apps/web/components/NavBar.tsx
import Link from "next/link";

export function NavBar() {
  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        background: "rgba(8,12,24,0.9)",
        borderColor: "var(--border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--text-1)" }}
        >
          <span className="text-lg">✈️</span>
          <span>FlightTracker</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--text-2)" }}
          >
            Dashboard
          </Link>
          <Link
            href="/awards"
            className="text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--text-2)" }}
          >
            Awards
          </Link>
          <Link
            href="/alerts"
            className="text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--text-2)" }}
          >
            Alerts
          </Link>
          <Link
            href="/runs"
            className="text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--text-2)" }}
          >
            Runs
          </Link>
        </div>
      </div>
    </nav>
  );
}
