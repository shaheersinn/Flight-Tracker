# apps/worker/adapters/qatar_award.py
#
# Two strategies (tried in order):
#   1. Seats.aero API  — if SEATS_AERO_API_KEY is set
#   2. Qatar Privilege Club direct Playwright scrape

import os
import re
import time
import random
import requests
from playwright.sync_api import sync_playwright, Browser, BrowserContext


def _sleep(ms: int, jitter: int = 0):
    time.sleep((ms + random.randint(0, jitter)) / 1000)


# ── Seats.aero ──────────────────────────────────────────────────────────────

def _scrape_seats_aero(monitor: dict, api_key: str) -> list[dict]:
    year, month = monitor["month"].split("-")
    start_date = f"{year}-{month}-01"
    end_date = f"{year}-{month}-28"
    destination = monitor["destination"]

    url = (
        "https://api.seats.aero/partnerapi/availability"
        f"?origin_airport=YYZ&destination_airport={destination}"
        f"&start_date={start_date}&end_date={end_date}"
        "&cabin=business&source=qr"
    )
    headers = {
        "Partner-Authorization": api_key,
        "Content-Type": "application/json",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=20)
        if not resp.ok:
            print(f"  [SeatsAero] HTTP {resp.status_code}")
            return []

        trips = resp.json().get("data", [])
        results = []
        for t in trips:
            if not (t.get("JAvailable") or t.get("YAvailable")):
                continue
            results.append({
                "provider": "Seats.aero",
                "monitor_id": monitor["id"],
                "kind": "award",
                "origin": "YYZ",
                "destination": destination,
                "departure_date": t.get("Date", f"{year}-{month}-01"),
                "points_cost": t.get("JMileageCost") or t.get("YMileageCost") or 0,
                "cash_surcharge": t.get("JTaxes") or t.get("YTaxes") or 0,
                "currency": "USD",
                "cabin": "business",
                "airline": "Qatar Airways",
                "stops": 1,
                "duration": "~18h",
                "booking_url": (
                    "https://www.qatarairways.com/en/privilege-club/"
                    "redeem/flight-rewards.html"
                ),
                "is_award": True,
            })

        print(f"  [SeatsAero] {len(results)} available dates for {monitor['id']}")
        return results

    except Exception as e:
        print(f"  [SeatsAero] Error: {e}")
        return []


# ── Qatar Privilege Club direct scrape ──────────────────────────────────────

def _scrape_qatar_direct(monitor: dict) -> list[dict]:
    year, month = monitor["month"].split("-")
    destination = monitor["destination"]
    results = []

    booking_url = (
        "https://www.qatarairways.com/en/privilege-club/redeem/flight-rewards.html"
        f"?widget=QR&searchType=F&addTaxToMiles=on&bookingClass=J"
        f"&tripType=O&fromStation=YYZ&toStation={destination}"
        f"&departingHidden={year}-{month}-01"
        "&returnHidden=&numOfAdults=1&numOfChildren=0&numOfInfants=0"
    )

    with sync_playwright() as p:
        browser: Browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        context: BrowserContext = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            locale="en-GB",
        )
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => false})"
        )
        page = context.new_page()

        try:
            print(f"  [QatarDirect] Loading {destination} {monitor['month']}")
            page.goto(booking_url, wait_until="domcontentloaded", timeout=30000)
            _sleep(4000, 2000)

            # Try clicking search button
            for selector in ['[id*="btnSearch"]', 'button[type="submit"]']:
                try:
                    btn = page.query_selector(selector)
                    if btn and btn.is_visible():
                        btn.click()
                        _sleep(5000, 2000)
                        break
                except Exception:
                    pass

            # Find available date cells
            available = page.query_selector_all(
                ".calendar-cell.available, "
                "[class*='available'][class*='date'], "
                "[data-available='true']"
            )
            print(f"  [QatarDirect] Found {len(available)} available dates")

            for i, cell in enumerate(available[:20]):
                try:
                    date_attr = cell.get_attribute("data-date")
                    text = cell.inner_text()
                    miles_match = re.search(r'([\d,]+)\s*miles?', text, re.I)
                    miles = int(miles_match.group(1).replace(",", "")) if miles_match else None

                    dep_date = date_attr or f"{year}-{month}-{str(i+1).zfill(2)}"

                    if miles:
                        results.append({
                            "provider": "Qatar Airways (Direct)",
                            "monitor_id": monitor["id"],
                            "kind": "award",
                            "origin": "YYZ",
                            "destination": destination,
                            "departure_date": dep_date,
                            "points_cost": miles,
                            "cash_surcharge": 250,
                            "currency": "USD",
                            "cabin": monitor.get("cabin", "business"),
                            "airline": "Qatar Airways",
                            "stops": 1,
                            "duration": "~18h",
                            "booking_url": booking_url,
                            "is_award": True,
                        })
                except Exception:
                    continue

            # If cells exist but no miles parsed, still flag availability
            if not results and available:
                results.append({
                    "provider": "Qatar Airways (Direct)",
                    "monitor_id": monitor["id"],
                    "kind": "award",
                    "origin": "YYZ",
                    "destination": destination,
                    "departure_date": f"{year}-{month}",
                    "points_cost": None,
                    "currency": "USD",
                    "cabin": monitor.get("cabin", "business"),
                    "airline": "Qatar Airways",
                    "stops": 1,
                    "duration": "~18h",
                    "booking_url": booking_url,
                    "is_award": True,
                })

        except Exception as e:
            print(f"  [QatarDirect] Error: {e}")
        finally:
            page.close()
            browser.close()

    return results


# ── Public entry point ───────────────────────────────────────────────────────

def scrape_award_month(monitor: dict) -> list[dict]:
    seats_aero_key = os.environ.get("SEATS_AERO_API_KEY", "")
    if seats_aero_key:
        results = _scrape_seats_aero(monitor, seats_aero_key)
        if results:
            return results
    return _scrape_qatar_direct(monitor)
