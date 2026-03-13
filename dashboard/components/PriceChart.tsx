"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

export function PriceChart({ history, prediction }: { history: any[]; prediction?: any }) {
  if (!history.length) return (
    <div className="flex items-center justify-center h-48 text-sm" style={{ color:"var(--text3)" }}>
      No data yet — check back after the first scraper run.
    </div>
  );

  const prices = history.map(h => parseFloat(h.total_price));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const pad = (maxP - minP) * 0.25 || 20;

  const data = history.map(h => ({
    date: new Date(h.checked_at).toLocaleDateString("en-CA", { month:"short", day:"numeric" }),
    price: parseFloat(h.total_price),
    forecast: null as number | null,
  }));

  if (prediction) {
    const mean = parseFloat(prediction.predicted_mean);
    const base = new Date(history[history.length-1].checked_at);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      data.push({
        date: d.toLocaleDateString("en-CA", { month:"short", day:"numeric" }) + "*",
        price: null as any,
        forecast: mean,
      });
    }
  }

  const Tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl p-3 text-xs" style={{ background:"var(--bg4)", border:"1px solid var(--border)" }}>
        <div style={{ color:"var(--text3)" }} className="mb-1">{label}</div>
        {payload.map((p: any) => p.value && (
          <div key={p.dataKey} style={{ color: p.color }}>
            {p.dataKey === "price" ? "Actual" : "Forecast"}: CAD {p.value.toFixed(2)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top:5, right:10, bottom:5, left:5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="date" tick={{ fill:"#3d4d70", fontSize:11 }} tickLine={false} axisLine={false}
          interval="preserveStartEnd" />
        <YAxis tick={{ fill:"#3d4d70", fontSize:11, fontFamily:"monospace" }} tickLine={false}
          axisLine={false} tickFormatter={v => `$${v}`} domain={[minP - pad, maxP + pad]} />
        <Tooltip content={<Tip />} />
        <Legend wrapperStyle={{ color:"#7f8fbb", fontSize:12, paddingTop:8 }} />
        <ReferenceLine y={minP} stroke="rgba(16,185,129,0.35)" strokeDasharray="4 4"
          label={{ value:`Best $${minP.toFixed(0)}`, position:"right", fill:"#10b981", fontSize:10 }} />
        <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2}
          dot={{ fill:"#3b82f6", r:3 }} activeDot={{ r:5, fill:"#60a5fa" }}
          connectNulls={false} name="Actual (CAD)" />
        {prediction && (
          <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={1.5}
            strokeDasharray="5 5" dot={{ fill:"#f59e0b", r:3 }}
            connectNulls={false} name="ML Forecast (CAD)" />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
