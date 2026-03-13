import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "✈ Flight Tracker",
  description: "Daily automated flight price monitoring — YYC/YYZ + Qatar Airways awards",
};

const NAV = [
  { href: "/",        label: "Dashboard" },
  { href: "/awards",  label: "Awards"    },
  { href: "/alerts",  label: "Alerts"    },
  { href: "/runs",    label: "Runs"      },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{
          background: "rgba(7,9,15,0.85)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(14px)",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-2 font-semibold text-sm"
              style={{ color: "var(--text1)" }}>
              <span className="text-lg">✈</span> FlightTracker
            </Link>
            <div className="flex items-center gap-5">
              {NAV.map(n => (
                <Link key={n.href} href={n.href}
                  className="text-sm transition-opacity hover:opacity-80"
                  style={{ color: "var(--text2)" }}>
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
