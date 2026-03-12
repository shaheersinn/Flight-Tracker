"""RapidAPI Google Flights scraper with strict monthly quota management."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from backend.src.core.config import settings
from backend.src.scrapers.base import BaseScraper

logger = logging.getLogger(__name__)

# ── Quota helpers ─────────────────────────────────────────────────────────────


def _load_usage() -> Dict[str, Any]:
    """Load the usage record from the JSON file on disk."""
    path = settings.rapidapi_usage_file
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_usage(data: Dict[str, Any]) -> None:
    """Persist the usage record to disk."""
    path = settings.rapidapi_usage_file
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


def _month_key() -> str:
    """Return the current month as ``YYYY-MM``."""
    return datetime.now(timezone.utc).strftime("%Y-%m")


def get_monthly_usage() -> int:
    """Return the number of RapidAPI calls made in the current calendar month."""
    data = _load_usage()
    return int(data.get(_month_key(), 0))


def increment_monthly_usage() -> int:
    """Increment the call counter for the current month and return the new count."""
    data = _load_usage()
    key = _month_key()
    data[key] = int(data.get(key, 0)) + 1
    _save_usage(data)
    return data[key]


def quota_remaining() -> int:
    """Return the number of RapidAPI calls remaining for the current month."""
    return max(0, settings.rapidapi_monthly_limit - get_monthly_usage())


# ── Scraper ───────────────────────────────────────────────────────────────────

_RAPIDAPI_SEARCH_URL = (
    "https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlights"
)


class RapidAPIFlightScraper(BaseScraper):
    """Fetches flight prices via the Sky-Scrapper RapidAPI endpoint.

    Enforces a hard monthly call limit (default: 10 calls / month).
    If the quota is exhausted the scraper returns an empty list and logs a
    warning rather than raising an exception, so that the rest of the daily
    pipeline can continue using the Playwright-based scraper.
    """

    name = "rapidapi"

    async def _fetch(
        self,
        *,
        proxy: Optional[str] = None,
        origin: str,
        destination: str,
        date: str,
        adults: int = 1,
        cabin_class: str = "economy",
        **_: Any,
    ) -> List[Dict[str, Any]]:
        """Fetch prices from RapidAPI.

        Parameters
        ----------
        origin:
            IATA departure airport code.
        destination:
            IATA arrival airport code.
        date:
            ``YYYY-MM-DD`` departure date.
        adults:
            Number of adult passengers.
        cabin_class:
            One of ``economy``, ``premium_economy``, ``business``, ``first``.

        Returns
        -------
        list of dict
        """
        if not settings.rapidapi_key:
            logger.info("RapidAPI key not configured — skipping RapidAPI scraper.")
            return []

        remaining = quota_remaining()
        if remaining <= 0:
            logger.warning(
                "RapidAPI monthly quota exhausted (%d/%d calls used). Skipping.",
                get_monthly_usage(),
                settings.rapidapi_monthly_limit,
            )
            return []

        headers = {
            "X-RapidAPI-Key": settings.rapidapi_key,
            "X-RapidAPI-Host": settings.rapidapi_host,
        }
        params = {
            "originSkyId": origin,
            "destinationSkyId": destination,
            "originEntityId": origin,
            "destinationEntityId": destination,
            "date": date,
            "adults": str(adults),
            "cabinClass": cabin_class,
            "currency": "CAD",
            "countryCode": "CA",
            "market": "en-CA",
        }

        proxy_url = proxy  # httpx accepts a plain URL string

        try:
            async with httpx.AsyncClient(
                proxies=proxy_url,  # type: ignore[arg-type]
                timeout=20.0,
                follow_redirects=True,
            ) as client:
                response = await client.get(
                    _RAPIDAPI_SEARCH_URL, headers=headers, params=params
                )
                response.raise_for_status()
                increment_monthly_usage()
                logger.info(
                    "RapidAPI call succeeded (%d/%d used this month).",
                    get_monthly_usage(),
                    settings.rapidapi_monthly_limit,
                )
                return self._parse_response(response.json(), origin, destination, date)
        except httpx.HTTPStatusError as exc:
            logger.error("RapidAPI HTTP error %s: %s", exc.response.status_code, exc)
            raise
        except Exception as exc:
            logger.error("RapidAPI request failed: %s", exc)
            raise

    # ------------------------------------------------------------------
    # Parsing
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_response(
        payload: Dict[str, Any], origin: str, destination: str, date: str
    ) -> List[Dict[str, Any]]:
        """Parse the Sky-Scrapper API JSON response into a list of result dicts."""
        results: List[Dict[str, Any]] = []

        itineraries = (
            payload.get("data", {})
            .get("itineraries", [])
        )

        for item in itineraries:
            try:
                price_info = item.get("price", {})
                price_raw = price_info.get("formatted", "") or ""
                price = None
                try:
                    price = float(
                        price_raw.replace("CA$", "").replace(",", "").strip()
                    )
                except ValueError:
                    pass

                legs = item.get("legs", [{}])
                first_leg = legs[0] if legs else {}
                carriers = first_leg.get("carriers", {})
                marketing = carriers.get("marketing", [{}])
                airline = marketing[0].get("name") if marketing else None

                results.append(
                    {
                        "origin": origin,
                        "destination": destination,
                        "date": date,
                        "price_cad": price,
                        "airline": airline,
                        "source": "rapidapi",
                        "raw": json.dumps(item)[:500],
                    }
                )
            except Exception as exc:
                logger.debug("Failed to parse RapidAPI itinerary: %s", exc)

        return results
