import { getLatestQuotes } from "../../lib/db";
import { AWARD_MONITORS, fmtMonth } from "../../lib/monitors";

export const revalidate = 300;

export default async function AwardsPage() {
  const quotes = await getLatestQuotes();

  const groups = [
    { dest: "ISB", label: "YYZ → Islamabad, Pakistan" },
    { dest: "IST", label: "YYZ → Istanbul, Turkey" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32,
          fontWeight: 600, color: "var(--ink0)", marginBottom: 6 }}>
          Qatar Airways Awards
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 8 }}>
          <div style={{ height: 1, width: 32, background: "var(--gold-rule)" }} />
          <span style={{ color: "var(--gold3)", fontSize: 7, margin: "0 8px" }}>◆</span>
          <div style={{ height: 1, width: 32, background: "var(--gold-rule)" }} />
        </div>
        <p style={{ fontSize: 13, color: "var(--ink3)", fontFamily: "'Cormorant Garamond', serif",
          fontStyle: "italic" }}>
          Business Class (Qsuite) from Toronto YYZ · monitored daily via Privilege Club
        </p>
      </div>

      {groups.map(({ dest, label }) => {
        const monitors = AWARD_MONITORS.filter(m => m.destination === dest);
        return (
          <section key={dest} style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <h2 style={{ fontSize: 13, color: "var(--gold)", letterSpacing: "0.1em",
                fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, margin: 0,
                textTransform: "uppercase" }}>
                ✈ {label}
              </h2>
              <div style={{ flex: 1, height: 1,
                background: "linear-gradient(90deg, var(--gold-rule), transparent)" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {monitors.map(m => {
                const q = quotes.find((x: any) => x.monitor_id === m.id);
                const pts = q?.points_cost ? parseInt(q.points_cost) : null;
                const sur = q?.cash_surcharge ? parseFloat(q.cash_surcharge) : null;
                return (
                  <div key={m.id} className="card card-gold-rule" style={{
                    padding: 18,
                    ...(pts ? {
                      borderColor: "var(--gold)",
                      boxShadow: "0 2px 16px rgba(168,120,42,0.12)",
                    } : {}),
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", marginBottom: 10 }}>
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18,
                        fontWeight: 700, color: "var(--ink0)" }}>
                        {fmtMonth(m.month)}
                      </span>
                      <span className="badge" style={{
                        color: pts ? "var(--gold)" : "var(--ink3)",
                        borderColor: pts ? "var(--gold)" : "var(--border)", fontSize: 9,
                      }}>
                        {pts ? "◆ Available" : "None found"}
                      </span>
                    </div>

                    <div className="gold-rule" style={{ marginBottom: 12 }} />

                    <p style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 10,
                      fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.04em" }}>
                      {m.cabin} class · {m.airline}
                    </p>

                    {pts ? (
                      <>
                        <div className="mono" style={{ fontSize: 22, color: "var(--gold)", marginBottom: 2 }}>
                          {pts.toLocaleString()}{" "}
                          <span style={{ fontSize: 13, fontWeight: 400 }}>Avios</span>
                        </div>
                        {sur && (
                          <div style={{ fontSize: 12, color: "var(--ink2)",
                            fontFamily: "'Cormorant Garamond', serif" }}>
                            + CAD {sur.toFixed(2)} taxes
                          </div>
                        )}
                        <a href="https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html"
                          target="_blank" rel="noopener noreferrer"
                          className="btn-gold"
                          style={{ display: "inline-block", marginTop: 12, textDecoration: "none" }}>
                          Book Now →
                        </a>
                      </>
                    ) : (
                      <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
                        color: "var(--ink3)", fontSize: 13 }}>
                        No seats found yet.<br />Checking daily.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Info note */}
      <div className="card" style={{ padding: 20 }}>
        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
          color: "var(--ink0)", fontSize: 14, marginBottom: 8 }}>
          About Award Monitoring
        </p>
        <div style={{ height: 1, background: "var(--border)", marginBottom: 10 }} />
        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13,
          color: "var(--ink2)", lineHeight: 1.8 }}>
          Awards are checked daily via the Qatar Privilege Club website. Where a seats.aero
          API key is configured, it is used as a faster primary source. All results target
          Business Class (Qsuite where available). Always confirm pricing directly on
          Qatar&apos;s website before booking.
        </p>
      </div>
    </div>
  );
}
