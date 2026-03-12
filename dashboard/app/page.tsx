"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Flight {
  id: number;
  origin: string;
  destination: string;
  departure_date: string;
  price_cad: number | null;
  airline: string | null;
  source: string;
  scraped_at: string;
}

interface Award {
  id: number;
  origin: string;
  destination: string;
  departure_date: string;
  program: string;
  cabin_class: string;
  miles_required: number | null;
  available: boolean;
  scraped_at: string;
}

interface PriceAlert {
  id: number;
  origin: string;
  destination: string;
  departure_date: string;
  previous_price_cad: number | null;
  new_price_cad: number;
  drop_percent: number | null;
  alerted_at: string;
  notification_sent: boolean;
}

interface ScraperLog {
  id: number;
  scraper_name: string;
  status: string;
  records_found: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Components ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    success: "bg-green-100 text-green-800",
    failure: "bg-red-100 text-red-800",
    skipped: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        colours[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {status}
    </span>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">{title}</h2>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadAll() {
      try {
        const [f, a, al, l] = await Promise.all([
          apiFetch<Flight[]>("/api/flights?limit=200"),
          apiFetch<Award[]>("/api/awards?limit=100"),
          apiFetch<PriceAlert[]>("/api/alerts?limit=50"),
          apiFetch<ScraperLog[]>("/api/logs?limit=20"),
        ]);
        setFlights(f);
        setAwards(a);
        setAlerts(al);
        setLogs(l);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  // ── Build chart data for a route ────────────────────────────────────────────

  function buildChartData(origin: string, destination: string) {
    const filtered = flights
      .filter(
        (f) =>
          f.origin === origin &&
          f.destination === destination &&
          f.price_cad !== null
      )
      .sort((a, b) => a.departure_date.localeCompare(b.departure_date));

    const byDate = new Map<string, number>();
    for (const f of filtered) {
      const existing = byDate.get(f.departure_date);
      if (existing === undefined || (f.price_cad ?? Infinity) < existing) {
        byDate.set(f.departure_date, f.price_cad!);
      }
    }

    return Array.from(byDate.entries()).map(([date, price]) => ({
      date,
      price,
    }));
  }

  const yycYyzData = buildChartData("YYC", "YYZ");
  const yyzYycData = buildChartData("YYZ", "YYC");

  // ── Trigger job ─────────────────────────────────────────────────────────────

  async function handleTrigger() {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/run-now`, { method: "POST" });
      const data = (await res.json()) as { message: string };
      setTriggerMsg(data.message);
    } catch (e) {
      setTriggerMsg(`Error: ${(e as Error).message}`);
    } finally {
      setTriggering(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-red-600">
        API error: {error}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">✈️ Flight Tracker</h1>
          <p className="mt-1 text-sm text-gray-500">
            YYC ↔ YYZ · Qatar Awards · Daily digest
          </p>
        </div>
        <div className="flex items-center gap-3">
          {triggerMsg && (
            <span className="text-sm text-blue-700">{triggerMsg}</span>
          )}
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {triggering ? "Running…" : "Run Now"}
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Price charts */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="YYC → YYZ Prices (CA$)">
            {yycYyzData.length === 0 ? (
              <p className="text-sm text-gray-400">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={yycYyzData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `CA$${v}`} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#2563eb"
                    dot={false}
                    name="Price (CA$)"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="YYZ → YYC Prices (CA$)">
            {yyzYycData.length === 0 ? (
              <p className="text-sm text-gray-400">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={yyzYycData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `CA$${v}`} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#16a34a"
                    dot={false}
                    name="Price (CA$)"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Price alerts */}
        <Card title={`Price Drop Alerts (${alerts.length})`}>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-400">No alerts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Route</th>
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Previous</th>
                    <th className="pb-2 pr-4">New</th>
                    <th className="pb-2 pr-4">Drop</th>
                    <th className="pb-2">Notified</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">
                        {a.origin}→{a.destination}
                      </td>
                      <td className="py-2 pr-4">{a.departure_date}</td>
                      <td className="py-2 pr-4 text-gray-400">
                        {a.previous_price_cad != null
                          ? `CA$${a.previous_price_cad.toFixed(0)}`
                          : "–"}
                      </td>
                      <td className="py-2 pr-4 font-semibold text-green-700">
                        CA${a.new_price_cad.toFixed(0)}
                      </td>
                      <td className="py-2 pr-4 text-red-600">
                        {a.drop_percent != null
                          ? `↓${a.drop_percent.toFixed(1)}%`
                          : "–"}
                      </td>
                      <td className="py-2">
                        {a.notification_sent ? "✅" : "⏳"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Award flights */}
        <Card title={`Qatar Award Availability (${awards.length})`}>
          {awards.length === 0 ? (
            <p className="text-sm text-gray-400">No award data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Route</th>
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Cabin</th>
                    <th className="pb-2 pr-4">Miles</th>
                    <th className="pb-2">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {awards.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">
                        {a.origin}→{a.destination}
                      </td>
                      <td className="py-2 pr-4">{a.departure_date}</td>
                      <td className="py-2 pr-4 capitalize">{a.cabin_class}</td>
                      <td className="py-2 pr-4">
                        {a.miles_required != null
                          ? a.miles_required.toLocaleString()
                          : "–"}
                      </td>
                      <td className="py-2">
                        {a.available ? (
                          <span className="text-green-600 font-semibold">Yes</span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Recent flights */}
        <Card title={`Recent Flight Prices (${flights.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Route</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Price</th>
                  <th className="pb-2 pr-4">Airline</th>
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2">Scraped</th>
                </tr>
              </thead>
              <tbody>
                {flights.slice(0, 50).map((f) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {f.origin}→{f.destination}
                    </td>
                    <td className="py-2 pr-4">{f.departure_date}</td>
                    <td className="py-2 pr-4">
                      {f.price_cad != null
                        ? `CA$${f.price_cad.toFixed(0)}`
                        : "–"}
                    </td>
                    <td className="py-2 pr-4">{f.airline ?? "–"}</td>
                    <td className="py-2 pr-4 text-gray-400">{f.source}</td>
                    <td className="py-2 text-gray-400">
                      {new Date(f.scraped_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {flights.length > 50 && (
              <p className="mt-2 text-xs text-gray-400">
                Showing 50 of {flights.length} records.
              </p>
            )}
          </div>
        </Card>

        {/* Scraper logs */}
        <Card title={`Scraper Logs (last ${logs.length})`}>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400">No logs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Scraper</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Records</th>
                    <th className="pb-2 pr-4">Started</th>
                    <th className="pb-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{l.scraper_name}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="py-2 pr-4">{l.records_found}</td>
                      <td className="py-2 pr-4 text-gray-400">
                        {new Date(l.started_at).toLocaleString()}
                      </td>
                      <td className="py-2 text-red-500 text-xs">
                        {l.error_message ?? "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
