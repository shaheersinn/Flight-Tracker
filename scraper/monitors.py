"""
scraper/monitors.py
All flight monitors — cash fares and Qatar award routes.
Edit this file to add/remove/modify tracked routes.
"""

from dataclasses import dataclass, field
from typing import Literal, Optional, List
from datetime import date, timedelta


# ─── Data Models ─────────────────────────────────────────────────────────────

@dataclass
class CashMonitor:
    id: str
    kind: Literal["cash"] = "cash"
    origin: str = ""
    destination: str = ""
    date_from: str = ""         # YYYY-MM-DD
    date_to: str = ""           # YYYY-MM-DD
    preferred_carriers: List[str] = field(default_factory=list)
    alert_threshold: Optional[float] = None  # Alert if price < this (CAD)

    def dates(self) -> List[str]:
        """Return every date in the window as YYYY-MM-DD strings."""
        result = []
        cur = date.fromisoformat(self.date_from)
        end = date.fromisoformat(self.date_to)
        while cur <= end:
            result.append(cur.isoformat())
            cur += timedelta(days=1)
        return result


@dataclass
class AwardMonitor:
    id: str
    kind: Literal["award"] = "award"
    airline: str = "Qatar Airways"
    origin: str = ""
    destination: str = ""
    destination_label: str = ""
    month: str = ""             # YYYY-MM
    cabin: str = "business"


Monitor = CashMonitor | AwardMonitor


# ─── Cash Fare Monitors ───────────────────────────────────────────────────────

CASH_MONITORS: List[CashMonitor] = [
    CashMonitor(
        id="yyc-yyz-jul2-window",
        origin="YYC", destination="YYZ",
        date_from="2026-06-28", date_to="2026-07-06",
        preferred_carriers=["AC", "WS", "F8"],
        alert_threshold=180,
    ),
    CashMonitor(
        id="yyc-yyz-jul13-window",
        origin="YYC", destination="YYZ",
        date_from="2026-07-09", date_to="2026-07-17",
        preferred_carriers=["AC", "WS", "F8"],
        alert_threshold=180,
    ),
    CashMonitor(
        id="yyc-yyz-jul14-window",
        origin="YYC", destination="YYZ",
        date_from="2026-07-10", date_to="2026-07-18",
        preferred_carriers=["AC", "WS", "F8"],
        alert_threshold=180,
    ),
    CashMonitor(
        id="yyz-yyc-june-last-week",
        origin="YYZ", destination="YYC",
        date_from="2026-06-24", date_to="2026-06-30",
        preferred_carriers=["AC", "WS", "F8"],
        alert_threshold=180,
    ),
    CashMonitor(
        id="yyz-yyc-may8-window",
        origin="YYZ", destination="YYC",
        date_from="2026-05-03", date_to="2026-05-13",
        preferred_carriers=["AC", "WS", "F8"],
        alert_threshold=160,
    ),
    CashMonitor(
        # YYZ → YYC around June 10
        id="yyz-yyc-jun10",
        origin="YYZ", destination="YYC",
        date_from="2026-06-08", date_to="2026-06-12",
        preferred_carriers=["AC", "WS", "F8"],
        alert_threshold=180,
    ),
    CashMonitor(
        # YYC → YYZ around June 13
        id="yyc-yyz-jun13",
        origin="YYC", destination="YYZ",
        date_from="2026-06-11", date_to="2026-06-15",
        preferred_carriers=["AC", "WS", "F8"],
        alert_threshold=180,
    ),
]


# ─── Qatar Airways Award Monitors ────────────────────────────────────────────

AWARD_MONITORS: List[AwardMonitor] = [
    # ── Islamabad ──────────────────────────────────────────────────────────
    AwardMonitor(
        id="qatar-award-yyz-isb-jun2027",
        origin="YYZ", destination="ISB",
        destination_label="Islamabad, Pakistan",
        month="2027-06", cabin="business",
    ),
    AwardMonitor(
        id="qatar-award-yyz-isb-jul2027",
        origin="YYZ", destination="ISB",
        destination_label="Islamabad, Pakistan",
        month="2027-07", cabin="business",
    ),
    AwardMonitor(
        id="qatar-award-yyz-isb-dec2027",
        origin="YYZ", destination="ISB",
        destination_label="Islamabad, Pakistan",
        month="2027-12", cabin="business",
    ),
    # ── Istanbul IST ────────────────────────────────────────────────────────
    AwardMonitor(
        id="qatar-award-yyz-ist-jun2027",
        origin="YYZ", destination="IST",
        destination_label="Istanbul Airport (IST), Turkey",
        month="2027-06", cabin="business",
    ),
    AwardMonitor(
        id="qatar-award-yyz-ist-jul2027",
        origin="YYZ", destination="IST",
        destination_label="Istanbul Airport (IST), Turkey",
        month="2027-07", cabin="business",
    ),
    AwardMonitor(
        id="qatar-award-yyz-ist-dec2027",
        origin="YYZ", destination="IST",
        destination_label="Istanbul Airport (IST), Turkey",
        month="2027-12", cabin="business",
    ),
]

ALL_MONITORS: List[Monitor] = CASH_MONITORS + AWARD_MONITORS  # type: ignore
