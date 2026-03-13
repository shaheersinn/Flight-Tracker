// apps/web/app/awards/page.tsx
import { awardMonitors } from "@flight-tracker/shared";
import { getLatestQuotes, getAwardSlots } from "../../lib/db";
import { AwardCard } from "../../components/AwardCard";

export const revalidate = 300;

export default async function AwardsPage() {
  const quotes = await getLatestQuotes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>
          Qatar Airways Award Availability
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
          Privilege Club business class from Toronto (YYZ) — monitored daily
        </p>
      </div>

      {/* Group by destination */}
      {[
        { dest: "ISB", label: "✈ YYZ → Islamabad, Pakistan (ISB)" },
        { dest: "IST", label: "✈ YYZ → Istanbul, Turkey (IST)" },
      ].map(({ dest, label }) => {
        const monitors = awardMonitors.filter((m) => m.destination === dest);
        return (
          <section key={dest}>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--accent-light)" }}
            >
              {label}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {monitors.map((monitor) => {
                const quote = quotes.find(
                  (q) => q.monitor_id === monitor.id
                );
                return (
                  <AwardCard
                    key={monitor.id}
                    monitor={monitor}
                    latestQuote={quote}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Info panel */}
      <div
        className="glass p-5 rounded-xl text-sm"
        style={{ color: "var(--text-2)" }}
      >
        <h3 className="font-semibold mb-2" style={{ color: "var(--text-1)" }}>
          ℹ️ About Award Monitoring
        </h3>
        <ul className="space-y-1 list-disc list-inside" style={{ color: "var(--text-3)" }}>
          <li>Awards are checked once daily via Qatar Privilege Club website</li>
          <li>Seats.aero API is used as a faster fallback (if API key configured)</li>
          <li>All award searches target Business class (Qsuite where available)</li>
          <li>Avios pricing may vary — check Qatar&apos;s site for confirmation</li>
          <li>
            Book directly at{" "}
            <a
              href="https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-light)" }}
            >
              Qatar Privilege Club
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
