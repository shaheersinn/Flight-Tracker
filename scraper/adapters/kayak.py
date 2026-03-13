"""
scraper/adapters/kayak.py
Secondary cash-fare fallback scraper using Kayak Canada.
Only used when Google Flights returns no results.
Samples every other date to reduce load and block risk.
"""

import asyncio
import logging
import re
from datetime import datetime

from playwright.async_api import TimeoutError as PWTimeout

from scraper.monitors import CashMonitor
from scraper.adapters.base import (
    launch_browser, make_stealth_context, human_delay, retry_async
)
from scraper.db import make_fingerprint

logger = logging.getLogger(__name__)
PROVIDER = "Kayak"


def _build_url(origin: str, destination: str, date: str) -> str:
    return f"https://www.ca.kayak.com/flights/{origin}-{destination}/{date}?sort=price_a"


async def _parse_page(page, monitor: CashMonitor, date: str) -> list[dict]:
    results = []
    now = datetime.utcnow().isoformat()

    try:
        await page.wait_for_selector('[class*="nrc6"]', timeout=12000)
    except PWTimeout:
        logger.warning(f"[Kayak] No results for {monitor.id} on {date}")
        return []

    await human_delay(2000, 3000)

    try:
        cards = await page.query_selector_all('[class*="nrc6"]')
        for card in cards[:6]:
            try:
                price_el = (
                    await card.query_selector('[class*="price-text"]') or
                    await card.query_selector('[class*="mainPrice"]') or
                    await card.query_selector('[class*="Iqt3"]')
                )
                if not price_el:
                    continue
                price_text = await price_el.inner_text()
                m = re.search(r'[\d,]+', price_text)
                if not m:
                    continue
                price = float(m.group().replace(',', ''))
                if price < 30 or price > 5000:
                    continue

                airline_el = (
                    await card.query_selector('[class*="codeshares-airline-names"]') or
                    await card.query_selector('[class*="carrier-name"]') or
                    await card.query_selector('[class*="VY2U"]')
                )
                airline = (await airline_el.inner_text()).strip() if airline_el else "Unknown"

                dur_el = await card.query_selector('[class*="duration"]')
                duration = (await dur_el.inner_text()).strip() if dur_el else "N/A"

                stops_el = await card.query_selector('[class*="stops-text"]')
                stops_text = (await stops_el.inner_text()).strip().lower() if stops_el else "nonstop"
                stops = 0 if "nonstop" in stops_text else int(re.search(r'\d+', stops_text).group() if re.search(r'\d+', stops_text) else 1)

                fp = make_fingerprint(monitor.id, PROVIDER, date, airline, price, stops)
                results.append({
                    "monitor_id": monitor.id,
                    "provider": PROVIDER,
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
                logger.debug(f"[Kayak] Card parse error: {e}")
    except Exception as e:
        logger.warning(f"[Kayak] Page eval error: {e}")

    return results


async def scrape_window(monitor: CashMonitor) -> list[dict]:
    playwright, browser = await launch_browser()
    ctx = await make_stealth_context(browser)
    all_results: list[dict] = []

    # Sample every other date to reduce footprint
    dates = monitor.dates()
    sample = dates[::2] if len(dates) > 3 else dates

    try:
        for date in sample:
            page = await ctx.new_page()
            try:
                url = _build_url(monitor.origin, monitor.destination, date)
                logger.info(f"[Kayak] {monitor.origin}→{monitor.destination} on {date}")

                async def do_scrape():
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    await human_delay(2000, 4000)
                    return await _parse_page(page, monitor, date)

                results = await retry_async(do_scrape, retries=2, base_delay=7.0)
                all_results.extend(results)
                logger.info(f"[Kayak] → {len(results)} results")
            except Exception as e:
                logger.warning(f"[Kayak] Failed on {date}: {e}")
            finally:
                await page.close()

            await human_delay(4000, 7000)

    finally:
        await ctx.close()
        await browser.close()
        await playwright.stop()

    return all_results
