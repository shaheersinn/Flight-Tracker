import { getRecentAlerts } from "../../lib/db";

export const revalidate = 60;

const TYPES: Record<string, { label: string; color: string; emoji: string }> = {
  new_all_time_low: { label: "New All-Time Low",  color: "var(--green)",  emoji: "✦" },
  significant_drop: { label: "Significant Drop",  color: "var(--amber)",  emoji: "↓" },
  threshold_breach: { label: "Threshold Breach",  color: "var(--gold)",   emoji: "◆" },
  award_available:  { label: "Award Available",   color: "var(--gold2)",  emoji: "✈" },
  anomaly_detected: { label: "Anomaly Detected",  color: "var(--red)",    emoji: "!" },
};

export default async function AlertsPage() {
  const alerts = await getRecentAlerts(40);

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32,
          fontWeight: 600, color: "var(--ink0)", marginBottom: 6 }}>
          Alert History
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 8 }}>
          <div style={{ height: 1, width: 32, background: "var(--gold-rule)" }} />
          <span style={{ color: "var(--gold3)", fontSize: 7, margin: "0 8px" }}>◆</span>
          <div style={{ height: 1, width: 32, background: "var(--gold-rule)" }} />
        </div>
        <p style={{ fontSize: 13, color: "var(--ink3)", fontFamily: "'Cormorant Garamond', serif",
          fontStyle: "italic" }}>
          All Telegram alerts sent by the tracker
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {alerts.map((a: any) => {
          const meta = TYPES[a.alert_type] ?? { label: a.alert_type, color: "var(--ink2)", emoji: "·" };
          return (
            <div key={a.id} className="card" style={{
              padding: "14px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center",
                justifyContent: "center", borderRadius: 2, fontSize: 16,
                background: `${meta.color}18`, color: meta.color,
                border: `1px solid ${meta.color}30`,
                fontFamily: "'Cormorant Garamond', serif", fontWeight: 700,
              }}>
                {meta.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8,
                  flexWrap: "wrap", marginBottom: 4 }}>
                  <span className="badge" style={{
                    color: meta.color, borderColor: `${meta.color}50`, fontSize: 9 }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink3)",
                    fontFamily: "'Cormorant Garamond', serif" }}>
                    {a.monitor_id}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "var(--ink2)",
                  fontFamily: "'Cormorant Garamond', serif" }}>{a.message}</p>
              </div>
              <div style={{ fontSize: 11, flexShrink: 0, color: "var(--ink3)",
                fontFamily: "'Cormorant Garamond', serif" }}>
                {new Date(a.sent_at).toLocaleString("en-CA", {
                  timeZone: "America/Toronto", dateStyle: "short", timeStyle: "short",
                })}
              </div>
            </div>
          );
        })}

        {!alerts.length && (
          <div className="card" style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◆</div>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
              color: "var(--ink3)", fontSize: 15 }}>
              No alerts yet — price drops will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
