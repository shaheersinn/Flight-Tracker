# apps/worker/adapters/google_flights.py
import re
import time
import random
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page


def _sleep(ms: int, jitter: int = 0):
    time.sleep((ms + random.randint(0, jitter)) / 1000)


def _build_search_url(origin: str, destination: str, date_str: str) -> str:
    query = f"Flights from {origin} to {destination} on {date_str} one way"
    import urllib.parse
    return (
        "https://www.google.com/travel/flights?"
        f"q={urllib.parse.quote(query)}&hl=en-CA&gl=ca&curr=CAD"
    )


def _parse_cards(page: Page, origin: str, destination: str,
                 date_str: str, monitor_id: str) -> list[dict]:
    results = []
    # Google Flights uses many selector variations — try the most common ones
    selectors = [
        '[jsname="IWWDBc"]',
        'li[class*="pIav2d"]',
        '[data-pb-id]',
        'div[role="listitem"]',
    ]

    cards = []
    for sel in selectors:
        try:
            cards = page.query_selector_all(sel)
            if cards:
                break
        except Exception:
            continue

    if not cards:
        print(f"  [GoogleFlights] No cards found for {origin}→{destination} {date_str}")
        return []

    for card in cards[:5]:
        try:
            text = card.inner_text()
            lines = [l.strip() for l in text.split("\n") if l.strip()]

            price_match = re.search(r'\$[\d,]+|\bCAD[\s$]*([\d,]+)', text, re.IGNORECASE)
            if not price_match:
                continue
            price = float(re.sub(r'[^0-9.]', '', price_match.group(0)))
            if price <= 0:
                continue

            airline = next(
                (l for l in lines if re.search(r'Air Canada|WestJet|Flair|Porter|Swoop', l, re.I)),
                "Unknown"
            )
            duration = next((l for l in lines if re.search(r'\d+\s*hr', l, re.I)), "")
            stops_text = next((l for l in lines if re.search(r'nonstop|1 stop|2 stop', l, re.I)), "")
            stops = 0 if "nonstop" in stops_text.lower() else (int(re.search(r'\d', stops_text).group()) if re.search(r'\d', stops_text) else 1)

            results.append({
                "provider": "Google Flights (Playwright)",
                "monitor_id": monitor_id,
                "kind": "cash",
                "origin": origin,
                "destination": destination,
                "departure_date": date_str,
                "total_price": round(price, 2),
                "currency": "CAD",
                "airline": airline,
                "flight_number": "",
                "stops": stops,
                "duration": duration,
                "booking_url": _build_search_url(origin, destination, date_str),
                "is_award": False,
            })
        except Exception:
            continue

    return results


def scrape_cash_window(monitor: dict) -> list[dict]:
    """
    Scrape all dates in the monitor's date window via Playwright.
    Returns a list of flight result dicts.
    """
    origin = monitor["origin"]
    destination = monitor["destination"]
    date_from = date.fromisoformat(monitor["date_from"])
    date_to = date.fromisoformat(monitor["date_to"])
    monitor_id = monitor["id"]

    results = []

    with sync_playwright() as p:
        browser: Browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox",
                  "--disable-blink-features=AutomationControlled"],
        )
        context: BrowserContext = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1440, "height": 900},
            locale="en-CA",
            timezone_id="America/Toronto",
        )
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => false})"
        )
        page = context.new_page()

        current = date_from
        while current <= date_to:
            date_str = current.isoformat()
            url = _build_search_url(origin, destination, date_str)
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                _sleep(3000, 1500)
                day_results = _parse_cards(page, origin, destination, date_str, monitor_id)
                results.extend(day_results)
                print(f"  [GoogleFlights] {origin}→{destination} {date_str}: {len(day_results)} results")
            except Exception as e:
                print(f"  [GoogleFlights] Error on {date_str}: {e}")
            _sleep(2000, 1000)
            current += timedelta(days=1)

        page.close()
        browser.close()

    return results
