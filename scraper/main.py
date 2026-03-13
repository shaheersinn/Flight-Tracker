"""
scraper/main.py
Main orchestrator — runs all monitors, collects quotes, evaluates alerts,
sends ONE Telegram digest. Entry point for GitHub Actions.

Usage:
    python -m scraper.main
    python scraper/main.py
"""

import asyncio
import logging
import os
import sys
from datetime import datetime

import dotenv
dotenv.load_dotenv()

from scraper.monitors import CASH_MONITORS, AWARD_MONITORS, ALL_MONITORS
from scraper import db
from scraper.adapters import rapidapi, google_flights, kayak, qatar_award
from scraper.telegram_bot import build_digest, send_digest
from scraper import predictor

# ─── Logging Setup ────────────────────────────────────────────────────────────

LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

log_filename = f"{LOG_DIR}/run_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_filename, encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

# Alert thresholds
SIGNIFICANT_DROP_PCT = 15.0


# ─── Alert Evaluation ─────────────────────────────────────────────────────────

def evaluate_cash_alert(monitor, quote: dict) -> dict | None:
    """Return an alert dict if the quote triggers any alert condition."""
    price = quote.get("total_price")
    if not price:
        return None

    hist_best = db.get_historical_best(monitor.id)
    last_price = db.get_last_price(monitor.id)

    # 1 — New all-time low
    if hist_best is None or price < hist_best:
        return {
            "alert_type": "new_all_time_low",
            "quote": quote,
            "previous_best": hist_best,
            "drop_pct": None,
        }

    # 2 — Significant drop vs last check
    if last_price and last_price > 0:
        drop_pct = (last_price - price) / last_price * 100
        if drop_pct >= SIGNIFICANT_DROP_PCT:
            return {
                "alert_type": "significant_drop",
                "quote": quote,
                "previous_best": hist_best,
                "drop_pct": drop_pct,
            }

    # 3 — Below user-defined threshold
    if monitor.alert_threshold and price < monitor.alert_threshold:
        return {
            "alert_type": "threshold_breach",
            "quote": quote,
            "previous_best": hist_best,
            "drop_pct": None,
        }

    return None


# ─── Main Run ─────────────────────────────────────────────────────────────────

