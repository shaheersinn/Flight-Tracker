"""
scraper/telegram_bot.py
Sends ONE condensed daily digest to Telegram covering all alerts.
Never sends multiple messages per monitor — everything goes in a single message.
"""

import os
import logging
from typing import Optional
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)

try:
    import telegram
    TELEGRAM_AVAILABLE = True
except ImportError:
    TELEGRAM_AVAILABLE = False
    logger.warning("python-telegram-bot not installed. Alerts will be logged only.")


def _get_bot():
    if not TELEGRAM_AVAILABLE:
        return None
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return None
    return telegram.Bot(token=token)


def _get_chat_id() -> Optional[str]:
    return os.environ.get("TELEGRAM_CHAT_ID")


def _alert_emoji(alert_type: str) -> str:
    return {
        "new_all_time_low": "🏆",
        "significant_drop": "📉",
        "threshold_breach": "🎯",
        "award_available": "🎫",
        "anomaly_detected": "⚡",
    }.get(alert_type, "🔔")


def _format_month(ym: str) -> str:
    """'2027-06' → 'Jun 2027'"""
    months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    y, m = ym.split("-")
    return f"{months[int(m)]} {y}"


def build_digest(
    cash_alerts: list[dict],
    award_results: list[dict],
    all_cash_results: list[dict],
    run_stats: dict,
) -> str:
    """
    Build the single consolidated Telegram message for the day.

    cash_alerts     : list of {alert_type, quote, previous_best, drop_pct}
    award_results   : list of award quote dicts (any availability found)
    all_cash_results: every cash quote scraped today (for best-price summary)
    run_stats       : {monitors_checked, quotes_found, alerts_triggered, errors}
    """
    now = datetime.now().strftime("%b %d %Y, %-I:%M %p")
    lines = [
        "✈️ *Flight Price Daily Digest*",
        f"📅 {now} ET",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
    ]

    # ── Cash fare alerts ─────────────────────────────────────────────────────
    if cash_alerts:
        lines.append("🏷️ *CASH FARE ALERTS*")
        lines.append("")
        for a in cash_alerts:
            q = a["quote"]
            emoji = _alert_emoji(a["alert_type"])
            route = f"{q['origin']} → {q['destination']}"
            label = a["alert_type"].replace("_", " ").upper()
            lines.append(f"{emoji} *{route}* — {label}")
            lines.append(f"   💰 CAD {q['total_price']:.2f}")
            lines.append(f"   📆 {q.get('departure_date', 'N/A')}")
            lines.append(f"   ✈️ {q['airline']}"
                         + (f" {q['flight_number']}" if q.get("flight_number") else ""))
            lines.append(f"   ⏱ {q.get('duration','N/A')} · "
                         + ("Nonstop" if q.get("stops") == 0 else f"{q.get('stops')} stop(s)"))
            if a.get("previous_best"):
                saving = a["previous_best"] - q["total_price"]
                lines.append(f"   📉 Prev best: CAD {a['previous_best']:.2f}  "
                              f"(save CAD {saving:.2f})")
            if a.get("drop_pct"):
                lines.append(f"   📊 Dropped {a['drop_pct']:.1f}%")
            lines.append(f"   🔗 [Book Now]({q.get('booking_url', 'https://google.com/travel/flights')})")
            lines.append("")

    # ── Qatar award availability ──────────────────────────────────────────────
    if award_results:
        lines.append("🎫 *QATAR AIRWAYS AWARD AVAILABILITY*")
        lines.append("   Business / Qsuite from YYZ")
        lines.append("")

        # Group by route
        by_route: dict[str, list] = {}
        for q in award_results:
            key = f"{q['origin']}→{q['destination']}"
            by_route.setdefault(key, []).append(q)

        for route, flights in by_route.items():
            # Find cheapest points for this route
            cheapest = min(flights, key=lambda f: f.get("points_cost") or 999999)
            lines.append(f"✈️ *{route}*")
            # Group by month within route
            by_month: dict[str, list] = {}
            for f in flights:
                m = (f.get("departure_date") or "")[:7] or f.get("month", "N/A")
                by_month.setdefault(m, []).append(f)
            for month_key, mflights in sorted(by_month.items()):
                best = min(mflights, key=lambda f: f.get("points_cost") or 999999)
                pts = best.get("points_cost")
                sur = best.get("cash_surcharge")
                pts_str = f"{pts:,}" if pts else "N/A"
                sur_str = f"CAD {sur:.2f}" if sur else "N/A"
                label = _format_month(month_key) if len(month_key) == 7 else month_key
                lines.append(f"   📅 *{label}*: {pts_str} Avios + {sur_str} taxes")
            lines.append("   🔗 [Book on Qatar](https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html)")
            lines.append("")

    # ── Best prices summary (all monitors) ───────────────────────────────────
    if all_cash_results:
        lines.append("📋 *TODAY'S BEST CASH FARES*")
        by_route: dict[str, list] = {}
        for r in all_cash_results:
            key = f"{r['origin']}→{r['destination']}"
            by_route.setdefault(key, []).append(r)
        for route, flights in sorted(by_route.items()):
            best = min(flights, key=lambda f: f.get("total_price") or 99999)
            lines.append(
                f"   {route}: *CAD {best['total_price']:.2f}* on "
                f"{best.get('departure_date','?')} via {best['airline']}"
            )
        lines.append("")

    # ── Nothing to report ────────────────────────────────────────────────────
    if not cash_alerts and not award_results:
        lines.append("📭 *No new alerts today*")
        lines.append("All prices within normal ranges.")
        lines.append("")

    # ── Run stats ────────────────────────────────────────────────────────────
    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append(
        f"📊 {run_stats.get('monitors_checked',0)} monitors · "
        f"{run_stats.get('quotes_found',0)} quotes · "
        f"{run_stats.get('alerts_triggered',0)} alerts"
    )
    if run_stats.get("errors"):
        lines.append(f"⚠️ {len(run_stats['errors'])} error(s) — check logs")

    return "\n".join(lines)


