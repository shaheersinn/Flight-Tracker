// apps/worker/src/telegram/bot.ts
// Sends ONE consolidated Telegram message per daily run (not per monitor)

import TelegramBot from "node-telegram-bot-api";
import { FlightResult, AlertRecord, RunSummary } from "@flight-tracker/shared";

export class TelegramAlerter {
  private bot: TelegramBot;
  private chatId: string;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      throw new Error(
        "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in environment."
      );
    }

    this.bot = new TelegramBot(token, { polling: false });
    this.chatId = chatId;
  }

  /**
   * Send ONE consolidated alert message for the entire run.
   * Collects all alerts, deals, and award availability into a single message.
   */
  async sendDailyDigest(summary: RunSummary): Promise<string | null> {
    if (summary.alerts.length === 0 && summary.awardResults.length === 0) {
      console.log("[Telegram] No alerts to send today.");
      return null;
    }

    const message = this.formatDigest(summary);

    try {
      // Telegram messages have a 4096 char limit; split if needed
      const chunks = this.splitMessage(message, 4000);

      let lastMessageId: string | null = null;
      for (const chunk of chunks) {
        const result = await this.bot.sendMessage(this.chatId, chunk, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        });
        lastMessageId = result.message_id.toString();

        // Small delay between multi-part messages
        if (chunks.length > 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      console.log(`[Telegram] Digest sent (${chunks.length} part(s)).`);
      return lastMessageId;
    } catch (err: any) {
      console.error("[Telegram] Send failed:", err.message);
      throw err;
    }
  }

  /**
   * Send a simple text notification (for errors/health alerts)
   */
  async sendAdminAlert(message: string): Promise<void> {
    try {
      await this.bot.sendMessage(
        this.chatId,
        `⚠️ *Admin Alert*\n\n${message}`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      console.error("[Telegram] Admin alert failed:", err.message);
    }
  }

  private formatDigest(summary: RunSummary): string {
    const now = new Date().toLocaleString("en-CA", {
      timeZone: "America/Toronto",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const lines: string[] = [
      `✈️ *Flight Price Daily Digest*`,
      `📅 ${now} (Toronto)`,
      `━━━━━━━━━━━━━━━━━━━━`,
      "",
    ];

    // ─── Cash Fare Alerts ───────────────────────────────────────────
    const cashAlerts = summary.alerts.filter(
      (a) => a.quote.kind === "cash"
    );

    if (cashAlerts.length > 0) {
      lines.push("🏷️ *CASH FARE ALERTS*");
      lines.push("");

      for (const alert of cashAlerts) {
        const q = alert.quote;
        const emoji = this.alertEmoji(alert.alertType);
        lines.push(
          `${emoji} *${q.origin} → ${q.destination}* — ${alert.alertType.replace(/_/g, " ").toUpperCase()}`
        );
        lines.push(`   💰 CAD ${q.totalPrice?.toFixed(2)}`);
        lines.push(`   📆 ${q.departureDate}`);
        lines.push(`   ✈️ ${q.airline}${q.flightNumber ? " " + q.flightNumber : ""}`);
        lines.push(`   ⏱ ${q.duration} | ${q.stops === 0 ? "Nonstop" : q.stops + " stop(s)"}`);

        if (alert.previousBest) {
          const saving = alert.previousBest - (q.totalPrice ?? 0);
          lines.push(`   📉 Previous best: CAD ${alert.previousBest.toFixed(2)} (save CAD ${saving.toFixed(2)})`);
        }
        if (alert.dropPercent) {
          lines.push(`   📊 Price dropped ${alert.dropPercent.toFixed(1)}%`);
        }

        lines.push(`   🔗 [Book Now](${q.bookingUrl})`);
        lines.push("");
      }
    }

    // ─── Award Availability ─────────────────────────────────────────
    const awardAlerts = summary.alerts.filter(
      (a) => a.quote.kind === "award"
    );
    const newAwardResults = summary.awardResults;

    if (awardAlerts.length > 0 || newAwardResults.length > 0) {
      lines.push("🎫 *QATAR AIRWAYS AWARD AVAILABILITY*");
      lines.push("");

      const allAwardItems = [
        ...awardAlerts.map((a) => a.quote),
        ...newAwardResults.filter(
          (r) =>
            !awardAlerts.some(
              (a) =>
                (a.quote as any).fingerprint ===
                (r as any).fingerprint
            )
        ),
      ];

      // Group by destination
      const byDest: Record<string, FlightResult[]> = {};
      for (const q of allAwardItems) {
        const key = `${q.origin}→${q.destination}`;
        if (!byDest[key]) byDest[key] = [];
        byDest[key].push(q);
      }

      for (const [route, flights] of Object.entries(byDest)) {
        lines.push(`✈️ *${route}* (Qatar Business / Qsuite)`);

        // Group by month
        const byMonth: Record<string, FlightResult[]> = {};
        for (const f of flights) {
          const month = f.departureDate?.slice(0, 7) ?? "Unknown";
          if (!byMonth[month]) byMonth[month] = [];
          byMonth[month].push(f);
        }

        for (const [month, mFlights] of Object.entries(byMonth)) {
          const cheapest = mFlights.reduce((min, f) =>
            (f.pointsCost ?? Infinity) < (min.pointsCost ?? Infinity) ? f : min
          );
          const label = this.formatMonth(month);
          lines.push(`   📅 *${label}*: ${cheapest.pointsCost?.toLocaleString()} Avios + CAD ${cheapest.cashSurcharge?.toFixed(2) ?? "?"}`);
        }

        lines.push(`   🔗 [Search Qatar](https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html)`);
        lines.push("");
      }
    }

    // ─── Best Cash Fares Summary ────────────────────────────────────
    if (summary.cashResults.length > 0) {
      lines.push("📋 *TODAY'S BEST CASH FARES (all monitors)*");
      lines.push("");

      // Group by route, find cheapest per route
      const byRoute: Record<string, FlightResult[]> = {};
      for (const r of summary.cashResults) {
        const key = `${r.origin}→${r.destination}`;
        if (!byRoute[key]) byRoute[key] = [];
        byRoute[key].push(r);
      }

      for (const [route, flights] of Object.entries(byRoute)) {
        const cheapest = flights.reduce((min, f) =>
          (f.totalPrice ?? Infinity) < (min.totalPrice ?? Infinity) ? f : min
        );
        lines.push(
          `   ${route}: *CAD ${cheapest.totalPrice?.toFixed(2)}* on ${cheapest.departureDate} via ${cheapest.airline}`
        );
      }
      lines.push("");
    }

    // ─── Run Stats ──────────────────────────────────────────────────
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push(
      `📊 Checked ${summary.monitorsChecked} monitors | Found ${summary.quotesFound} quotes | ${summary.alertsTriggered} alerts triggered`
    );

    if (summary.errors.length > 0) {
      lines.push(`⚠️ ${summary.errors.length} error(s) — check logs.`);
    }

    return lines.join("\n");
  }

  private alertEmoji(type: string): string {
    switch (type) {
      case "new_all_time_low": return "🏆";
      case "significant_drop": return "📉";
      case "threshold_breach": return "🎯";
      case "award_available": return "🎫";
      case "anomaly_detected": return "⚡";
      default: return "🔔";
    }
  }

  private formatMonth(ym: string): string {
    const [year, month] = ym.split("-");
    const months = [
      "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[parseInt(month)]} ${year}`;
  }

  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    const lines = text.split("\n");
    let current = "";

    for (const line of lines) {
      if ((current + "\n" + line).length > maxLen) {
        chunks.push(current.trim());
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    return chunks;
  }
}
