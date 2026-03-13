"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const GOLD = "#A8782A";
const GOLD2 = "#C8952E";
const GREEN = "#3D7A4A";
const RED = "#8B3030";
const INK3 = "#B8A080";
const BG2 = "#F2EBD9";
const BORDER = "rgba(168,120,42,0.15)";

const CustomTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#F7F2E8", border: `1px solid ${BORDER}`,
      borderRadius: 3, padding: "10px 14px", fontSize: 12,
      fontFamily: "'Cormorant Garamond', serif",
      boxShadow: "0 2px 12px rgba(168,120,42,0.1)",
    }}>
      <div style={{ color: INK3, marginBottom: 4, letterSpacing: "0.04em" }}>{label}</div>
      {payload.map((p: any) =>
        p.value != null && (
          <div key={p.dataKey} style={{ color: p.color, fontWeight: 700 }}>
            {p.dataKey === "price" ? "Actual" : "Forecast"}: CAD {Number(p.value).toFixed(2)}
          </div>
        )
      )}
    </div>
  );
};

export function PriceChart({ history, prediction }: { history: any[]; prediction?: any }) {
  if (!history.length) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: 200, fontFamily: "'Cormorant Garamond', serif",
      fontStyle: "italic", color: INK3, fontSize: 15,
    }}>
      No price data yet — check back after the first scraper run.
    </div>
  );

  const prices = history.map(h => parseFloat(h.total_price));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const pad = (maxP - minP) * 0.3 || 25;

  const data = history.map((h: any) => ({
    date: new Date(h.checked_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
    price: parseFloat(h.total_price),
    forecast: null as number | null,
  }));

  if (prediction) {
    const mean = parseFloat(prediction.predicted_mean);
    const base = new Date(history[history.length - 1].checked_at);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      data.push({
        date: d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }) + "†",
        price: null as any,
        forecast: mean,
      });
    }
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={BORDER} />
        <XAxis dataKey="date"
          tick={{ fill: INK3, fontSize: 11, fontFamily: "'Cormorant Garamond', serif" }}
          tickLine={false} axisLine={{ stroke: BORDER }}
          interval="preserveStartEnd" />
        <YAxis
          tick={{ fill: INK3, fontSize: 11, fontFamily: "'Cormorant Garamond', serif" }}
          tickLine={false} axisLine={false}
          tickFormatter={v => `$${v}`}
          domain={[minP - pad, maxP + pad]} />
        <Tooltip content={<CustomTip />} />
        <Legend wrapperStyle={{
          color: INK3, fontSize: 12, paddingTop: 10,
          fontFamily: "'Cormorant Garamond', serif",
        }} />
        <ReferenceLine y={minP} stroke={GREEN} strokeDasharray="4 4" strokeWidth={1}
          label={{ value: `Best $${minP.toFixed(0)}`, position: "right",
            fill: GREEN, fontSize: 10, fontFamily: "'Cormorant Garamond', serif" }} />
        <Line type="monotone" dataKey="price"
          stroke={GOLD} strokeWidth={2}
          dot={{ fill: GOLD, r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: GOLD2 }}
          connectNulls={false} name="Actual (CAD)" />
        {prediction && (
          <Line type="monotone" dataKey="forecast"
            stroke={RED} strokeWidth={1.5} strokeDasharray="5 5"
            dot={{ fill: RED, r: 3, strokeWidth: 0 }}
            connectNulls={false} name="ML Forecast (CAD)" />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
