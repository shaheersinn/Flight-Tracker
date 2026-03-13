import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "✈ Flight Tracker",
  description: "Daily automated flight price monitoring — YYC/YYZ + Qatar Airways awards",
};

const NAV = [
  { href: "/",       label: "Dashboard" },
  { href: "/awards", label: "Awards"    },
  { href: "/alerts", label: "Alerts"    },
  { href: "/runs",   label: "Runs"      },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* ── Navigation bar ────────────────────────────────────── */}
        <nav style={{
          background: "var(--bg1)",
          backgroundImage: "var(--noise)",
          borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          {/* Gold hairline at very top */}
          <div style={{ height: 2, background: "linear-gradient(90deg, var(--gold), var(--gold2), transparent)" }} />

          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>

            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10,
              textDecoration: "none", color: "var(--ink0)" }}>
              <span style={{ fontSize: 18 }}>✈</span>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
                fontSize: 18, letterSpacing: "0.04em", color: "var(--ink0)" }}>
                FlightTracker
              </span>
              {/* Diamond ornament */}
              <span style={{ color: "var(--gold3)", fontSize: 7, opacity: 0.8, marginLeft: 2 }}>◆</span>
            </Link>

            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              {NAV.map(n => (
                <Link key={n.href} href={n.href} className="nav-link"
                  style={{ textDecoration: "none", fontSize: 14,
                    fontFamily: "'Cormorant Garamond', serif", fontWeight: 500,
                    letterSpacing: "0.04em" }}>
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
          {children}
        </main>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid var(--border)", marginTop: 48,
          padding: "20px 24px", textAlign: "center" }}>
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent, var(--gold-rule), transparent)",
            marginBottom: 16 }} />
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13,
            color: "var(--ink3)", letterSpacing: "0.06em" }}>
            FLIGHT TRACKER <span style={{ color: "var(--gold3)" }}>◆</span> YYC · YYZ · ISB · IST
          </p>
        </footer>
      </body>
    </html>
  );
}
