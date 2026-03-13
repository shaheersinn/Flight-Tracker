// apps/web/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "../components/NavBar";

export const metadata: Metadata = {
  title: "Flight Price Tracker",
  description: "Daily automated flight price monitoring — YYC/YYZ domestic + Qatar awards",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
