import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flight Tracker",
  description: "YYC ↔ YYZ price tracker and Qatar award monitor",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
