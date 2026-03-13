import { getLatestQuotes, getLatestPredictions, getAllTimeBest, getRecentRuns, getRapidApiUsage } from "../lib/db";
import { CASH_MONITORS, AWARD_MONITORS } from "../lib/monitors";
import Link from "next/link";

export const revalidate = 300;

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "var(--green)", partial: "var(--amber)",
    failed: "var(--red)", running: "var(--gold)",
  };
  const c = colors[status] ?? "var(--ink3)";
  return <span style={{ width: 7, height: 7, borderRadius: "50%",
    background: c, display: "inline-block", boxShadow: `0 0 5px ${c}88` }} />;
}

function MonitorCard({ monitor, quote, pred, best }: any) {
  const price = quote?.total_price ? parseFloat(quote.total_price) : null;
  const isLow = price !== null && best !== null && price <= parseFloat(best);
  const belowThresh = price !== null && monitor.alertThreshold && price < monitor.alertThreshold;
  const vsP = price !== null && pred?.predicted_mean
    ? price - parseFloat(pred.predicted_mean) : null;

  const borderStyle = isLow
    ? { borderColor: "var(--green)", boxShadow: "0 2px 16px rgba(61,122,74,0.12)" }
    : belowThresh
    ? { borderColor: "var(--gold)", boxShadow: "0 2px 16px rgba(168,120,42,0.12)" }
    : {};

  return (
    <Link href={`/history/${monitor.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div className="card card-gold-rule" style={{ padding: 20, height: "100%", ...borderStyle }}>

        {/* Route */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22,
              fontWeight: 700, color: "var(--ink0)", letterSpacing: "0.02em" }}>
              {monitor.origin}
            </span>
            <span style={{ color: "var(--gold3)", margin: "0 6px", fontSize: 12 }}>→</span>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22,
              fontWeight: 700, color: "var(--ink0)", letterSpacing: "0.02em" }}>
              {monitor.destination}
            </span>
          </div>
          {isLow && (
            <span className="badge" style={{ color: "var(--green)", borderColor: "var(--green)", fontSize: 9 }}>
              ✦ Best Ever
            </span>
          )}
          {belowThresh && !isLow && (
            <span className="badge" style={{ color: "var(--gold)", borderColor: "var(--gold)", fontSize: 9 }}>
              ◆ Deal
            </span>
          )}
        </div>

        {/* Date window */}
        <p style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 12,
          fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.05em" }}>
          {monitor.dateFrom} — {monitor.dateTo}
        </p>

        {/* Gold rule divider */}
        <div className="gold-rule" style={{ marginBottom: 12 }} />

        {/* Price */}
        <div style={{ marginBottom: 12 }}>
          {price !== null ? (
            <>
              <div className="mono" style={{
                fontSize: 30,
                color: isLow ? "var(--green)" : belowThresh ? "var(--gold)" : "var(--gold)",
              }}>
                CAD {price.toFixed(2)}
              </div>
              {best !== null && !isLow && (
                <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2,
                  fontFamily: "'Cormorant Garamond', serif" }}>
                  All-time best: CAD {parseFloat(best).toFixed(2)}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 20, color: "var(--ink3)",
              fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic" }}>
              Not yet checked
            </div>
          )}
        </div>

        {/* Flight details */}
        {quote && (
          <div style={{ fontSize: 12, color: "var(--ink2)", lineHeight: 1.7,
            fontFamily: "'Cormorant Garamond', serif", marginBottom: 10 }}>
            <div>✈ {quote.airline}</div>
            <div>⏱ {quote.duration} ·{" "}
              {quote.stops === 0 || quote.stops === "0" ? "Nonstop" : `${quote.stops} stop(s)`}
            </div>
            <div>📅 {String(quote.departure_date).split("T")[0]}</div>
          </div>
        )}

        {/* ML prediction chip */}
        {vsP !== null && (
          <div style={{
            background: "var(--bg1)", border: "1px solid var(--border)",
            borderRadius: 2, padding: "6px 10px", fontSize: 11,
            fontFamily: "'Cormorant Garamond', serif",
          }}>
            <span style={{ color: "var(--ink3)" }}>vs 7-day forecast: </span>
            <span style={{ fontWeight: 700, color: vsP < 0 ? "var(--green)" : "var(--red)" }}>
              {vsP > 0 ? "+" : ""}CAD {vsP.toFixed(2)}
            </span>
            <span style={{ color: "var(--ink3)" }}>
              {" "}({(parseFloat(pred.confidence) * 100).toFixed(0)}% conf.)
            </span>
          </div>
        )}

        <div style={{ fontSize: 10, color: "var(--ink3)", marginTop: 10,
          fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.05em" }}>
          {quote?.provider ?? "AWAITING FIRST RUN"}
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
    <div className="card card-gold-rule" style={{ padding: 20,
      ...(points ? { borderColor: "var(--gold)", boxShadow: "0 2px 16px rgba(168,120,42,0.1)" } : {}) }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: "var(--ink0)" }}>
            {monitor.origin}
          </span>
          <span style={{ color: "var(--gold3)", margin: "0 6px", fontSize: 12 }}>→</span>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: "var(--ink0)" }}>
            {monitor.destination}
          </span>
        </div>
        <span className="badge" style={{
          color: points ? "var(--gold)" : "var(--ink3)",
          borderColor: points ? "var(--gold)" : "var(--border)",
          fontSize: 9,
        }}>
          {points ? "◆ Available" : "Monitoring"}
        </span>
      </div>

      <p style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 12,
        fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.05em" }}>
        {monthLabel} · {monitor.cabin} class
      </p>

      <div className="gold-rule" style={{ marginBottom: 12 }} />

      {points ? (
        <>
          <div className="mono" style={{ fontSize: 26, color: "var(--gold)", marginBottom: 2 }}>
            {points.toLocaleString()} <span style={{ fontSize: 16, fontWeight: 400 }}>Avios</span>
          </div>
          {surcharge && (
            <div style={{ fontSize: 12, color: "var(--ink2)",
              fontFamily: "'Cormorant Garamond', serif" }}>
              + CAD {surcharge.toFixed(2)} taxes &amp; fees
            </div>
          )}
          <a href="https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html"
            target="_blank" rel="noopener noreferrer"
            className="btn-gold"
            style={{ display: "inline-block", marginTop: 14, textDecoration: "none" }}>
            Book on Qatar →
          </a>
        </>
      ) : (
        <div style={{ color: "var(--ink3)", fontFamily: "'Cormorant Garamond', serif",
          fontStyle: "italic", fontSize: 14 }}>
          No award seats found yet.<br />Checked daily.
        </div>
      )}

      <div style={{ fontSize: 10, color: "var(--ink3)", marginTop: 12,
        fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.05em" }}>
        QATAR AIRWAYS · PRIVILEGE CLUB
      </div>
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
    <div>
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg1)", backgroundImage: "var(--noise)",
        border: "1px solid var(--border)", borderRadius: 4,
        padding: "36px 40px", marginBottom: 40,
        position: "relative", overflow: "hidden",
      }}>
        {/* Watermark */}
        <div className="watermark" style={{ right: 32, bottom: -10, fontSize: 100 }}>✈</div>
        {/* Gold sweep rule from top-left */}
        <div style={{
          position: "absolute", top: 0, left: 0, width: "60%", height: 2,
          background: "linear-gradient(90deg, var(--gold), var(--gold2), transparent)",
        }} />

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          flexWrap: "wrap", gap: 16, position: "relative" }}>
          <div>
            <h1 style={{ fontSize: 36, lineHeight: 1.1, marginBottom: 6,
              fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: "var(--ink0)" }}>
              Flight Price Tracker
            </h1>
            {/* Diamond ornament between headline and subtext */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 8 }}>
              <div style={{ height: 1, width: 40, background: "var(--gold-rule)" }} />
              <span style={{ color: "var(--gold3)", fontSize: 8, margin: "0 8px" }}>◆</span>
              <div style={{ height: 1, width: 40, background: "var(--gold-rule)" }} />
            </div>
            <p style={{ fontSize: 14, color: "var(--ink2)", fontFamily: "'EB Garamond', serif",
              fontStyle: "italic", letterSpacing: "0.02em" }}>
              YYC · YYZ domestic fares &nbsp;·&nbsp; Qatar Airways award availability
            </p>
          </div>

          {/* Status chips */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)",
              borderRadius: 2, padding: "6px 14px", fontSize: 12,
              fontFamily: "'Cormorant Garamond', serif", display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "var(--ink3)" }}>RapidAPI</span>
              <span style={{ fontWeight: 700, color: rapidColor }}>{rapidUsed}/10</span>
              <span style={{ color: "var(--ink3)" }}>this month</span>
            </div>
            {lastRun && (
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)",
                borderRadius: 2, padding: "6px 14px", fontSize: 12,
                fontFamily: "'Cormorant Garamond', serif", display: "flex", gap: 8, alignItems: "center" }}>
                <StatusDot status={lastRun.status} />
                <span style={{ color: "var(--ink2)" }}>
                  Last run: <span style={{ color: "var(--ink0)", fontWeight: 600 }}>{lastRun.status}</span>
                </span>
                <span style={{ color: "var(--ink3)" }}>
                  {new Date(lastRun.started_at).toLocaleDateString("en-CA")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Cash monitors ────────────────────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, color: "var(--ink3)", letterSpacing: "0.12em",
            fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, margin: 0,
            textTransform: "uppercase" }}>
            Cash Fares
          </h2>
          <div style={{ flex: 1, height: 1,
            background: "linear-gradient(90deg, var(--gold-rule), transparent)" }} />
          <span style={{ fontSize: 11, color: "var(--ink3)",
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic" }}>
            Air Canada · WestJet · Flair
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {CASH_MONITORS.map(m => (
            <MonitorCard key={m.id} monitor={m}
              quote={quotes.find((q: any) => q.monitor_id === m.id)}
              pred={preds.find((p: any) => p.monitor_id === m.id)}
              best={bests.find((b: any) => b.monitor_id === m.id)?.best_price ?? null}
            />
          ))}
        </div>
      </section>

      {/* ── Award monitors ───────────────────────────────────────── */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, color: "var(--ink3)", letterSpacing: "0.12em",
            fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, margin: 0,
            textTransform: "uppercase" }}>
            Qatar Airways Awards
          </h2>
          <div style={{ flex: 1, height: 1,
            background: "linear-gradient(90deg, var(--gold-rule), transparent)" }} />
          <span style={{ fontSize: 11, color: "var(--ink3)",
            fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic" }}>
            Business Class · Privilege Club
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {AWARD_MONITORS.map(m => (
            <AwardCard key={m.id} monitor={m}
              quote={quotes.find((q: any) => q.monitor_id === m.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