async def run() -> None:
    logger.info("=" * 60)
    logger.info(f"🚀 Flight Tracker Run — {datetime.utcnow().isoformat()} UTC")
    logger.info("=" * 60)

    # DB setup
    db.run_schema()
    db.seed_monitors(ALL_MONITORS)
    run_id = db.start_run()

    stats = {
        "monitors_checked": 0,
        "quotes_found": 0,
        "alerts_triggered": 0,
        "errors": [],
    }

    cash_alerts: list[dict] = []
    award_results: list[dict] = []
    all_cash_results: list[dict] = []

    rapid_available = db.can_use_rapidapi()
    rapid_used = db.rapidapi_used_this_month()
    logger.info(
        f"📡 RapidAPI: {'✓ Available' if rapid_available else '✗ Limit reached'} "
        f"({rapid_used}/10 used this month)"
    )

    # ── Cash fare monitors ────────────────────────────────────────────────────
    logger.info(f"\n📋 Processing {len(CASH_MONITORS)} cash fare monitors...\n")

    for monitor in CASH_MONITORS:
        logger.info(f"  ▶ {monitor.id}  ({monitor.origin}→{monitor.destination}  "
                    f"{monitor.date_from} – {monitor.date_to})")
        stats["monitors_checked"] += 1
        results: list[dict] = []

        # Provider waterfall: RapidAPI → Google Flights → Kayak
        try:
            if rapid_available:
                logger.info("    → Trying RapidAPI...")
                results = rapidapi.scrape_window(monitor)
                logger.info(f"    → RapidAPI: {len(results)} results")

            if not results:
                logger.info("    → Trying Google Flights (Playwright)...")
                results = await google_flights.scrape_window(monitor)
                logger.info(f"    → Google Flights: {len(results)} results")

            if not results:
                logger.info("    → Trying Kayak fallback...")
                results = await kayak.scrape_window(monitor)
                logger.info(f"    → Kayak: {len(results)} results")

        except Exception as e:
            msg = f"{monitor.id}: {type(e).__name__}: {e}"
            logger.error(f"    ❌ {msg}")
            stats["errors"].append(msg)

        # Save quotes & evaluate alerts
        for q in results:
            try:
                db.save_quote(q)
                stats["quotes_found"] += 1
                all_cash_results.append(q)
            except Exception as e:
                logger.warning(f"    ⚠ save_quote failed: {e}")

        # Alert on cheapest quote
        if results:
            cheapest = min(results, key=lambda r: r.get("total_price") or 99999)
            alert = evaluate_cash_alert(monitor, cheapest)
            if alert:
                cash_alerts.append(alert)
                stats["alerts_triggered"] += 1
                logger.info(
                    f"    🔔 Alert: {alert['alert_type']} — "
                    f"CAD {cheapest.get('total_price'):.2f}"
                )

    # ── Qatar award monitors ───────────────────────────────────────────────────
    logger.info(f"\n🎫 Processing {len(AWARD_MONITORS)} Qatar award monitors...\n")

    for monitor in AWARD_MONITORS:
        logger.info(f"  ▶ {monitor.id}  ({monitor.origin}→{monitor.destination}  {monitor.month})")
        stats["monitors_checked"] += 1

        try:
            results = await qatar_award.scrape_month(monitor)
            logger.info(f"    → {len(results)} award slots found")

            for q in results:
                try:
                    db.save_quote(q)
                    stats["quotes_found"] += 1
                    award_results.append(q)
                except Exception as e:
                    logger.warning(f"    ⚠ save_quote failed: {e}")

            if results:
                stats["alerts_triggered"] += 1

        except Exception as e:
            msg = f"{monitor.id}: {type(e).__name__}: {e}"
            logger.error(f"    ❌ {msg}")
            stats["errors"].append(msg)

    # ── ML Predictions ────────────────────────────────────────────────────────
    logger.info("\n🤖 Running ML predictions...")
    try:
        predictor.run()
    except Exception as e:
        logger.warning(f"Predictor error (non-fatal): {e}")

    # ── Send ONE Telegram digest ───────────────────────────────────────────────
    logger.info("\n📨 Building and sending Telegram digest...")
    try:
        message = build_digest(
            cash_alerts=cash_alerts,
            award_results=award_results,
            all_cash_results=all_cash_results,
            run_stats=stats,
        )
        msg_id = send_digest(message)
        if msg_id:
            logger.info(f"✅ Telegram digest sent (msg_id={msg_id})")
        else:
            logger.info("ℹ Telegram not configured — digest printed to stdout")

        # Save alerts to DB
        for a in cash_alerts:
            db.save_alert(
                monitor_id=a["quote"]["monitor_id"],
                alert_type=a["alert_type"],
                message=f"{a['alert_type']} — CAD {a['quote'].get('total_price')}",
                telegram_msg_id=msg_id,
            )
        for q in award_results:
            db.save_alert(
                monitor_id=q["monitor_id"],
                alert_type="award_available",
                message=f"Award available — {q.get('points_cost')} Avios",
                telegram_msg_id=msg_id,
            )

    except Exception as e:
        stats["errors"].append(f"Telegram: {e}")
        logger.error(f"❌ Telegram failed: {e}")

    # ── Finish run ────────────────────────────────────────────────────────────
    status = (
        "success" if not stats["errors"]
        else "partial" if stats["monitors_checked"] > 0
        else "failed"
    )
    db.finish_run(
        run_id=run_id,
        status=status,
        monitors_checked=stats["monitors_checked"],
        quotes_saved=stats["quotes_found"],
        alerts_sent=stats["alerts_triggered"],
        errors=stats["errors"],
    )

    logger.info("\n" + "=" * 60)
    logger.info(f"✅ Run #{run_id} complete — {status.upper()}")
    logger.info(
        f"   Monitors: {stats['monitors_checked']} | "
        f"Quotes: {stats['quotes_found']} | "
        f"Alerts: {stats['alerts_triggered']}"
    )
    if stats["errors"]:
        logger.info(f"   Errors ({len(stats['errors'])}):")
        for e in stats["errors"]:
            logger.info(f"     - {e}")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(run())
