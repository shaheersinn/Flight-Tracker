"use client";
// apps/web/components/PriceChart.tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Props {
  history: any[];
  prediction?: any;
}

export function PriceChart({ history, prediction }: Props) {
  if (history.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-48 text-sm"
        style={{ color: "var(--text-3)" }}
      >
        No historical data yet. Check back after the first scraper run.
      </div>
    );
  }

  // Build chart data from history
  const chartData = history.map((h) => ({
    date: new Date(h.checked_at).toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    }),
    price: parseFloat(h.total_price),
    predicted: null as number | null,
  }));

  // Append prediction range dots
  if (prediction) {
    const mean = parseFloat(prediction.predicted_mean);
    const lastDate = history[history.length - 1];
    const base = new Date(lastDate.checked_at);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      chartData.push({
        date: d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }) + " (est)",
        price: null as any,
        predicted: mean,
      });
    }
  }

  const prices = history.map((h) => parseFloat(h.total_price));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.2 || 20;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg p-3 text-sm"
        style={{
          background: "var(--bg-3)",
          border: "1px solid var(--border)",
          color: "var(--text-1)",
        }}
      >
        <div style={{ color: "var(--text-3)" }} className="text-xs mb-1">
          {label}
        </div>
        {payload.map((p: any) => (
          <div key={p.dataKey} style={{ color: p.color }}>
            {p.dataKey === "price" ? "Actual" : "Forecast"}: CAD{" "}
            {p.value?.toFixed(2)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#4f5f8a", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#4f5f8a", fontSize: 11, fontFamily: "monospace" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v}`}
          domain={[minPrice - padding, maxPrice + padding]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ color: "#8b97c0", fontSize: 12, paddingTop: 8 }}
        />

        {/* All-time low reference */}
        <ReferenceLine
          y={minPrice}
          stroke="rgba(34,197,94,0.4)"
          strokeDasharray="4 4"
          label={{
            value: `Best: $${minPrice.toFixed(0)}`,
            position: "right",
            fill: "#22c55e",
            fontSize: 10,
          }}
        />

        <Line
          type="monotone"
          dataKey="price"
          stroke="#4361ee"
          strokeWidth={2}
          dot={{ fill: "#4361ee", r: 3 }}
          activeDot={{ r: 5, fill: "#7b96f5" }}
          connectNulls={false}
          name="Actual Price (CAD)"
        />
        {prediction && (
          <Line
            type="monotone"
            dataKey="predicted"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={{ fill: "#f59e0b", r: 3 }}
            connectNulls={false}
            name="ML Forecast (CAD)"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
