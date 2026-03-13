"""
scraper/adapters/rapidapi.py
Uses Sky Scrapper API on RapidAPI for cash fares.
LIMITED to 10 requests/month — enforced via the DB counter.

API: https://rapidapi.com/apiheya/api/sky-scrapper
"""

import os
import logging
from typing import Optional
from datetime import datetime

import requests

from scraper.monitors import CashMonitor, AwardMonitor
from scraper.db import can_use_rapidapi, record_rapidapi_call, make_fingerprint

logger = logging.getLogger(__name__)

RAPIDAPI_HOST = "sky-scrapper.p.rapidapi.com"
BASE_URL = f"https://{RAPIDAPI_HOST}/api/v2/flights"

# SkyScanner entity IDs for supported airports
AIRPORT_IDS: dict[str, str] = {
    "YYC": "YYC-sky",
    "YYZ": "YYZ-sky",
    "ISB": "ISB-sky",
    "IST": "IST-sky",
}


def _headers() -> dict:
    return {
        "X-RapidAPI-Key": os.environ.get("RAPIDAPI_KEY", ""),
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }


def is_available() -> bool:
    return can_use_rapidapi()


def scrape_window(monitor: CashMonitor) -> list[dict]:
    """
    Fetch flights for a cash monitor using RapidAPI.
    Spends ONE API call per monitor (uses the middle date as representative).
    Returns list of quote dicts ready for db.save_quote().
    """
    if not is_available():
        logger.info("[RapidAPI] Monthly limit reached or no key. Skipping.")
        return []

    origin_id = AIRPORT_IDS.get(monitor.origin)
    dest_id = AIRPORT_IDS.get(monitor.destination)
    if not origin_id or not dest_id:
        logger.warning(f"[RapidAPI] Unknown airport: {monitor.origin}/{monitor.destination}")
        return []

    # Use middle date of window as representative date (1 API call per monitor)
    dates = monitor.dates()
    mid_date = dates[len(dates) // 2]

    logger.info(f"[RapidAPI] {monitor.origin}→{monitor.destination} around {mid_date}")
    record_rapidapi_call()

    try:
        resp = requests.get(
            f"{BASE_URL}/searchFlights",
            headers=_headers(),
            params={
                "originSkyId": monitor.origin,
                "destinationSkyId": monitor.destination,
                "originEntityId": origin_id,
                "destinationEntityId": dest_id,
                "date": mid_date,
                "cabinClass": "economy",
                "adults": "1",
                "sortBy": "best",
                "currency": "CAD",
                "market": "CA",
                "countryCode": "CA",
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        logger.error(f"[RapidAPI] Request failed: {e}")
        return []

    itineraries = data.get("data", {}).get("itineraries", [])
    results = []
    now = datetime.utcnow().isoformat()

    for item in itineraries[:5]:
        leg = item.get("legs", [{}])[0]
        price_raw = item.get("price", {}).get("raw")
        if not price_raw:
            continue

        airline = (
            leg.get("carriers", {}).get("marketing", [{}])[0].get("name", "Unknown")
        )
        depart = (leg.get("departure", "") or "")[:10]  # YYYY-MM-DD
        flight_num = (leg.get("segments") or [{}])[0].get("flightNumber")
        stops = leg.get("stopCount", 0)
        dur_mins = leg.get("durationInMinutes", 0)
        duration = f"{dur_mins // 60}h {dur_mins % 60}m"

        fp = make_fingerprint(monitor.id, "RapidAPI", depart, airline, price_raw, stops)
        results.append({
            "monitor_id": monitor.id,
            "provider": "RapidAPI (Sky Scrapper)",
            "kind": "cash",
            "origin": monitor.origin,
            "destination": monitor.destination,
            "departure_date": depart or None,
            "total_price": float(price_raw),
            "currency": "CAD",
            "airline": airline,
            "flight_number": flight_num,
            "stops": stops,
            "duration": duration,
            "booking_url": "https://www.google.com/travel/flights?hl=en-CA",
            "checked_at": now,
            "fingerprint": fp,
        })

    logger.info(f"[RapidAPI] Got {len(results)} results")
    return results
