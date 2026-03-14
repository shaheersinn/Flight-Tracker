#!/usr/bin/env python3
"""
Flight Price Tracker — v1 (No-Browser Edition)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scrapes daily flight prices and Qatar award availability using only
HTTP APIs — no Playwright, no browser, no Docker, no database.

Data sources (in priority order):
  Cash fares:   1. RapidAPI Sky Scrapper  (≤10/month, tracked in results.json)
                2. Amadeus Self-Service API (free, 2000 calls/month)
  Award seats:  1. seats.aero Partner API
                2. Qatar Privilege Club public JSON

State:
  results.json  — all run history + quotes, committed back to repo by CI
  history.json  — seen URL cache, stored in GitHub Actions cache

Workflow:
  .github/workflows/daily-flight-check.yml  — runs at 11:17 UTC daily
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
import asyncio
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ─────────────────────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────────────────────

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)
_log_path = LOG_DIR / f"run_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(_log_path, encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

RESULTS_FILE  = os.environ.get("RESULTS_FILE",  "results.json")
HISTORY_FILE  = os.environ.get("HISTORY_FILE",  "history.json")

RAPIDAPI_KEY       = os.environ.get("RAPIDAPI_KEY", "")
AMADEUS_CLIENT_ID  = os.environ.get("AMADEUS_CLIENT_ID", "")
AMADEUS_CLIENT_SEC = os.environ.get("AMADEUS_CLIENT_SECRET", "")
SEATS_AERO_KEY     = os.environ.get("SEATS_AERO_API_KEY", "")
TELEGRAM_TOKEN     = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID", "")
DASHBOARD_URL      = os.environ.get("DASHBOARD_URL", "")

RAPIDAPI_MONTHLY_LIMIT = 10  # hard cap tracked in results.json

SIGNIFICANT_DROP_PCT = 15.0   # % drop vs last check → alert
ALERT_THRESHOLDS = {           # absolute price floor → alert
    "yyc-yyz-jul2-window":      180,
    "yyc-yyz-jul13-window":     180,
    "yyc-yyz-jul14-window":     180,
    "yyz-yyc-june-last-week":   180,
    "yyz-yyc-may8-window":      160,
    "yyz-yyc-jun10":            180,
    "yyc-yyz-jun13":            180,
}

# ─────────────────────────────────────────────────────────────────────────────
# MONITORS
# ─────────────────────────────────────────────────────────────────────────────

def _date_range(start: str, end: str) -> list[str]:
    d1, d2 = date.fromisoformat(start), date.fromisoformat(end)
    return [(d1 + timedelta(days=i)).isoformat()
            for i in range((d2 - d1).days + 1)]


CASH_MONITORS = [
    {"id": "yyc-yyz-jul2-window",    "origin": "YYC", "dest": "YYZ", "from": "2026-06-28", "to": "2026-07-06"},
    {"id": "yyc-yyz-jul13-window",   "origin": "YYC", "dest": "YYZ", "from": "2026-07-09", "to": "2026-07-17"},
    {"id": "yyc-yyz-jul14-window",   "origin": "YYC", "dest": "YYZ", "from": "2026-07-10", "to": "2026-07-18"},
    {"id": "yyz-yyc-june-last-week", "origin": "YYZ", "dest": "YYC", "from": "2026-06-24", "to": "2026-06-30"},
    {"id": "yyz-yyc-may8-window",    "origin": "YYZ", "dest": "YYC", "from": "2026-05-03", "to": "2026-05-13"},
    {"id": "yyz-yyc-jun10",          "origin": "YYZ", "dest": "YYC", "from": "2026-06-08", "to": "2026-06-12"},
    {"id": "yyc-yyz-jun13",          "origin": "YYC", "dest": "YYZ", "from": "2026-06-11", "to": "2026-06-15"},
]

AWARD_MONITORS = [
    {"id": "qatar-award-yyz-isb-jun2027", "origin": "YYZ", "dest": "ISB", "month": "2027-06", "cabin": "business"},
    {"id": "qatar-award-yyz-isb-jul2027", "origin": "YYZ", "dest": "ISB", "month": "2027-07", "cabin": "business"},
    {"id": "qatar-award-yyz-isb-dec2027", "origin": "YYZ", "dest": "ISB", "month": "2027-12", "cabin": "business"},
    {"id": "qatar-award-yyz-ist-jun2027", "origin": "YYZ", "dest": "IST", "month": "2027-06", "cabin": "business"},
    {"id": "qatar-award-yyz-ist-jul2027", "origin": "YYZ", "dest": "IST", "month": "2027-07", "cabin": "business"},
    {"id": "qatar-award-yyz-ist-dec2027", "origin": "YYZ", "dest": "IST", "month": "2027-12", "cabin": "business"},
]

ALL_MONITORS = CASH_MONITORS + AWARD_MONITORS  # type: ignore[operator]

# ─────────────────────────────────────────────────────────────────────────────
# HTTP SESSION
# ─────────────────────────────────────────────────────────────────────────────

def _session() -> requests.Session:
    s = requests.Session()
    retry = Retry(total=3, backoff_factor=1.0,
                  status_forcelist=[429, 500, 502, 503, 504])
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://",  HTTPAdapter(max_retries=retry))
    return s


SESSION = _session()

# ─────────────────────────────────────────────────────────────────────────────
# RESULTS.JSON  (single source of truth, committed back to repo)
# ─────────────────────────────────────────────────────────────────────────────

def load_results() -> dict:
    if Path(RESULTS_FILE).exists():
        try:
            return json.loads(Path(RESULTS_FILE).read_text())
        except Exception:
            pass
    return {
        "last_updated": None,
        "runs": [],
        "quotes": {},      # monitor_id → list of {date, price, provider, ...}
        "best_ever": {},   # monitor_id → float
        "award_slots": {}, # monitor_id → list of {date, points, surcharge}
        "rapidapi_calls_this_month": 0,
        "rapidapi_month": "",
    }


def save_results(data: dict) -> None:
    Path(RESULTS_FILE).write_text(
        json.dumps(data, indent=2, default=str)
    )
    log.info(f"✓ {RESULTS_FILE} saved.")


def load_history() -> set:
    if Path(HISTORY_FILE).exists():
        try:
            return set(json.loads(Path(HISTORY_FILE).read_text()))
        except Exception:
            pass
    return set()


def save_history(seen: set) -> None:
    Path(HISTORY_FILE).write_text(json.dumps(sorted(seen)))


def rapidapi_used_this_month(data: dict) -> int:
    this_month = datetime.utcnow().strftime("%Y-%m")
    if data.get("rapidapi_month") != this_month:
        data["rapidapi_calls_this_month"] = 0
        data["rapidapi_month"] = this_month
    return data["rapidapi_calls_this_month"]


def can_use_rapidapi(data: dict) -> bool:
    if not RAPIDAPI_KEY:
        return False
    return rapidapi_used_this_month(data) < RAPIDAPI_MONTHLY_LIMIT


def record_rapidapi_call(data: dict) -> None:
    this_month = datetime.utcnow().strftime("%Y-%m")
    if data.get("rapidapi_month") != this_month:
        data["rapidapi_calls_this_month"] = 0
        data["rapidapi_month"] = this_month
    data["rapidapi_calls_this_month"] = data.get("rapidapi_calls_this_month", 0) + 1

# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 1: RAPIDAPI SKY SCRAPPER
# ─────────────────────────────────────────────────────────────────────────────

def scrape_rapidapi(monitor: dict, data: dict) -> list[dict]:
    """
    One API call per monitor (uses middle date of window).
    Returns list of quote dicts.
    """
    if not can_use_rapidapi(data):
        return []

    dates = _date_range(monitor["from"], monitor["to"])
    mid_date = dates[len(dates) // 2]

    url = "https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlights"
    params = {
        "originSkyId":      monitor["origin"],
        "destinationSkyId": monitor["dest"],
        "originEntityId":   _airport_entity(monitor["origin"]),
        "destinationEntityId": _airport_entity(monitor["dest"]),
        "date":             mid_date,
        "adults":           "1",
        "currency":         "CAD",
        "market":           "en-CA",
        "countryCode":      "CA",
    }
    headers = {
        "X-RapidAPI-Key":  RAPIDAPI_KEY,
        "X-RapidAPI-Host": "sky-scrapper.p.rapidapi.com",
    }

    log.info(f"  [RapidAPI] {monitor['origin']}→{monitor['dest']} on {mid_date}")
    try:
        resp = SESSION.get(url, params=params, headers=headers, timeout=20)
        record_rapidapi_call(data)
        if resp.status_code != 200:
            log.warning(f"  [RapidAPI] HTTP {resp.status_code}")
            return []

        payload = resp.json()
        itineraries = (
            payload.get("data", {})
                   .get("itineraries", [])
        )
        results = []
        now = datetime.utcnow().isoformat()
        for it in itineraries[:5]:
            price = it.get("price", {}).get("raw")
            if not price:
                continue
            legs = it.get("legs", [])
            if not legs:
                continue
            leg = legs[0]
            carrier = (leg.get("carriers", {})
                          .get("marketing", [{}])[0]
                          .get("name", "Unknown"))
            stops = len(leg.get("stopCount", 0)) if isinstance(leg.get("stopCount"), list) else leg.get("stopCount", 0)
            duration_min = leg.get("durationInMinutes", 0)
            duration = f"{duration_min // 60}h {duration_min % 60}m" if duration_min else "N/A"
            dep_date = leg.get("departure", mid_date)[:10]
            results.append({
                "monitor_id":     monitor["id"],
                "provider":       "RapidAPI Sky Scrapper",
                "origin":         monitor["origin"],
                "destination":    monitor["dest"],
                "departure_date": dep_date,
                "price":          float(price),
                "currency":       "CAD",
                "airline":        carrier,
                "stops":          stops,
                "duration":       duration,
                "checked_at":     now,
            })
        log.info(f"  [RapidAPI] → {len(results)} results")
        return results

    except Exception as e:
        log.warning(f"  [RapidAPI] Error: {e}")
        return []


def _airport_entity(code: str) -> str:
    """Known SkyScanner entity IDs for our airports."""
    entities = {
        "YYC": "95673827",
        "YYZ": "95673544",
    }
    return entities.get(code, code)


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 2: AMADEUS FREE TIER
# ─────────────────────────────────────────────────────────────────────────────

_amadeus_token: dict = {"token": "", "expires": 0}


def _get_amadeus_token() -> str:
    if _amadeus_token["token"] and time.time() < _amadeus_token["expires"]:
        return _amadeus_token["token"]
    if not (AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SEC):
        return ""
    try:
        resp = SESSION.post(
            "https://test.api.amadeus.com/v1/security/oauth2/token",
            data={
                "grant_type":    "client_credentials",
                "client_id":     AMADEUS_CLIENT_ID,
                "client_secret": AMADEUS_CLIENT_SEC,
            },
            timeout=15,
        )
        if resp.status_code == 200:
            j = resp.json()
            _amadeus_token["token"]   = j["access_token"]
            _amadeus_token["expires"] = time.time() + j.get("expires_in", 1700) - 60
            return _amadeus_token["token"]
    except Exception as e:
        log.debug(f"Amadeus token error: {e}")
    return ""


def scrape_amadeus(monitor: dict) -> list[dict]:
    token = _get_amadeus_token()
    if not token:
        return []

    dates = _date_range(monitor["from"], monitor["to"])
    # Sample every other date to stay within free-tier limits
    sample = dates[::2] if len(dates) > 4 else dates

    results = []
    now = datetime.utcnow().isoformat()

    for dep_date in sample:
        try:
            resp = SESSION.get(
                "https://test.api.amadeus.com/v2/shopping/flight-offers",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "originLocationCode":      monitor["origin"],
                    "destinationLocationCode": monitor["dest"],
                    "departureDate":           dep_date,
                    "adults":                  1,
                    "max":                     5,
                    "currencyCode":            "CAD",
                    "nonStop":                 "false",
                },
                timeout=20,
            )
            if resp.status_code != 200:
                continue
            offers = resp.json().get("data", [])
            for offer in offers:
                price = float(offer.get("price", {}).get("grandTotal", 0))
                if price <= 0:
                    continue
                itin = offer.get("itineraries", [{}])[0]
                segs = itin.get("segments", [])
                carrier = segs[0].get("carrierCode", "??") if segs else "??"
                stops = len(segs) - 1
                dur_raw = itin.get("duration", "PT0H0M")
                # Parse ISO 8601 duration PT2H35M
                h = int(re.search(r"(\d+)H", dur_raw).group(1)) if re.search(r"\d+H", dur_raw) else 0
                m = int(re.search(r"(\d+)M", dur_raw).group(1)) if re.search(r"\d+M", dur_raw) else 0
                duration = f"{h}h {m}m"
                results.append({
                    "monitor_id":     monitor["id"],
                    "provider":       "Amadeus",
                    "origin":         monitor["origin"],
                    "destination":    monitor["dest"],
                    "departure_date": dep_date,
                    "price":          price,
                    "currency":       "CAD",
                    "airline":        carrier,
                    "stops":          stops,
                    "duration":       duration,
                    "checked_at":     now,
                })
            time.sleep(0.3)
        except Exception as e:
            log.debug(f"Amadeus {dep_date}: {e}")

    log.info(f"  [Amadeus] {monitor['origin']}→{monitor['dest']}: {len(results)} results")
    return results


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 3: SEATS.AERO (award availability)
# ─────────────────────────────────────────────────────────────────────────────

CABIN_MAP = {"economy": "Y", "premium_economy": "W", "business": "J", "first": "F"}


def scrape_seats_aero(monitor: dict) -> list[dict]:
    if not SEATS_AERO_KEY:
        return []
    yr, mo = monitor["month"].split("-")
    yr, mo = int(yr), int(mo)
    _, last_day = monthrange(yr, mo)
    now = datetime.utcnow().isoformat()

    try:
        resp = SESSION.get(
            "https://seats.aero/partnerapi/availability",
            headers={"Partner-Authorization": SEATS_AERO_KEY},
            params={
                "origin_airport":      monitor["origin"],
                "destination_airport": monitor["dest"],
                "start_date":          f"{yr}-{mo:02d}-01",
                "end_date":            f"{yr}-{mo:02d}-{last_day:02d}",
                "cabin":               CABIN_MAP.get(monitor["cabin"], "J"),
            },
            timeout=20,
        )
        resp.raise_for_status()
        slots = []
        for slot in resp.json().get("data", []):
            if not slot.get("available"):
                continue
            pts = slot.get("mileageCost") or slot.get("points")
            sur = slot.get("taxesFees")
            slots.append({
                "monitor_id":     monitor["id"],
                "provider":       "seats.aero",
                "origin":         monitor["origin"],
                "destination":    monitor["dest"],
                "departure_date": slot.get("date", "")[:10],
                "month":          monitor["month"],
                "cabin":          monitor["cabin"],
                "points_cost":    int(pts) if pts else None,
                "cash_surcharge": float(sur) if sur else None,
                "airline":        "Qatar Airways",
                "checked_at":     now,
            })
        log.info(f"  [seats.aero] {monitor['origin']}→{monitor['dest']} {monitor['month']}: {len(slots)} slots")
        return slots
    except Exception as e:
        log.warning(f"  [seats.aero] Error: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 4: QATAR PRIVILEGE CLUB (public JSON embedded in page)
# ─────────────────────────────────────────────────────────────────────────────

def scrape_qatar_public(monitor: dict) -> list[dict]:
    """
    Attempt to fetch Qatar's public award calendar JSON endpoint.
    This is a best-effort scrape of their publicly accessible pricing API.
    Falls back gracefully to empty list.
    """
    yr, mo = monitor["month"].split("-")
    now = datetime.utcnow().isoformat()

    # Qatar's booking search API (public, no auth needed for availability check)
    search_url = "https://www.qatarairways.com/api/offers/search"
    params = {
        "from":    monitor["origin"],
        "to":      monitor["dest"],
        "month":   monitor["month"],
        "adults":  "1",
        "cabin":   "B",  # Business
        "type":    "O",  # One-way
    }
    try:
        resp = SESSION.get(
            search_url, params=params, timeout=15,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/122.0.0.0 Safari/537.36"
                ),
                "Accept": "application/json",
                "Referer": "https://www.qatarairways.com/",
            },
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        slots = []
        for item in data.get("flights", data.get("data", [])):
            pts = item.get("points") or item.get("avios") or item.get("miles")
            sur = item.get("taxes") or item.get("surcharge")
            dep = item.get("departureDate") or item.get("date", "")
            if not pts:
                continue
            slots.append({
                "monitor_id":     monitor["id"],
                "provider":       "Qatar Privilege Club",
                "origin":         monitor["origin"],
                "destination":    monitor["dest"],
                "departure_date": dep[:10] if dep else None,
                "month":          monitor["month"],
                "cabin":          monitor["cabin"],
                "points_cost":    int(pts),
                "cash_surcharge": float(sur) if sur else None,
                "airline":        "Qatar Airways",
                "checked_at":     now,
            })
        log.info(f"  [Qatar] {monitor['origin']}→{monitor['dest']} {monitor['month']}: {len(slots)} slots")
        return slots
    except Exception as e:
        log.debug(f"  [Qatar public API] {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# ALERT EVALUATION
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_cash_alert(monitor_id: str, price: float, data: dict) -> str | None:
    """Returns alert type string or None."""
    best = data["best_ever"].get(monitor_id)
    quotes = data["quotes"].get(monitor_id, [])
    last_price = quotes[-1]["price"] if quotes else None

    # 1 — New all-time low
    if best is None or price < best:
        return "new_all_time_low"

    # 2 — Significant drop vs last check
    if last_price and last_price > 0:
        drop_pct = (last_price - price) / last_price * 100
        if drop_pct >= SIGNIFICANT_DROP_PCT:
            return "significant_drop"

    # 3 — Below absolute threshold
    threshold = ALERT_THRESHOLDS.get(monitor_id)
    if threshold and price < threshold:
        return "threshold_breach"

    return None


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

def run() -> None:
    run_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    log.info("=" * 60)
    log.info(f"Flight Tracker Run — {run_ts}")
    log.info("=" * 60)

    data = load_results()
    seen = load_history()

    rapid_used = rapidapi_used_this_month(data)
    rapid_ok   = can_use_rapidapi(data)
    log.info(f"RapidAPI: {'available' if rapid_ok else 'limit reached'} ({rapid_used}/{RAPIDAPI_MONTHLY_LIMIT})")
    log.info(f"Amadeus:  {'configured' if AMADEUS_CLIENT_ID else 'not configured'}")
    log.info(f"seats.aero: {'configured' if SEATS_AERO_KEY else 'not configured'}")

    cash_alerts:  list[dict] = []
    award_slots:  list[dict] = []
    all_quotes:   list[dict] = []
    errors:       list[str]  = []
    monitors_done = 0

    # ── Cash fare monitors ──────────────────────────────────────────────────
    log.info(f"\n── Cash fare monitors ({len(CASH_MONITORS)}) ─────────────────")
    for m in CASH_MONITORS:
        log.info(f"  ▶ {m['id']}  ({m['origin']}→{m['dest']}  {m['from']}–{m['to']})")
        monitors_done += 1
        quotes: list[dict] = []

        try:
            # Priority 1: RapidAPI
            if rapid_ok:
                quotes = scrape_rapidapi(m, data)
                rapid_ok = can_use_rapidapi(data)  # may have hit limit mid-run

            # Priority 2: Amadeus
            if not quotes:
                quotes = scrape_amadeus(m)

            if not quotes:
                log.info(f"    → No results from any source")

        except Exception as e:
            errors.append(f"{m['id']}: {e}")
            log.warning(f"    Error: {e}")

        # Store + evaluate alerts
        if quotes:
            cheapest = min(quotes, key=lambda q: q["price"])
            price    = cheapest["price"]

            # Persist quote history
            q_hist = data["quotes"].setdefault(m["id"], [])
            q_hist.append({
                "date":     run_ts,
                "dep":      cheapest["departure_date"],
                "price":    price,
                "provider": cheapest["provider"],
                "airline":  cheapest["airline"],
                "stops":    cheapest.get("stops", 0),
                "duration": cheapest.get("duration", ""),
            })
            data["quotes"][m["id"]] = q_hist[-90:]  # keep 90 most recent

            # Alert check
            alert_type = evaluate_cash_alert(m["id"], price, data)
            if alert_type:
                prev_best = data["best_ever"].get(m["id"])
                cash_alerts.append({
                    "alert_type":    alert_type,
                    "monitor_id":    m["id"],
                    "origin":        m["origin"],
                    "destination":   m["dest"],
                    "price":         price,
                    "departure_date": cheapest["departure_date"],
                    "airline":       cheapest["airline"],
                    "stops":         cheapest.get("stops", 0),
                    "duration":      cheapest.get("duration", ""),
                    "provider":      cheapest["provider"],
                    "previous_best": prev_best,
                })
                log.info(f"    🔔 Alert: {alert_type} — CAD {price:.2f}")

            # Update best-ever
            if data["best_ever"].get(m["id"]) is None or price < data["best_ever"][m["id"]]:
                data["best_ever"][m["id"]] = price

            all_quotes.extend(quotes)
            log.info(f"    → Best: CAD {price:.2f} via {cheapest['airline']} on {cheapest['departure_date']}")

    # ── Award monitors ──────────────────────────────────────────────────────
    log.info(f"\n── Award monitors ({len(AWARD_MONITORS)}) ───────────────────")
    for m in AWARD_MONITORS:
        log.info(f"  ▶ {m['id']}  ({m['origin']}→{m['dest']}  {m['month']})")
        monitors_done += 1
        slots: list[dict] = []

        try:
            # Priority 1: seats.aero
            if SEATS_AERO_KEY:
                slots = scrape_seats_aero(m)

            # Priority 2: Qatar public API
            if not slots:
                slots = scrape_qatar_public(m)

        except Exception as e:
            errors.append(f"{m['id']}: {e}")
            log.warning(f"    Error: {e}")

        if slots:
            award_slots.extend(slots)
            # Store in results
            data["award_slots"][m["id"]] = slots

    # ── Save state ──────────────────────────────────────────────────────────
    data["last_updated"] = run_ts

    # Append run summary
    run_entry = {
        "run_id":          run_ts.replace(":", "").replace("-", "").replace("T", "_")[:15],
        "timestamp":       run_ts,
        "monitors_done":   monitors_done,
        "cash_quotes":     len(all_quotes),
        "award_slots":     len(award_slots),
        "alerts":          len(cash_alerts),
        "errors":          len(errors),
        "rapidapi_used":   data["rapidapi_calls_this_month"],
    }
    data.setdefault("runs", [])
    data["runs"] = (data["runs"] + [run_entry])[-100:]

    save_results(data)
    save_history(seen)

    # ── Build and send Telegram digest ─────────────────────────────────────
    log.info("\n── Sending Telegram digest ─────────────────────────────")
    msg = build_digest(cash_alerts, award_slots, data, run_entry, errors)
    send_telegram(msg)

    # ── Summary ─────────────────────────────────────────────────────────────
    log.info("\n" + "=" * 60)
    log.info(f"Run complete — Monitors: {monitors_done} | Quotes: {len(all_quotes)} | "
             f"Awards: {len(award_slots)} | Alerts: {len(cash_alerts)} | Errors: {len(errors)}")
    if errors:
        for e in errors:
            log.info(f"  Error: {e}")
    log.info("=" * 60)


# ─────────────────────────────────────────────────────────────────────────────
# TELEGRAM
# ─────────────────────────────────────────────────────────────────────────────

def _alert_emoji(t: str) -> str:
    return {"new_all_time_low": "🏆", "significant_drop": "📉",
            "threshold_breach": "🎯"}.get(t, "🔔")


def build_digest(
    cash_alerts: list[dict],
    award_slots: list[dict],
    data: dict,
    run_entry: dict,
    errors: list[str],
) -> str:
    now = datetime.now(timezone.utc).strftime("%b %d %Y, %-I:%M %p UTC")
    lines = [
        f"✈️ <b>Flight Tracker Daily Digest</b>",
        f"📅 {now}",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
    ]

    if cash_alerts:
        lines.append("🏷 <b>CASH FARE ALERTS</b>")
        lines.append("")
        for a in cash_alerts:
            lines += [
                f"{_alert_emoji(a['alert_type'])} <b>{a['origin']} → {a['destination']}</b> — {a['alert_type'].replace('_',' ').upper()}",
                f"   💰 CAD {a['price']:.2f}",
                f"   📆 {a['departure_date']}",
                f"   ✈️ {a['airline']} · {a.get('duration','N/A')} · {'Nonstop' if a.get('stops')==0 else str(a.get('stops',1))+' stop(s)'}",
            ]
            if a.get("previous_best"):
                saving = a["previous_best"] - a["price"]
                lines.append(f"   📉 Prev best: CAD {a['previous_best']:.2f}  (save CAD {saving:.2f})")
            lines += [f"   📡 {a['provider']}", ""]

    if award_slots:
        lines.append("🎫 <b>QATAR AIRWAYS AWARD AVAILABILITY</b>")
        lines.append("   Business / Qsuite from YYZ")
        lines.append("")
        by_route: dict[str, list] = {}
        for s in award_slots:
            key = f"{s['origin']}→{s['destination']}"
            by_route.setdefault(key, []).append(s)
        for route, slots in by_route.items():
            best = min(slots, key=lambda s: s.get("points_cost") or 999999)
            pts  = best.get("points_cost")
            sur  = best.get("cash_surcharge")
            lines += [
                f"✈️ <b>{route}</b>",
                f"   {f'{pts:,}' if pts else 'N/A'} Avios"
                f"{f' + CAD {sur:.2f} taxes' if sur else ''}",
                "",
            ]

    # Best prices today
    best_today = {
        mid: min(data["quotes"][mid], key=lambda q: q["price"])
        for mid in data["quotes"]
        if data["quotes"][mid]
    }
    if best_today:
        lines.append("📋 <b>TODAY'S BEST CASH FARES</b>")
        for mid, q in best_today.items():
            route = mid.split("-")[0].upper() + "→" + mid.split("-")[1].upper()
            lines.append(f"   {route}: <b>CAD {q['price']:.2f}</b> on {q['dep']} via {q['airline']}")
        lines.append("")

    if not cash_alerts and not award_slots:
        lines += ["📭 <b>No new alerts today</b>", "All prices within normal ranges.", ""]

    # Footer stats
    lines += [
        "━━━━━━━━━━━━━━━━━━━━",
        f"📊 {run_entry['monitors_done']} monitors · {run_entry['cash_quotes']} quotes · {run_entry['alerts']} alerts",
        f"📡 RapidAPI {run_entry['rapidapi_used']}/{RAPIDAPI_MONTHLY_LIMIT} used this month",
    ]
    if errors:
        lines.append(f"⚠️ {len(errors)} error(s) — check logs")
    if DASHBOARD_URL:
        lines.append(f"\n📊 <a href=\"{DASHBOARD_URL}\">Open Dashboard</a>")

    return "\n".join(lines)


def send_telegram(message: str) -> None:
    if not (TELEGRAM_TOKEN and TELEGRAM_CHAT_ID):
        log.warning("Telegram not configured — printing digest:")
        print(message)
        return

    LIMIT = 4090
    if len(message) > LIMIT:
        message = message[:LIMIT] + "\n<i>… truncated, see dashboard</i>"

    try:
        resp = SESSION.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={
                "chat_id":                  TELEGRAM_CHAT_ID,
                "text":                     message,
                "parse_mode":               "HTML",
                "disable_web_page_preview": True,
            },
            timeout=15,
        )
        if resp.ok:
            log.info("✓ Telegram digest sent.")
        else:
            log.warning(f"Telegram error: {resp.status_code} — {resp.text[:200]}")
    except Exception as e:
        log.warning(f"Telegram failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    run()
