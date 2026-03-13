"""
scraper/adapters/qatar_award.py
Qatar Airways award availability scraper.
  Primary:  seats.aero Partner API  (if SEATS_AERO_API_KEY is set)
  Fallback: Qatar Privilege Club website via Playwright
"""

import os
import logging
import re
from datetime import datetime, date
from calendar import monthrange
from typing import Optional

import requests
from playwright.async_api import TimeoutError as PWTimeout

from scraper.monitors import AwardMonitor
from scraper.adapters.base import (
    launch_browser, make_stealth_context, human_delay, retry_async
)
from scraper.db import make_fingerprint

logger = logging.getLogger(__name__)

CABIN_MAP = {"economy": "Y", "premium_economy": "W", "business": "J", "first": "F"}


# ─── seats.aero API ──────────────────────────────────────────────────────────

def _seats_aero_available() -> bool:
    return bool(os.getenv("SEATS_AERO_API_KEY"))


def scrape_seats_aero(monitor: AwardMonitor) -> list[dict]:
    year_s, month_s = monitor.month.split("-")
    year, month = int(year_s), int(month_s)
    _, last_day = monthrange(year, month)
    start = f"{year}-{month:02d}-01"
    end = f"{year}-{month:02d}-{last_day:02d}"

    logger.info(f"[seats.aero] {monitor.origin}→{monitor.destination} {monitor.month}")
    try:
        resp = requests.get(
            "https://seats.aero/partnerapi/availability",
            headers={"Partner-Authorization": os.environ["SEATS_AERO_API_KEY"]},
            params={
                "origin_airport": monitor.origin,
                "destination_airport": monitor.destination,
                "start_date": start,
                "end_date": end,
                "cabin": CABIN_MAP.get(monitor.cabin, "J"),
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
    except Exception as e:
        logger.warning(f"[seats.aero] API error: {e}")
        return []

    results = []
    now = datetime.utcnow().isoformat()
    for slot in data:
        if not slot.get("available"):
            continue
        dep = slot.get("date", "")[:10]
        points = slot.get("mileageCost") or slot.get("points")
        surcharge = slot.get("taxesFees")
        fp = make_fingerprint(monitor.id, "seats.aero", dep, "Qatar Airways", points, 1)
        results.append({
            "monitor_id": monitor.id,
            "provider": "seats.aero",
            "kind": "award",
            "origin": monitor.origin,
            "destination": monitor.destination,
            "departure_date": dep or None,
            "total_price": None,
            "currency": "CAD",
            "points_cost": int(points) if points else None,
            "cash_surcharge": float(surcharge) if surcharge else None,
            "cabin": monitor.cabin,
            "airline": "Qatar Airways",
            "flight_number": None,
            "stops": 1,
            "duration": "N/A",
            "booking_url": "https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html",
            "checked_at": now,
            "fingerprint": fp,
        })

    logger.info(f"[seats.aero] → {len(results)} available slots")
    return results


# ─── Qatar Privilege Club Playwright Scraper ─────────────────────────────────

async def scrape_qatar_website(monitor: AwardMonitor) -> list[dict]:
    """
    Scrape Qatar Privilege Club for award availability.
    Navigates to the booking form and checks for award pricing calendar.
    """
    playwright, browser = await launch_browser()
    ctx = await make_stealth_context(browser)
    results = []
    now = datetime.utcnow().isoformat()
    year_s, month_s = monitor.month.split("-")
    search_date = f"{year_s}-{month_s}-01"

    page = await ctx.new_page()
    try:
        url = "https://www.qatarairways.com/en-ca/privilege-club/redeem-avios.html"
        logger.info(f"[Qatar-Web] {monitor.origin}→{monitor.destination} {monitor.month}")
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await human_delay(3000, 5000)

        # ── Fill origin ────────────────────────────────────────────────────────
        origin_selectors = [
            'input[data-testid="origin-input"]',
            'input[placeholder*="From"]',
            'input[name*="origin"]',
            '#fromStation',
        ]
        origin_el = None
        for sel in origin_selectors:
            try:
                origin_el = await page.wait_for_selector(sel, timeout=5000)
                if origin_el:
                    break
            except PWTimeout:
                continue

        if origin_el:
            await origin_el.click()
            await origin_el.fill(monitor.origin)
            await human_delay(1000, 1500)
            # Select first suggestion
            try:
                await page.wait_for_selector('[class*="suggestion"], [class*="autocomplete-item"]', timeout=5000)
                suggestions = await page.query_selector_all('[class*="suggestion"], [class*="autocomplete-item"]')
                if suggestions:
                    await suggestions[0].click()
            except PWTimeout:
                await page.keyboard.press("ArrowDown")
                await page.keyboard.press("Enter")
            await human_delay(800, 1200)

        # ── Fill destination ───────────────────────────────────────────────────
        dest_selectors = [
            'input[data-testid="destination-input"]',
            'input[placeholder*="To"]',
            'input[name*="destination"]',
            '#toStation',
        ]
        dest_el = None
        for sel in dest_selectors:
            try:
                dest_el = await page.wait_for_selector(sel, timeout=5000)
                if dest_el:
                    break
            except PWTimeout:
                continue

        if dest_el:
            await dest_el.click()
            await dest_el.fill(monitor.destination)
            await human_delay(1000, 1500)
            try:
                await page.wait_for_selector('[class*="suggestion"], [class*="autocomplete-item"]', timeout=5000)
                suggestions = await page.query_selector_all('[class*="suggestion"], [class*="autocomplete-item"]')
                if suggestions:
                    await suggestions[0].click()
            except PWTimeout:
                await page.keyboard.press("ArrowDown")
                await page.keyboard.press("Enter")
            await human_delay(800, 1200)

        # ── Set date ───────────────────────────────────────────────────────────
        date_selectors = [
            'input[type="date"]',
            'input[data-testid*="date"]',
            'input[placeholder*="Date"]',
        ]
        date_el = None
        for sel in date_selectors:
            try:
                date_el = await page.wait_for_selector(sel, timeout=4000)
                if date_el:
                    break
            except PWTimeout:
                continue

        if date_el:
            await date_el.fill(search_date)
            await human_delay(500, 800)

        # ── Submit search ──────────────────────────────────────────────────────
        submit_selectors = [
            'button[type="submit"]',
            'button[data-testid*="search"]',
            'button[class*="search"]',
        ]
        submit_el = None
        for sel in submit_selectors:
            try:
                submit_el = await page.wait_for_selector(sel, timeout=4000)
                if submit_el:
                    break
            except PWTimeout:
                continue

        if submit_el:
            await submit_el.click()
            await human_delay(5000, 8000)

            # Parse results
            result_selectors = [
                '[class*="flight-result"]',
                '[class*="award"]',
                '[data-testid*="flight"]',
                '[class*="FlightCard"]',
            ]
            cards = []
            for sel in result_selectors:
                try:
                    await page.wait_for_selector(sel, timeout=10000)
                    cards = await page.query_selector_all(sel)
                    if cards:
                        break
                except PWTimeout:
                    continue

            for card in cards[:10]:
                try:
                    pts_el = (
                        await card.query_selector('[class*="points"]') or
                        await card.query_selector('[class*="avios"]') or
                        await card.query_selector('[class*="miles"]')
                    )
                    pts_text = await pts_el.inner_text() if pts_el else ""
                    pts_match = re.search(r'[\d,]+', pts_text)
                    if not pts_match:
                        continue
                    points = int(pts_match.group().replace(',', ''))

                    dur_el = await card.query_selector('[class*="duration"]')
                    duration = (await dur_el.inner_text()).strip() if dur_el else "N/A"

                    fp = make_fingerprint(monitor.id, "Qatar-Web", search_date, "Qatar Airways", points, 1)
                    results.append({
                        "monitor_id": monitor.id,
                        "provider": "Qatar Airways (Playwright)",
                        "kind": "award",
                        "origin": monitor.origin,
                        "destination": monitor.destination,
                        "departure_date": search_date,
                        "total_price": None,
                        "currency": "CAD",
                        "points_cost": points,
                        "cash_surcharge": None,
                        "cabin": monitor.cabin,
                        "airline": "Qatar Airways",
                        "flight_number": None,
                        "stops": 1,
                        "duration": duration,
                        "booking_url": url,
                        "checked_at": now,
                        "fingerprint": fp,
                    })
                except Exception as e:
                    logger.debug(f"[Qatar-Web] Card parse error: {e}")

        logger.info(f"[Qatar-Web] → {len(results)} results found")

    except Exception as e:
        logger.warning(f"[Qatar-Web] Failed for {monitor.id}: {e}")
    finally:
        await page.close()
        await ctx.close()
        await browser.close()
        await playwright.stop()

    return results


async def scrape_month(monitor: AwardMonitor) -> list[dict]:
    """Try seats.aero first; fall back to Playwright scraping."""
    if _seats_aero_available():
        results = scrape_seats_aero(monitor)
        if results:
            return results

    return await retry_async(
        lambda: scrape_qatar_website(monitor),
        retries=2, base_delay=8.0
    )
