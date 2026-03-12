// apps/worker/src/telegram/bot.ts
//
// Sends ONE consolidated Telegram message per scraper run.
// All price drops, new lows, and award availability are bundled together.

import TelegramBot from "node-telegram-bot-api";
import { FlightResult } from "@flight-tracker/shared";

export interface AlertItem {
  result: FlightResult;
  alertType: "new_low" | "price_drop" | "award_available" | "threshold_breach";
  previousPrice?: number;
  previousPoints?: number;
  avgPrice?: number;
  isNewLow?: boolean;
}

export class TelegramAlerter {
  private bot: TelegramBot;
  private chatId: string;

  constructor(token: string, chatId: string) {
    this.bot = new TelegramBot(token);
    this.chatId = chatId;
  }

  /** Send one condensed message summarising all alerts from this run */
  async sendConsolidatedAlert(alerts: AlertItem[]): Promise<string | null> {
    if (alerts.length === 0) return null;

    const message = this.buildConsolidatedMessage(alerts);

    try {
      const sent = await this.bot.sendMessage(this.chatId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
      return sent.message_id.toString();
    } catch (err) {
      console.error("[Telegram] Failed to send consolidated alert:", err);
      throw err;
    }
  }

  /** Send a plain info/status message (for health reports etc.) */
  async sendMessage(text: string): Promise<void> {
    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    } catch (err) {
      console.error("[Telegram] sendMessage error:", err);
    }
  }

  private buildConsolidatedMessage(alerts: AlertItem[]): string {
    const now = new Date().toLocaleString("en-CA", {
      timeZone: "America/Toronto",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const cashAlerts = alerts.filter((a) => !a.result.isAward);
    const awardAlerts = alerts.filter((a) => a.result.isAward);

    const lines: string[] = [
      `✈️ *Flight Tracker Daily Report*`,
      `🕐 ${now} EDT`,
      `📊 ${alerts.length} alert${alerts.length !== 1 ? "s" : ""} found`,
      ``,
    ];

    // ── Cash Fare Alerts ──────────────────────────────────────────────────
    if (cashAlerts.length > 0) {
      lines.push(`💰 *CASH FARE ALERTS (${cashAlerts.length})*`);
      lines.push(`${"─".repeat(30)}`);

      for (const alert of cashAlerts) {
        const r = alert.result;
        const price = r.totalPrice
          ? `*CAD $${r.totalPrice.toFixed(2)}*`
          : "Price N/A";
        const badge = this.alertBadge(alert.alertType);
        const routeEmoji = this.routeEmoji(r.origin, r.destination);

        lines.push(
          `${routeEmoji} ${r.origin} → ${r.destination} | ${r.departureDate}`
        );
        lines.push(`  ${price}   ${badge}`);
        lines.push(`  ✈️ ${r.airline}${r.flightNumber ? ` ${r.flightNumber}` : ""}`);
        lines.push(`  ⏱ ${r.duration} | ${this.stopsLabel(r.stops)}`);

        if (alert.previousPrice && alert.previousPrice > r.totalPrice!) {
          const saved = (alert.previousPrice - r.totalPrice!).toFixed(2);
          lines.push(`  📉 Down $${saved} from previous $${alert.previousPrice.toFixed(2)}`);
        }
        if (alert.avgPrice) {
          const diff = (r.totalPrice! - alert.avgPrice).toFixed(2);
          const sign = parseFloat(diff) < 0 ? "" : "+";
          lines.push(`  📊 ${sign}$${diff} vs 14-day avg ($${alert.avgPrice.toFixed(2)})`);
        }

        lines.push(`  🔗 [Book Now](${r.bookingUrl})`);
        lines.push(``);
      }
    }

    // ── Award Alerts ──────────────────────────────────────────────────────
    if (awardAlerts.length > 0) {
      lines.push(`🏆 *QATAR AWARD ALERTS (${awardAlerts.length})*`);
      lines.push(`${"─".repeat(30)}`);

      for (const alert of awardAlerts) {
        const r = alert.result;
        const destName = this.destName(r.destination);
        const cabin = (r.cabin ?? "business").toUpperCase();

        lines.push(
          `🌍 YYZ → ${destName} (${r.destination}) | ${this.formatMonth(r.departureDate)}`
        );
        lines.push(`  🏷️ ${cabin} CLASS — AVAILABILITY FOUND`);

        if (r.pointsCost) {
          const surcharge = r.cashSurcharge
            ? ` + $${r.cashSurcharge} ${r.currency}`
            : "";
          lines.push(`  💎 *${r.pointsCost.toLocaleString()} Avios*${surcharge}`);
        }

        if (alert.previousPoints && r.pointsCost && r.pointsCost < alert.previousPoints) {
          const saved = alert.previousPoints - r.pointsCost;
          lines.push(`  📉 Down ${saved.toLocaleString()} Avios vs previous`);
        }

        lines.push(`  🔗 [Book on Qatar](${r.bookingUrl})`);
        lines.push(``);
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────
    lines.push(`${"─".repeat(30)}`);
    lines.push(`_Flight Tracker • Next check in ~24h_`);

    return lines.join("\n");
  }

  private alertBadge(type: AlertItem["alertType"]): string {
    const badges: Record<AlertItem["alertType"], string> = {
      new_low: "🏆 NEW ALL-TIME LOW",
      price_drop: "📉 PRICE DROP",
      award_available: "🎫 AWARD AVAILABLE",
      threshold_breach: "🎯 BELOW THRESHOLD",
    };
    return badges[type];
  }

  private routeEmoji(origin: string, destination: string): string {
    if (origin === "YYC" || destination === "YYC") return "🏔️";
    if (origin === "YYZ" || destination === "YYZ") return "🗼";
    return "✈️";
  }

  private stopsLabel(stops: number): string {
    if (stops === 0) return "Nonstop";
    return `${stops} stop${stops > 1 ? "s" : ""}`;
  }

  private destName(code: string): string {
    const names: Record<string, string> = {
      ISB: "Islamabad, PK",
      IST: "Istanbul (IST)",
      SAW: "Istanbul Sabiha (SAW)",
    };
    return names[code] ?? code;
  }

  private formatMonth(dateStr: string): string {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr + "-01");
      return d.toLocaleString("en-CA", { month: "long", year: "numeric" });
    } catch {
      return dateStr;
    }
  }
}
