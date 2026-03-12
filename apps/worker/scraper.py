#!/usr/bin/env python3
# apps/worker/scraper.py
#
# Main Python entry point for the daily flight scraper.
# Run with:  python scraper.py
#
# Flow:
#   1. Iterate all cash monitors → scrape via Playwright (+ RapidAPI supplement)
#   2. Iterate all award monitors → scrape via Seats.aero / Qatar direct
#   3. Save new quotes to DB; compare with historical data
#   4. Collect alert-worthy results
#   5. Send ONE consolidated Telegram message

import os
import sys
import time
import traceback

# Load .env when running locally
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import db
from monitors import CASH_MONITORS, AWARD_MONITORS
from adapters.google_flights import scrape_cash_window
from adapters.rapidapi_flights import scrape_cash_midpoint
from adapters.qatar_award import scrape_award_month
from telegram_alert import send_consolidated_alert

# ── Thresholds ───────────────────────────────────────────────────────────────
PRICE_DROP_THRESHOLD = 0.12   # 12% drop triggers alert
CASH_FLOOR_CAD = 160.0        # always alert if price ≤ this
POINTS_DROP_THRESHOLD = 0.10  # 10% avios drop triggers alert


def pick_best(results: list[dict], kind: str) -> dict | None:
    """Return the cheapest result from the list."""
    if not results:
        return None
    field = "total_price" if kind == "cash" else "points_cost"
    valid = [r for r in results if r.get(field) is not None]
    if not valid:
        return None
    return min(valid, key=lambda r: r[field])


def evaluate_alerts(best: dict, monitor: dict) -> dict | None:
    """
    Compare best result against DB history and return an alert dict or None.
    """
    kind = monitor["kind"]
    monitor_id = monitor["id"]

    prev = db.get_previous_best(monitor_id, kind)
    avg_price = db.get_average_price(monitor_id) if kind == "cash" else None

    if kind == "cash":
        price = best.get("total_price")
        if price is None:
            return None
        prev_price = prev.get("total_price") if prev else None
        is_new_low = prev_price is None or price < prev_price
        is_drop = prev_price is not None and (prev_price - price) / prev_price >= PRICE_DROP_THRESHOLD
        is_floor = price <= CASH_FLOOR_CAD

        if not (is_new_low or is_drop or is_floor):
            return None

        return {
            "result": best,
            "alert_type": "new_low" if is_new_low else ("threshold_breach" if is_floor else "price_drop"),
            "previous_price": prev_price,
            "avg_price": avg_price,
        }

    else:  # award
        points = best.get("points_cost")
        if points is None:
            # Still flag availability even without point cost
            return {
                "result": best,
                "alert_type": "award_available",
                "previous_points": None,
            }
        prev_points = prev.get("points_cost") if prev else None
        is_new_low = prev_points is None or points < prev_points
        is_drop = (
            prev_points is not None
            and (prev_points - points) / prev_points >= POINTS_DROP_THRESHOLD
        )
        if not (is_new_low or is_drop):
            return None
        return {
            "result": best,
            "alert_type": "new_low" if is_new_low else "price_drop",
            "previous_points": prev_points,
        }


def main():
    run_id = db.create_run()
    print(f"\n🚀 Flight Tracker Python run #{run_id} starting…\n")

    errors = []
    monitors_checked = 0
    quotes_saved = 0
    all_alerts = []

    rapidapi_key = os.environ.get("RAPIDAPI_KEY", "")

    # ── Cash monitors ─────────────────────────────────────────────────────────
    for monitor in CASH_MONITORS:
        print(f"\n📍 Cash: {monitor['id']}")
        results = []

        try:
            # Primary: Playwright
            results = scrape_cash_window(monitor)
            print(f"  [Playwright] {len(results)} results")

            # Supplement with RapidAPI if key available
            if rapidapi_key:
                rapid_results = scrape_cash_midpoint(monitor, rapidapi_key)
                results.extend(rapid_results)

            # Save all to DB
            for r in results:
                quote_id = db.save_quote(monitor["id"], r)
                if quote_id:
                    quotes_saved += 1

            # Pick best and check if alert-worthy
            best = pick_best(results, "cash")
            if best:
                alert = evaluate_alerts(best, monitor)
                if alert:
                    all_alerts.append(alert)

            monitors_checked += 1
            print(f"  ✅ {len(results)} quotes, {'1 alert' if best and evaluate_alerts(best, monitor) else 'no alert'}")

        except Exception as e:
            tb = traceback.format_exc()
            print(f"  ❌ Error: {e}\n{tb}")
            errors.append({"monitor_id": monitor["id"], "error": str(e)})

        time.sleep(1.5)

    # ── Award monitors ────────────────────────────────────────────────────────
    for monitor in AWARD_MONITORS:
        print(f"\n📍 Award: {monitor['id']}")
        results = []

        try:
            results = scrape_award_month(monitor)
            print(f"  [Qatar] {len(results)} results")

            for r in results:
                quote_id = db.save_quote(monitor["id"], r)
                if quote_id:
                    quotes_saved += 1

            best = pick_best(results, "award")
            if best:
                alert = evaluate_alerts(best, monitor)
                if alert:
                    all_alerts.append(alert)

            monitors_checked += 1

        except Exception as e:
            tb = traceback.format_exc()
            print(f"  ❌ Error: {e}\n{tb}")
            errors.append({"monitor_id": monitor["id"], "error": str(e)})

        time.sleep(1.5)

    # ── Send ONE Telegram alert ───────────────────────────────────────────────
    alerts_sent = 0
    if all_alerts:
        print(f"\n📣 Sending consolidated alert ({len(all_alerts)} items)…")
        try:
            send_consolidated_alert(all_alerts)
            alerts_sent = 1
        except Exception as e:
            print(f"  ❌ Telegram error: {e}")
            errors.append({"telegram": str(e)})
    else:
        print("\n💤 No alert-worthy results today — no Telegram message sent.")

    # ── Finish run record ─────────────────────────────────────────────────────
    status = "success" if not errors else ("partial" if monitors_checked > 0 else "failed")
    db.finish_run(run_id, status, {
        "monitors_checked": monitors_checked,
        "quotes_saved": quotes_saved,
        "alerts_sent": alerts_sent,
        "errors": errors,
    })

    print(f"\n✅ Run #{run_id} done — {monitors_checked} monitors, {quotes_saved} quotes\n")

    if errors:
        print(f"⚠️  {len(errors)} error(s) during run:")
        for e in errors:
            print(f"   - {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
