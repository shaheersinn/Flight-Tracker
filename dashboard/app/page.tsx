import { getLatestQuotes, getLatestPredictions, getAllTimeBest, getRecentRuns, getRapidApiUsage } from "../lib/db";
import { CASH_MONITORS, AWARD_MONITORS } from "../lib/monitors";
import Link from "next/link";

export const revalidate = 300;

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "var(--green)", partial: "var(--amber)",
    failed: "var(--red)", running: "var(--accent2)",
  };
  const c = colors[status] ?? "var(--text3)";
  return <span style={{ width:8, height:8, borderRadius:"50%", background:c,
    display:"inline-block", boxShadow:`0 0 6px ${c}` }} />;
}

function MonitorCard({ monitor, quote, pred, best }: any) {
  const price = quote?.total_price ? parseFloat(quote.total_price) : null;
  const isLow = price !== null && best !== null && price <= best;
  const belowThresh = price !== null && monitor.alertThreshold && price < monitor.alertThreshold;
  const vsP = (price !== null && pred?.predicted_mean)
    ? price - parseFloat(pred.predicted_mean) : null;

  return (
    <Link href={`/history/${monitor.id}`} className="block">
      <div className="card p-5" style={isLow ? {
        borderColor:"rgba(16,185,129,0.4)", boxShadow:"0 0 24px rgba(16,185,129,0.1)"
      } : {}}>
        {/* Route */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-xl font-bold" style={{ color:"var(--text1)" }}>{monitor.origin}</span>
            <span className="mx-1.5 text-sm" style={{ color:"var(--text3)" }}>→</span>
            <span className="text-xl font-bold" style={{ color:"var(--text1)" }}>{monitor.destination}</span>
          </div>
          {isLow && <span className="badge" style={{ background:"rgba(16,185,129,0.15)", color:"var(--green)" }}>🏆 Best Ever</span>}
          {belowThresh && !isLow && <span className="badge" style={{ background:"rgba(245,158,11,0.15)", color:"var(--amber)" }}>🎯 Deal</span>}
        </div>

        {/* Date window */}
        <p className="text-xs mb-3" style={{ color:"var(--text3)" }}>
          {monitor.dateFrom} → {monitor.dateTo}
        </p>

        {/* Price */}
        <div className="mb-3">
          {price !== null ? (
            <span className="mono text-3xl font-bold"
              style={{ color: isLow ? "var(--green)" : belowThresh ? "var(--amber)" : "var(--text1)" }}>
              CAD {price.toFixed(2)}
            </span>
          ) : (
            <span className="mono text-xl" style={{ color:"var(--text3)" }}>—</span>
          )}
          {best !== null && price !== null && !isLow && (
            <div className="text-xs mt-0.5" style={{ color:"var(--text3)" }}>
              All-time best: CAD {parseFloat(best).toFixed(2)}
            </div>
          )}
        </div>

        {/* Flight details */}
        {quote && (
          <div className="text-xs space-y-0.5 mb-3" style={{ color:"var(--text2)" }}>
            <div>✈ {quote.airline}</div>
            <div>⏱ {quote.duration} · {quote.stops === 0 || quote.stops === "0" ? "Nonstop" : `${quote.stops} stop(s)`}</div>
            <div>📅 {String(quote.departure_date).split("T")[0]}</div>
          </div>
        )}

        {/* Prediction */}
        {vsP !== null && (
          <div className="text-xs px-2.5 py-1.5 rounded-lg"
            style={{ background:"var(--bg3)" }}>
            <span style={{ color:"var(--text3)" }}>vs 7-day forecast: </span>
            <span className="mono font-semibold"
              style={{ color: vsP < 0 ? "var(--green)" : "var(--red)" }}>
              {vsP > 0 ? "+" : ""}CAD {vsP.toFixed(2)}
            </span>
            <span style={{ color:"var(--text3)" }}>
              {" "}({(parseFloat(pred.confidence) * 100).toFixed(0)}% conf)
            </span>
          </div>
        )}

        <div className="text-xs mt-2" style={{ color:"var(--text3)" }}>
          {quote?.provider ?? "Not yet scraped"}
        </div>
      </div>
    </Link>
  );
}

function AwardCard({ monitor, quote }: any) {
  const points = quote?.points_cost ? parseInt(quote.points_cost) : null;
  const surcharge = quote?.cash_surcharge ? parseFloat(quote.cash_surcharge) : null;
  const months = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [yr, mo] = monitor.month.split("-");
  const monthLabel = `${months[parseInt(mo)]} ${yr}`;

  return (
    <div className="card p-5" style={points ? {
      borderColor:"rgba(59,130,246,0.35)", boxShadow:"0 0 24px rgba(59,130,246,0.08)"
    } : {}}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-xl font-bold" style={{ color:"var(--text1)" }}>{monitor.origin}</span>
          <span className="mx-1.5 text-sm" style={{ color:"var(--text3)" }}>→</span>
          <span className="text-xl font-bold" style={{ color:"var(--text1)" }}>{monitor.destination}</span>
        </div>
        <span className="badge" style={points
          ? { background:"rgba(59,130,246,0.15)", color:"var(--accent2)" }
          : { background:"rgba(255,255,255,0.04)", color:"var(--text3)" }}>
          {points ? "✓ Available" : "Monitoring…"}
        </span>
      </div>

      <p className="text-xs mb-1" style={{ color:"var(--text2)" }}>{monitor.destinationLabel}</p>
      <p className="text-xs mb-3" style={{ color:"var(--text3)" }}>
        📅 {monthLabel} · {monitor.cabin} class
      </p>

      {points ? (
        <>
          <div className="mono text-2xl font-bold mb-0.5" style={{ color:"var(--accent2)" }}>
            {points.toLocaleString()} Avios
          </div>
          {surcharge && (
            <div className="text-sm" style={{ color:"var(--text2)" }}>
              + CAD {surcharge.toFixed(2)} taxes & fees
            </div>
          )}
          <a href="https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html"
            target="_blank" rel="noopener noreferrer"
            className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg"
            style={{ background:"rgba(59,130,246,0.12)", color:"var(--accent2)",
              border:"1px solid rgba(59,130,246,0.25)" }}>
            Book on Qatar →
          </a>
        </>
      ) : (
        <div style={{ color:"var(--text3)" }}>
          <div className="text-sm">No award availability yet</div>
          <div className="text-xs mt-0.5">Checked daily</div>
        </div>
      )}
      <div className="text-xs mt-3" style={{ color:"var(--text3)" }}>✈ Qatar Airways · Privilege Club</div>
    </div>
  );
}

export default async function HomePage() {
  const [quotes, preds, bests, runs, rapidUsed] = await Promise.all([
    getLatestQuotes(), getLatestPredictions(), getAllTimeBest(),
    getRecentRuns(1), getRapidApiUsage(),
  ]);

  const lastRun = runs[0] ?? null;
  const rapidColor = rapidUsed >= 10 ? "var(--red)" : rapidUsed >= 7 ? "var(--amber)" : "var(--green)";

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">✈ Flight Price Tracker</h1>
          <p className="mt-1 text-sm" style={{ color:"var(--text2)" }}>
            YYC/YYZ domestic fares · Qatar Airways award availability
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* RapidAPI meter */}
          <div className="card px-3 py-1.5 text-xs flex items-center gap-2">
            <span style={{ color:"var(--text3)" }}>RapidAPI</span>
            <span className="mono font-semibold" style={{ color: rapidColor }}>{rapidUsed}/10</span>
            <span style={{ color:"var(--text3)" }}>this month</span>
          </div>
          {/* Last run */}
          {lastRun && (
            <div className="card px-3 py-1.5 text-xs flex items-center gap-2">
              <StatusDot status={lastRun.status} />
              <span style={{ color:"var(--text2)" }}>Last run: <span style={{ color:"var(--text1)" }}>{lastRun.status}</span></span>
              <span style={{ color:"var(--text3)" }}>
                {new Date(lastRun.started_at).toLocaleDateString("en-CA")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Cash monitors */}
      <section>
        <h2 className="text-base font-semibold mb-4" style={{ color:"var(--text2)" }}>
          🏷 CASH FARES
          <span className="ml-2 text-xs font-normal" style={{ color:"var(--text3)" }}>
            Air Canada · WestJet · Flair
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CASH_MONITORS.map(m => (
            <MonitorCard key={m.id} monitor={m}
              quote={quotes.find(q => q.monitor_id === m.id)}
              pred={preds.find(p => p.monitor_id === m.id)}
              best={bests.find(b => b.monitor_id === m.id)?.best_price ?? null}
            />
          ))}
        </div>
      </section>

      {/* Award monitors */}
      <section>
        <h2 className="text-base font-semibold mb-4" style={{ color:"var(--text2)" }}>
          🎫 QATAR AIRWAYS AWARDS
          <span className="ml-2 text-xs font-normal" style={{ color:"var(--text3)" }}>
            Business Class · Privilege Club
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AWARD_MONITORS.map(m => (
            <AwardCard key={m.id} monitor={m}
              quote={quotes.find(q => q.monitor_id === m.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
