"""
scraper/adapters/google_flights.py
Primary cash-fare scraper using Playwright on Google Flights.
Falls back gracefully on bot-detection or timeouts.
"""

import asyncio
import logging
import re
from datetime import datetime
from typing import Optional

from playwright.async_api import TimeoutError as PWTimeout

from scraper.monitors import CashMonitor
from scraper.adapters.base import (
    launch_browser, make_stealth_context, human_delay, retry_async
)
from scraper.db import make_fingerprint

logger = logging.getLogger(__name__)


def _build_url(origin: str, destination: str, date: str) -> str:
    """Build Google Flights one-way search URL for Canadian locale."""
    return (
        f"https://www.google.com/travel/flights"
        f"?hl=en-CA&gl=CA&curr=CAD"
        f"#flt={origin}.{destination}.{date};c:CAD;e:1;sd:1;t:f"
    )


async def _parse_page(page, monitor: CashMonitor, date: str, provider: str) -> list[dict]:
    """Extract flight cards from Google Flights results page."""
    results = []
    now = datetime.utcnow().isoformat()

    try:
        # Primary selector
        await page.wait_for_selector('div[jsname="IWWDBc"]', timeout=12000)
    except PWTimeout:
        try:
            # Alternate: check for "no results" or CAPTCHA
            body = await page.inner_text("body")
            if "captcha" in body.lower() or "unusual traffic" in body.lower():
                logger.warning(f"[GF] CAPTCHA detected for {monitor.id} on {date}")
            else:
                logger.warning(f"[GF] No flight cards found for {monitor.id} on {date}")
        except Exception:
            pass
        return []

    await human_delay(2000, 3500)

    try:
        cards = await page.query_selector_all('div[jsname="IWWDBc"]')
        for card in cards[:8]:
            try:
                # Price — try multiple selectors
                price_el = (
                    await card.query_selector('[class*="YMlIz FpEdX"]') or
                    await card.query_selector('[class*="FpEdX"]') or
                    await card.query_selector('[aria-label*="CA$"]') or
                    await card.query_selector('[aria-label*="CAD"]')
                )
                if not price_el:
                    continue
                price_text = await price_el.inner_text()
                price_match = re.search(r'[\d,]+', price_text.replace('\xa0', ''))
                if not price_match:
                    continue
                price = float(price_match.group().replace(',', ''))
                if price < 30 or price > 5000:
                    continue

                # Airline
                airline_el = (
                    await card.query_selector('[class*="sSHqwe tPgKwe"]') or
                    await card.query_selector('[class*="h1fkLb"]')
                )
                airline = (await airline_el.inner_text()).strip() if airline_el else "Unknown"

                # Duration
                dur_el = await card.query_selector('[class*="Ak5kof"]')
                duration = (await dur_el.inner_text()).strip() if dur_el else "N/A"

                # Stops
                stops_el = await card.query_selector('[class*="EfT7Ae"]')
                stops_text = (await stops_el.inner_text()).strip().lower() if stops_el else ""
                if "nonstop" in stops_text:
                    stops = 0
                else:
                    m = re.search(r'\d+', stops_text)
                    stops = int(m.group()) if m else 1

                fp = make_fingerprint(monitor.id, provider, date, airline, price, stops)
                results.append({
                    "monitor_id": monitor.id,
                    "provider": provider,
                    "kind": "cash",
                    "origin": monitor.origin,
                    "destination": monitor.destination,
                    "departure_date": date,
                    "total_price": price,
                    "currency": "CAD",
                    "airline": airline,
                    "flight_number": None,
                    "stops": stops,
                    "duration": duration,
                    "booking_url": _build_url(monitor.origin, monitor.destination, date),
                    "checked_at": now,
                    "fingerprint": fp,
                })
            except Exception as e:
                logger.debug(f"[GF] Card parse error: {e}")
    except Exception as e:
        logger.warning(f"[GF] Page evaluation error: {e}")

    return results


async def scrape_window(monitor: CashMonitor) -> list[dict]:
    """Scrape all dates in monitor's window. Returns list of quote dicts."""
    playwright, browser = await launch_browser()
    ctx = await make_stealth_context(browser)
    all_results: list[dict] = []
    provider = "Google Flights (Playwright)"

    try:
        for date in monitor.dates():
            page = await ctx.new_page()
            try:
                url = _build_url(monitor.origin, monitor.destination, date)
                logger.info(f"[GF] {monitor.origin}→{monitor.destination} on {date}")

                async def do_scrape():
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    await human_delay(1500, 2500)
                    # Simulate scroll
                    await page.mouse.move(600, 400)
                    await page.evaluate("window.scrollBy(0, 300)")
                    await human_delay(1000, 1500)
                    return await _parse_page(page, monitor, date, provider)

                results = await retry_async(do_scrape, retries=2, base_delay=6.0)
                all_results.extend(results)
                logger.info(f"[GF] → {len(results)} results")
            except Exception as e:
                logger.warning(f"[GF] Failed on {date}: {e}")
            finally:
                await page.close()

            await human_delay(3000, 5000)

    finally:
        await ctx.close()
        await browser.close()
        await playwright.stop()

    return all_results
