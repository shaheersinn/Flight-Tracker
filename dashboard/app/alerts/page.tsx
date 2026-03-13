import { getRecentAlerts } from "../../lib/db";

export const revalidate = 60;

const TYPES: Record<string, { label:string; color:string; emoji:string }> = {
  new_all_time_low:  { label:"New All-Time Low",  color:"var(--green)",  emoji:"🏆" },
  significant_drop:  { label:"Significant Drop",  color:"var(--amber)",  emoji:"📉" },
  threshold_breach:  { label:"Threshold Breach",  color:"var(--amber)",  emoji:"🎯" },
  award_available:   { label:"Award Available",   color:"var(--accent2)",emoji:"🎫" },
  anomaly_detected:  { label:"Anomaly Detected",  color:"var(--purple)", emoji:"⚡" },
};

export default async function AlertsPage() {
  const alerts = await getRecentAlerts(40);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🔔 Alert History</h1>
        <p className="text-sm mt-1" style={{ color:"var(--text2)" }}>
          All Telegram alerts sent by the tracker
        </p>
      </div>

      <div className="space-y-3">
        {alerts.map((a: any) => {
          const meta = TYPES[a.alert_type] ?? { label:a.alert_type, color:"var(--text2)", emoji:"🔔" };
          return (
            <div key={a.id} className="card p-4 flex gap-4 items-start">
              <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-xl"
                style={{ background:`${meta.color}18` }}>
                {meta.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="badge" style={{ background:`${meta.color}18`, color:meta.color }}>
                    {meta.label}
                  </span>
                  <span className="text-xs" style={{ color:"var(--text3)" }}>{a.monitor_id}</span>
                </div>
                <p className="text-sm" style={{ color:"var(--text2)" }}>{a.message}</p>
              </div>
              <div className="text-xs flex-shrink-0" style={{ color:"var(--text3)" }}>
                {new Date(a.sent_at).toLocaleString("en-CA", {
                  timeZone:"America/Toronto", dateStyle:"short", timeStyle:"short"
                })}
              </div>
            </div>
          );
        })}
        {!alerts.length && (
          <div className="card p-8 text-center text-sm" style={{ color:"var(--text3)" }}>
            No alerts yet — they will appear here after the first price drops are detected.
          </div>
        )}
      </div>
    </div>
  );
}
