"""Playwright-based Google Flights scraper with stealth measures."""
from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any, Dict, List, Optional

from backend.src.core.config import settings
from backend.src.scrapers.base import BaseScraper, random_user_agent

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_GOOGLE_FLIGHTS_URL = (
    "https://www.google.com/travel/flights/search"
    "?tfs=CBwQAhoeEgoyMDI1LTA3LTAyagcIARIDWVlDcgcIARIDWVla"
)

_VIEWPORT_PRESETS = [
    {"width": 1920, "height": 1080},
    {"width": 1440, "height": 900},
    {"width": 1366, "height": 768},
    {"width": 1280, "height": 800},
]


def _build_url(origin: str, destination: str, date: str) -> str:
    """Build a Google Flights deep-link URL for a one-way search."""
    # Use the simple search URL; Google Flights will interpret the query params.
    return (
        f"https://www.google.com/travel/flights/search"
        f"?q=Flights+from+{origin}+to+{destination}+on+{date}"
    )


# ── Scraper ───────────────────────────────────────────────────────────────────


class GoogleFlightsScraper(BaseScraper):
    """Scrapes Google Flights using Playwright with anti-detection measures."""

    name = "google_flights"

    async def _fetch(
        self,
        *,
        proxy: Optional[str] = None,
        origin: str,
        destination: str,
        date: str,
        **_: Any,
    ) -> List[Dict[str, Any]]:
        """Launch a headless browser, navigate to Google Flights and parse prices.

        Parameters
        ----------
        origin:
            IATA airport code for the departure airport (e.g. ``"YYC"``).
        destination:
            IATA airport code for the arrival airport (e.g. ``"YYZ"``).
        date:
            Departure date in ``YYYY-MM-DD`` format.

        Returns
        -------
        list of dict
            Each dict contains: ``origin``, ``destination``, ``date``,
            ``price_cad``, ``airline``, ``source``.
        """
        try:
            from playwright.async_api import async_playwright  # lazy import
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "playwright is not installed. "
                "Run `pip install playwright && playwright install chromium`."
            ) from exc

        url = _build_url(origin, destination, date)
        viewport = random.choice(_VIEWPORT_PRESETS)
        user_agent = random_user_agent()

        proxy_config = {"server": proxy} if proxy else None

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=settings.playwright_headless,
                proxy=proxy_config,  # type: ignore[arg-type]
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                ],
            )
            context = await browser.new_context(
                user_agent=user_agent,
                viewport=viewport,
                locale="en-CA",
                timezone_id="America/Toronto",
                java_script_enabled=True,
                # Mimic a real browser by accepting common permissions
                permissions=["geolocation"],
                extra_http_headers={
                    "Accept-Language": "en-CA,en;q=0.9",
                    "Accept": (
                        "text/html,application/xhtml+xml,"
                        "application/xml;q=0.9,image/webp,*/*;q=0.8"
                    ),
                },
            )

            # Remove the `navigator.webdriver` property to defeat bot-detection
            await context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )

            page = await context.new_page()

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                # Random human-like delay
                await asyncio.sleep(random.uniform(2.0, 4.0))

                # Scroll down slightly to trigger lazy-loaded content
                await page.evaluate("window.scrollBy(0, 400)")
                await asyncio.sleep(random.uniform(1.0, 2.5))

                results = await self._parse_prices(page, origin, destination, date)
            except Exception as exc:
                logger.warning(
                    "GoogleFlightsScraper failed for %s->%s %s: %s",
                    origin,
                    destination,
                    date,
                    exc,
                )
                raise
            finally:
                await browser.close()

        return results

    # ------------------------------------------------------------------
    # Parsing helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def _parse_prices(
        page: Any, origin: str, destination: str, date: str
    ) -> List[Dict[str, Any]]:
        """Extract flight price cards from the loaded Google Flights page."""
        results: List[Dict[str, Any]] = []

        # Google Flights renders prices inside list items with aria-label
        # containing the price.  We use a broad selector and fall back
        # gracefully if the structure changes.
        try:
            # Wait for at least one price element to appear
            await page.wait_for_selector(
                "li[data-id]", timeout=15_000
            )
        except Exception:
            logger.warning(
                "No flight list items found for %s->%s %s",
                origin,
                destination,
                date,
            )
            return results

        items = await page.query_selector_all("li[data-id]")
        for item in items[:10]:  # cap to first 10 results
            try:
                text = await item.inner_text()
                price = _extract_price_from_text(text)
                airline = _extract_airline_from_text(text)
                results.append(
                    {
                        "origin": origin,
                        "destination": destination,
                        "date": date,
                        "price_cad": price,
                        "airline": airline,
                        "source": "google_flights",
                        "raw": text[:500],
                    }
                )
            except Exception as exc:
                logger.debug("Failed to parse item: %s", exc)

        return results


# ── Extraction utilities ──────────────────────────────────────────────────────


def _extract_price_from_text(text: str) -> Optional[float]:
    """Attempt to extract a CAD price from raw card text."""
    import re

    # Match patterns like "CA$123", "$123", "C$1,234"
    match = re.search(r"(?:CA\$|C\$|\$)([\d,]+)", text)
    if match:
        price_str = match.group(1).replace(",", "")
        try:
            return float(price_str)
        except ValueError:
            pass
    return None


def _extract_airline_from_text(text: str) -> Optional[str]:
    """Attempt to extract the first recognisable airline name from card text."""
    known_airlines = [
        "Air Canada",
        "WestJet",
        "Flair",
        "Lynx",
        "Porter",
        "United",
        "Delta",
        "American",
        "Air Transat",
    ]
    for airline in known_airlines:
        if airline.lower() in text.lower():
            return airline
    return None
