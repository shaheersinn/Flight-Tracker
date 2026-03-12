"""Business logic: search date generation and price-drop detection."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Data structures ───────────────────────────────────────────────────────────


@dataclass
class SearchLeg:
    """A single one-way flight search specification."""

    origin: str
    destination: str
    date: str  # YYYY-MM-DD
    label: str = ""  # human-readable description for notifications


@dataclass
class AwardSearchLeg:
    """A single award flight search specification."""

    origin: str
    destination: str
    date: str  # YYYY-MM-DD (start-of-month used as anchor)
    program: str
    cabin_class: str
    label: str = ""


@dataclass
class PriceDrop:
    """Represents a detected price drop for a route/date."""

    origin: str
    destination: str
    departure_date: str
    previous_price_cad: Optional[float]
    new_price_cad: float
    drop_percent: Optional[float]
    airline: Optional[str]
    source: str


# ── Date generation helpers ───────────────────────────────────────────────────


def _date_range(anchor: date, days_before: int, days_after: int) -> List[date]:
    """Return a list of dates within [anchor - days_before, anchor + days_after]."""
    return [
        anchor + timedelta(days=d)
        for d in range(-days_before, days_after + 1)
    ]


def _fmt(d: date) -> str:
    return d.isoformat()


def _last_week_of_june(year: int) -> List[date]:
    """Return the last 7 days of June for the given year."""
    last_day = date(year, 6, 30)
    return [last_day - timedelta(days=i) for i in range(6, -1, -1)]


# ── Search leg factory ────────────────────────────────────────────────────────


def generate_regular_search_legs(year: int = 2026) -> List[SearchLeg]:
    """Generate all regular (non-award) search legs for the configured year.

    Routes
    ------
    1. YYC → YYZ  July 2nd ± 4 days
    2. YYC → YYZ  July 13th ± 4 days
    3. YYC → YYZ  July 14th ± 4 days
    4. YYZ → YYC  Last week of June
    5. YYZ → YYC  May 8th ± 5 days
    6. YYZ → YYC  June 10th
    7. YYC → YYZ  June 13th
    """
    legs: List[SearchLeg] = []

    # 1. YYC → YYZ  July 2nd ± 4 days
    anchor = date(year, 7, 2)
    for d in _date_range(anchor, 4, 4):
        legs.append(
            SearchLeg(
                origin="YYC",
                destination="YYZ",
                date=_fmt(d),
                label=f"YYC→YYZ July 2nd window ({_fmt(d)})",
            )
        )

    # 2. YYC → YYZ  July 13th ± 4 days
    anchor = date(year, 7, 13)
    for d in _date_range(anchor, 4, 4):
        legs.append(
            SearchLeg(
                origin="YYC",
                destination="YYZ",
                date=_fmt(d),
                label=f"YYC→YYZ July 13th window ({_fmt(d)})",
            )
        )

    # 3. YYC → YYZ  July 14th ± 4 days
    anchor = date(year, 7, 14)
    for d in _date_range(anchor, 4, 4):
        legs.append(
            SearchLeg(
                origin="YYC",
                destination="YYZ",
                date=_fmt(d),
                label=f"YYC→YYZ July 14th window ({_fmt(d)})",
            )
        )

    # 4. YYZ → YYC  Last week of June
    for d in _last_week_of_june(year):
        legs.append(
            SearchLeg(
                origin="YYZ",
                destination="YYC",
                date=_fmt(d),
                label=f"YYZ→YYC last week of June ({_fmt(d)})",
            )
        )

    # 5. YYZ → YYC  May 8th ± 5 days
    anchor = date(year, 5, 8)
    for d in _date_range(anchor, 5, 5):
        legs.append(
            SearchLeg(
                origin="YYZ",
                destination="YYC",
                date=_fmt(d),
                label=f"YYZ→YYC May 8th window ({_fmt(d)})",
            )
        )

    # 6. YYZ → YYC  June 10th (exact)
    legs.append(
        SearchLeg(
            origin="YYZ",
            destination="YYC",
            date=_fmt(date(year, 6, 10)),
            label="YYZ→YYC June 10th",
        )
    )

    # 7. YYC → YYZ  June 13th (exact)
    legs.append(
        SearchLeg(
            origin="YYC",
            destination="YYZ",
            date=_fmt(date(year, 6, 13)),
            label="YYC→YYZ June 13th",
        )
    )

    # Deduplicate while preserving order
    seen: set = set()
    unique: List[SearchLeg] = []
    for leg in legs:
        key = (leg.origin, leg.destination, leg.date)
        if key not in seen:
            seen.add(key)
            unique.append(leg)

    logger.info("Generated %d unique regular search legs.", len(unique))
    return unique


def generate_award_search_legs() -> List[AwardSearchLeg]:
    """Generate all Qatar award search legs.

    Routes
    ------
    - YYZ → ISB  (June 2027, July 2027, December 2027) — economy & business
    - YYZ → IST  (June 2027, July 2027, December 2027) — economy & business
    """
    destinations = ["ISB", "IST"]
    months = ["2027-06-01", "2027-07-01", "2027-12-01"]
    cabins = ["economy", "business"]

    legs: List[AwardSearchLeg] = []
    for dest in destinations:
        dest_name = "Islamabad" if dest == "ISB" else "Istanbul"
        for month in months:
            year_month = month[:7]
            for cabin in cabins:
                legs.append(
                    AwardSearchLeg(
                        origin="YYZ",
                        destination=dest,
                        date=month,
                        program="QatarPrivilegeClub",
                        cabin_class=cabin,
                        label=(
                            f"QR Award YYZ→{dest_name} "
                            f"{year_month} {cabin.title()}"
                        ),
                    )
                )

    logger.info("Generated %d award search legs.", len(legs))
    return legs


# ── Price-drop detection ──────────────────────────────────────────────────────

# Minimum percentage drop to consider significant
PRICE_DROP_THRESHOLD_PCT = 5.0


def detect_price_drops(
    current_prices: List[dict],
    historical_prices: List[dict],
    threshold_pct: float = PRICE_DROP_THRESHOLD_PCT,
) -> List[PriceDrop]:
    """Compare current prices against historical lows and return drops.

    Parameters
    ----------
    current_prices:
        List of price dicts with keys: ``origin``, ``destination``, ``date``,
        ``price_cad``, ``airline``, ``source``.
    historical_prices:
        Same structure — the previous best known price for each route/date.
    threshold_pct:
        Minimum % drop to qualify as a price drop alert.

    Returns
    -------
    list of PriceDrop
    """
    # Build a lookup of the best historical price per (origin, destination, date)
    historical_map: dict = {}
    for rec in historical_prices:
        key = (rec["origin"], rec["destination"], rec["date"])
        prev = historical_map.get(key)
        if prev is None or (rec["price_cad"] or 0) < (prev["price_cad"] or float("inf")):
            historical_map[key] = rec

    drops: List[PriceDrop] = []
    for rec in current_prices:
        price = rec.get("price_cad")
        if price is None:
            continue
        key = (rec["origin"], rec["destination"], rec["date"])
        prev_rec = historical_map.get(key)
        prev_price = prev_rec["price_cad"] if prev_rec else None

        if prev_price is None:
            # First time seeing this route/date — record but don't alert
            continue

        if price < prev_price:
            pct = ((prev_price - price) / prev_price) * 100
            if pct >= threshold_pct:
                drops.append(
                    PriceDrop(
                        origin=rec["origin"],
                        destination=rec["destination"],
                        departure_date=rec["date"],
                        previous_price_cad=prev_price,
                        new_price_cad=price,
                        drop_percent=round(pct, 1),
                        airline=rec.get("airline"),
                        source=rec.get("source", ""),
                    )
                )

    return drops
