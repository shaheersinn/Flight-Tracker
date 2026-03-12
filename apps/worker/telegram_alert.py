# apps/worker/telegram_alert.py
#
# Sends ONE consolidated Telegram message per scraper run.
# Uses the Bot API directly via requests (no library dependency).

import os
import requests
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

TORONTO_TZ = ZoneInfo("America/Toronto")


def _now_toronto() -> str:
    return datetime.now(TORONTO_TZ).strftime("%b %d, %Y %I:%M %p EDT")


def _dest_name(code: str) -> str:
    names = {
        "ISB": "Islamabad, PK",
        "IST": "Istanbul (IST)",
        "SAW": "Istanbul Sabiha (SAW)",
    }
    return names.get(code, code)


def _format_month(date_str: str) -> str:
    if not date_str:
        return ""
    try:
        parts = date_str.split("-")
        d = datetime(int(parts[0]), int(parts[1]), 1)
        return d.strftime("%B %Y")
    except Exception:
        return date_str


def _stops_label(stops: int) -> str:
    if stops == 0:
        return "Nonstop"
    return f"{stops} stop{'s' if stops > 1 else ''}"


def _alert_badge(alert_type: str) -> str:
    return {
        "new_low": "🏆 NEW ALL-TIME LOW",
        "price_drop": "📉 PRICE DROP",
        "award_available": "🎫 AWARD AVAILABLE",
        "threshold_breach": "🎯 BELOW THRESHOLD",
    }.get(alert_type, alert_type.upper())


def build_message(alerts: list[dict]) -> str:
    """
    Build the full consolidated Telegram message from a list of alert dicts.

    Each alert dict contains:
        result       – the FlightResult dict
        alert_type   – "new_low" | "price_drop" | "award_available" | "threshold_breach"
        previous_price  – (optional) float
        previous_points – (optional) int
        avg_price    – (optional) float
    """
    cash_alerts = [a for a in alerts if not a["result"].get("is_award")]
    award_alerts = [a for a in alerts if a["result"].get("is_award")]

    lines = [
        "✈️ *Flight Tracker Daily Report*",
        f"🕐 {_now_toronto()}",
        f"📊 {len(alerts)} alert{'s' if len(alerts) != 1 else ''} found",
        "",
    ]

    # ── Cash Fare Section ──────────────────────────────────────────────────
    if cash_alerts:
        lines.append(f"💰 *CASH FARE ALERTS ({len(cash_alerts)})*")
        lines.append("─" * 30)

        for alert in cash_alerts:
            r = alert["result"]
            price = r.get("total_price")
            badge = _alert_badge(alert["alert_type"])
            route_emoji = "🏔️" if "YYC" in (r["origin"] + r["destination"]) else "🗼"

            lines.append(f"{route_emoji} {r['origin']} → {r['destination']} | {r.get('departure_date','')}")
            lines.append(f"  *CAD ${price:.2f}*   {badge}" if price else f"  {badge}")
            lines.append(f"  ✈️ {r.get('airline','')}{' ' + r['flight_number'] if r.get('flight_number') else ''}")
            lines.append(f"  ⏱ {r.get('duration','')} | {_stops_label(r.get('stops', 0))}")

            prev = alert.get("previous_price")
            if prev and price and prev > price:
                lines.append(f"  📉 Down ${prev - price:.2f} from previous ${prev:.2f}")

            avg = alert.get("avg_price")
            if avg and price:
                diff = price - avg
                sign = "+" if diff >= 0 else ""
                lines.append(f"  📊 {sign}${diff:.2f} vs 14-day avg (${avg:.2f})")

            lines.append(f"  🔗 [Book Now]({r.get('booking_url','')})")
            lines.append("")

    # ── Award Section ──────────────────────────────────────────────────────
    if award_alerts:
        lines.append(f"🏆 *QATAR AWARD ALERTS ({len(award_alerts)})*")
        lines.append("─" * 30)

        for alert in award_alerts:
            r = alert["result"]
            dest_name = _dest_name(r["destination"])
            cabin = (r.get("cabin") or "business").upper()
            points = r.get("points_cost")
            surcharge = r.get("cash_surcharge")

            lines.append(f"🌍 YYZ → {dest_name} | {_format_month(r.get('departure_date',''))}")
            lines.append(f"  🏷️ {cabin} CLASS — AVAILABILITY FOUND")

            if points:
                surcharge_str = f" + ${surcharge} {r.get('currency','USD')}" if surcharge else ""
                lines.append(f"  💎 *{points:,} Avios*{surcharge_str}")

            prev_pts = alert.get("previous_points")
            if prev_pts and points and points < prev_pts:
                lines.append(f"  📉 Down {prev_pts - points:,} Avios vs previous")

            lines.append(f"  🔗 [Book on Qatar]({r.get('booking_url','')})")
            lines.append("")

    # ── Footer ─────────────────────────────────────────────────────────────
    lines.append("─" * 30)
    lines.append("_Flight Tracker • Next check in ~24h_")

    return "\n".join(lines)


def send_consolidated_alert(alerts: list[dict]) -> str | None:
    """Send one Telegram message with all alerts. Returns message_id or None."""
    if not alerts:
        return None

    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    text = build_message(alerts)

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }

    try:
        resp = requests.post(url, json=payload, timeout=15)
        resp.raise_for_status()
        message_id = str(resp.json()["result"]["message_id"])
        print(f"  [Telegram] Sent consolidated alert (message_id={message_id})")
        return message_id
    except Exception as e:
        print(f"  [Telegram] Failed to send: {e}")
        raise