def _split_message(text: str, max_len: int = 4000) -> list[str]:
    """Split message into chunks ≤ max_len chars on line boundaries."""
    if len(text) <= max_len:
        return [text]
    chunks, current = [], ""
    for line in text.split("\n"):
        candidate = current + "\n" + line if current else line
        if len(candidate) > max_len:
            if current:
                chunks.append(current.strip())
            current = line
        else:
            current = candidate
    if current.strip():
        chunks.append(current.strip())
    return chunks


async def send_digest_async(message: str) -> Optional[str]:
    """Send one (or more, if long) Telegram message. Returns last message_id."""
    bot = _get_bot()
    chat_id = _get_chat_id()

    if not bot or not chat_id:
        logger.warning("[Telegram] Bot or chat ID not configured. Printing digest only:")
        print(message)
        return None

    chunks = _split_message(message)
    last_id = None
    for i, chunk in enumerate(chunks):
        try:
            result = await bot.send_message(
                chat_id=chat_id,
                text=chunk,
                parse_mode="Markdown",
                disable_web_page_preview=True,
            )
            last_id = str(result.message_id)
            if i < len(chunks) - 1:
                await asyncio.sleep(0.5)
        except Exception as e:
            logger.error(f"[Telegram] Send failed (chunk {i+1}): {e}")

    return last_id


def send_digest(message: str) -> Optional[str]:
    """Synchronous wrapper around send_digest_async."""
    return asyncio.run(send_digest_async(message))


async def send_admin_alert_async(text: str) -> None:
    bot = _get_bot()
    chat_id = _get_chat_id()
    if not bot or not chat_id:
        logger.warning(f"[Telegram] Admin alert (no bot configured): {text}")
        return
    try:
        await bot.send_message(
            chat_id=chat_id,
            text=f"⚠️ *Admin Alert*\n\n{text}",
            parse_mode="Markdown",
        )
    except Exception as e:
        logger.error(f"[Telegram] Admin alert failed: {e}")
