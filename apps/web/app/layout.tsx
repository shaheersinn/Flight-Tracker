// apps/web/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flight Price Tracker",
  description: "Daily automated flight price monitoring",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 bg-gray-900 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
            <span className="text-xl font-bold text-sky-400">✈️ FlightTracker</span>
            <a href="/" className="text-gray-300 hover:text-white text-sm transition-colors">Dashboard</a>
            <a href="/runs" className="text-gray-300 hover:text-white text-sm transition-colors">Run Logs</a>
            <a href="/alerts" className="text-gray-300 hover:text-white text-sm transition-colors">Alert History</a>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-gray-800 text-center text-xs text-gray-600 py-4 mt-12">
          Flight Tracker — runs daily at 11:17 UTC
        </footer>
      </body>
    </html>
  );
}
