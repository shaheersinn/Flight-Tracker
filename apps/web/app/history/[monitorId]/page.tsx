// apps/web/app/history/[monitorId]/page.tsx
import { monitors } from "@flight-tracker/shared";
import { getQuoteHistory, QuoteRow } from "@/lib/db";
import { PriceChart } from "@/components/PriceChart";
import { notFound } from "next/navigation";
import Link from "next/link";

export const revalidate = 300;

export async function generateStaticParams() {
  return monitors.map((m) => ({ monitorId: m.id }));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function HistoryPage({
  params,
}: {
  params: { monitorId: string };
}) {
  const monitor = monitors.find((m) => m.id === params.monitorId);
  if (!monitor) return notFound();

  let history: QuoteRow[] = [];
  try {
    history = await getQuoteHistory(params.monitorId, 60);
  } catch (err) {
    console.error("DB error:", err);
  }

  const isCash = monitor.kind === "cash";
  const prices = history
    .filter((q) => isCash ? q.total_price != null : q.points_cost != null)
    .map((q) => ({
      date: new Date(q.checked_at).toLocaleDateString("en-CA"),
      price: isCash ? q.total_price! : q.points_cost!,
      provider: q.provider,
      airline: q.airline,
      departure_date: q.departure_date,
    }));

  const bestPrice = prices.reduce<number | null>((best, p) => {
    return best === null || p.price < best ? p.price : best;
  }, null);

  const avgPrice =
    prices.length > 0
      ? prices.reduce((sum, p) => sum + p.price, 0) / prices.length
      : null;

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sky-500 text-sm hover:text-sky-400 mb-3 inline-block">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-white">
          {monitor.kind === "cash"
            ? `${(monitor as any).origin} → ${(monitor as any).destination}`
            : `YYZ → ${(monitor as any).destination} (Award)`}
        </h1>
        <p className="text-gray-400 text-sm mt-1 font-mono">{monitor.id}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Best Price"
          value={bestPrice != null ? (isCash ? `CAD $${bestPrice.toFixed(2)}` : `${bestPrice.toLocaleString()} Avios`) : "—"}
          highlight
        />
        <StatCard
          label="Avg Price"
          value={avgPrice != null ? (isCash ? `CAD $${avgPrice.toFixed(2)}` : `${Math.round(avgPrice).toLocaleString()} Avios`) : "—"}
        />
        <StatCard
          label="Data Points"
          value={history.length.toString()}
        />
        <StatCard
          label="Tracking Since"
          value={history.length > 0 ? formatDate(history[0].checked_at) : "—"}
        />
      </div>

      {/* Chart */}
      {prices.length > 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">
            Price History (last 60 days)
          </h2>
          <PriceChart data={prices} isCash={isCash} />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 mb-8">
          No price history yet — check back after the first scraper run.
        </div>
      )}

      {/* Recent quotes table */}
      {history.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300">Recent Quotes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  <th className="text-left px-4 py-2">Checked At</th>
                  <th className="text-left px-4 py-2">
                    {isCash ? "Price (CAD)" : "Avios"}
                  </th>
                  <th className="text-left px-4 py-2">Airline</th>
                  <th className="text-left px-4 py-2">Provider</th>
                  <th className="text-left px-4 py-2">Departs</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 30).map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {new Date(q.checked_at).toLocaleString("en-CA", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2 font-mono font-semibold text-green-400">
                      {q.total_price != null
                        ? `$${q.total_price.toFixed(2)}`
                        : q.points_cost != null
                        ? `${q.points_cost.toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-300">{q.airline}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {q.provider}
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {q.departure_date
                        ? formatDate(q.departure_date)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div
        className={`text-xl font-bold ${
          highlight ? "text-green-400" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
