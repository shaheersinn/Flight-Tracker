// apps/web/components/PriceChart.tsx
"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

type DataPoint = {
  date: string;
  price: number;
  provider: string;
  airline: string;
  departure_date?: string;
};

function CustomTooltip({
  active,
  payload,
  label,
  isCash,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  isCash: boolean;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DataPoint;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      <div className="text-white font-bold text-sm">
        {isCash
          ? `CAD $${d.price.toFixed(2)}`
          : `${d.price.toLocaleString()} Avios`}
      </div>
      <div className="text-gray-400 mt-1">{d.airline}</div>
      <div className="text-gray-500">{d.provider}</div>
      {d.departure_date && (
        <div className="text-gray-500">Departs: {d.departure_date}</div>
      )}
    </div>
  );
}

export function PriceChart({
  data,
  isCash,
}: {
  data: DataPoint[];
  isCash: boolean;
}) {
  if (data.length === 0) return null;

  const prices = data.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  const yMin = Math.floor(minPrice * 0.95);
  const yMax = Math.ceil(maxPrice * 1.05);

  const label = isCash ? "CAD $" : "Avios ";

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#6b7280", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fill: "#6b7280", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${label}${v.toLocaleString()}`}
          width={80}
        />
        <Tooltip
          content={<CustomTooltip isCash={isCash} />}
        />
        <ReferenceLine
          y={avgPrice}
          stroke="#374151"
          strokeDasharray="4 4"
          label={{ value: "avg", fill: "#6b7280", fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="price"
          stroke="#22d3ee"
          strokeWidth={2}
          dot={data.length <= 30}
          activeDot={{ r: 4, fill: "#22d3ee" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
