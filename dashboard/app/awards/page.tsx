import { getLatestQuotes } from "../../lib/db";
import { AWARD_MONITORS, fmtMonth } from "../../lib/monitors";

export const revalidate = 300;

export default async function AwardsPage() {
  const quotes = await getLatestQuotes();

  const groups = [
    { dest:"ISB", label:"YYZ → Islamabad, Pakistan (ISB)" },
    { dest:"IST", label:"YYZ → Istanbul Airport, Turkey (IST)" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">🎫 Qatar Airways Awards</h1>
        <p className="text-sm mt-1" style={{ color:"var(--text2)" }}>
          Business Class (Qsuite) from Toronto YYZ · monitored daily
        </p>
      </div>

      {groups.map(({ dest, label }) => {
        const monitors = AWARD_MONITORS.filter(m => m.destination === dest);
        return (
          <section key={dest}>
            <h2 className="text-sm font-semibold mb-3" style={{ color:"var(--accent2)" }}>
              ✈ {label}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {monitors.map(m => {
                const q = quotes.find(x => x.monitor_id === m.id);
                const pts = q?.points_cost ? parseInt(q.points_cost) : null;
                const sur = q?.cash_surcharge ? parseFloat(q.cash_surcharge) : null;
                return (
                  <div key={m.id} className="card p-5"
                    style={pts ? { borderColor:"rgba(59,130,246,0.35)" } : {}}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold" style={{ color:"var(--text1)" }}>
                        {fmtMonth(m.month)}
                      </span>
                      <span className="badge" style={pts
                        ? { background:"rgba(59,130,246,0.15)", color:"var(--accent2)" }
                        : { background:"rgba(255,255,255,0.04)", color:"var(--text3)" }}>
                        {pts ? "Available" : "None found"}
                      </span>
                    </div>
                    <p className="text-xs mb-3" style={{ color:"var(--text3)" }}>
                      {m.cabin} class · {m.airline}
                    </p>
                    {pts ? (
                      <>
                        <div className="mono text-xl font-bold" style={{ color:"var(--accent2)" }}>
                          {pts.toLocaleString()} Avios
                        </div>
                        {sur && (
                          <div className="text-sm mt-0.5" style={{ color:"var(--text2)" }}>
                            + CAD {sur.toFixed(2)} taxes
                          </div>
                        )}
                        <a href="https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html"
                          target="_blank" rel="noopener noreferrer"
                          className="inline-block mt-3 text-xs px-3 py-1 rounded-lg"
                          style={{ background:"rgba(59,130,246,0.1)", color:"var(--accent2)",
                            border:"1px solid rgba(59,130,246,0.2)" }}>
                          Book Now →
                        </a>
                      </>
                    ) : (
                      <p className="text-sm" style={{ color:"var(--text3)" }}>
                        No seats found yet. Checking daily.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="card p-5 text-sm" style={{ color:"var(--text2)" }}>
        <p className="font-semibold mb-2" style={{ color:"var(--text1)" }}>ℹ About Award Monitoring</p>
        <ul className="space-y-1 list-disc list-inside" style={{ color:"var(--text3)" }}>
          <li>Awards scraped daily via Qatar Privilege Club website</li>
          <li>seats.aero API used as faster fallback when configured</li>
          <li>All searches target Business Class (Qsuite where available)</li>
          <li>Always confirm pricing directly on Qatar&apos;s website before booking</li>
        </ul>
      </div>
    </div>
  );
}
