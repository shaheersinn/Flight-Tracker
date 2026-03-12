# apps/worker/adapters/rapidapi_flights.py
#
# Sky Scrapper API via RapidAPI — capped at 10 calls per calendar month.
# Each call targets the midpoint date of the window to preserve quota.

import os
import requests
from datetime import date

import db  # local db.py

RAPID_API_HOST = "sky-scrapper.p.rapidapi.com"
MONTHLY_LIMIT = 10


def _can_call() -> bool:
    year_month = date.today().strftime("%Y-%m")
    used = db.get_rapidapi_usage(year_month)
    return used < MONTHLY_LIMIT


def _format_duration(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"{h}h {m}m"


def _midpoint_date(date_from: str, date_to: str) -> str:
    d1 = date.fromisoformat(date_from)
    d2 = date.fromisoformat(date_to)
    mid = d1 + (d2 - d1) / 2
    return mid.isoformat()


def scrape_cash_midpoint(monitor: dict, api_key: str) -> list[dict]:
    """
    Make ONE RapidAPI call for the midpoint date of the window.
    Returns up to 5 results or [] if limit reached / error.
    """
    if not _can_call():
        print(f"  [RapidAPI] Monthly limit of {MONTHLY_LIMIT} reached — skipping")
        return []

    origin = monitor["origin"]
    destination = monitor["destination"]
    mid_date = _midpoint_date(monitor["date_from"], monitor["date_to"])
    monitor_id = monitor["id"]

    url = (
        f"https://{RAPID_API_HOST}/api/v1/flights/searchFlights"
        f"?originSkyId={origin}&destinationSkyId={destination}"
        f"&originEntityId=&destinationEntityId="
        f"&date={mid_date}&returnDate=&cabinClass=economy&adults=1"
        f"&sortBy=best&currency=CAD&market=en-CA&countryCode=CA"
    )
    headers = {
        "x-rapidapi-host": RAPID_API_HOST,
        "x-rapidapi-key": api_key,
    }

    try:
        print(f"  [RapidAPI] Calling {origin}→{destination} on {mid_date}")
        resp = requests.get(url, headers=headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()

        year_month = date.today().strftime("%Y-%m")
        db.increment_rapidapi_usage(year_month)

        itineraries = data.get("data", {}).get("itineraries", [])
        results = []

        for it in itineraries[:5]:
            price_raw = it.get("price", {}).get("raw", 0)
            legs = it.get("legs", [])
            leg = legs[0] if legs else {}
            carrier = (leg.get("carriers", {}).get("marketing") or [{}])[0]

            results.append({
                "provider": "RapidAPI (Sky Scrapper)",
                "monitor_id": monitor_id,
                "kind": "cash",
                "origin": origin,
                "destination": destination,
                "departure_date": mid_date,
                "total_price": round(float(price_raw), 2),
                "currency": "CAD",
                "airline": carrier.get("name", "Unknown"),
                "flight_number": carrier.get("alternateId", "") + str(leg.get("flightNumber", "")),
                "stops": leg.get("stopCount", 0),
                "duration": _format_duration(leg.get("durationInMinutes", 0)),
                "booking_url": (
                    f"https://www.google.com/travel/flights?q=Flights+from+"
                    f"{origin}+to+{destination}+on+{mid_date}"
                ),
                "is_award": False,
            })

        print(f"  [RapidAPI] Got {len(results)} results")
        return results

    except Exception as e:
        print(f"  [RapidAPI] Error: {e}")
        return []
