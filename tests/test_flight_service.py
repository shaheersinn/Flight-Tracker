"""Tests for flight_service date generation and price-drop detection."""
import pytest

from backend.src.services.flight_service import (
    PriceDrop,
    detect_price_drops,
    generate_award_search_legs,
    generate_regular_search_legs,
)


# ── Regular search legs ───────────────────────────────────────────────────────


def test_generate_regular_legs_count():
    legs = generate_regular_search_legs(2026)
    # Verify we have a reasonable number of unique legs (no duplicates)
    assert len(legs) > 0
    keys = [(l.origin, l.destination, l.date) for l in legs]
    assert len(keys) == len(set(keys)), "Duplicate legs detected"


def test_july_2nd_window():
    legs = generate_regular_search_legs(2026)
    dates = {l.date for l in legs if l.origin == "YYC" and l.destination == "YYZ"}
    # July 2nd ± 4 days: Jun 28 – Jul 6
    assert "2026-06-28" in dates
    assert "2026-07-02" in dates
    assert "2026-07-06" in dates


def test_july_13_14_windows():
    legs = generate_regular_search_legs(2026)
    dates = {l.date for l in legs if l.origin == "YYC" and l.destination == "YYZ"}
    # July 13th ± 4 days
    assert "2026-07-09" in dates
    assert "2026-07-13" in dates
    assert "2026-07-17" in dates
    # July 14th ± 4 days
    assert "2026-07-10" in dates
    assert "2026-07-14" in dates
    assert "2026-07-18" in dates


def test_last_week_june_yyz_yyc():
    legs = generate_regular_search_legs(2026)
    dates = {l.date for l in legs if l.origin == "YYZ" and l.destination == "YYC"}
    assert "2026-06-24" in dates
    assert "2026-06-30" in dates


def test_may_8_window():
    legs = generate_regular_search_legs(2026)
    dates = {l.date for l in legs if l.origin == "YYZ" and l.destination == "YYC"}
    # May 8th ± 5 days
    assert "2026-05-03" in dates
    assert "2026-05-08" in dates
    assert "2026-05-13" in dates


def test_june_10_exact():
    legs = generate_regular_search_legs(2026)
    dates = {l.date for l in legs if l.origin == "YYZ" and l.destination == "YYC"}
    assert "2026-06-10" in dates


def test_june_13_exact_yyc_yyz():
    legs = generate_regular_search_legs(2026)
    dates = {l.date for l in legs if l.origin == "YYC" and l.destination == "YYZ"}
    assert "2026-06-13" in dates


# ── Award search legs ─────────────────────────────────────────────────────────


def test_generate_award_legs():
    legs = generate_award_search_legs()
    assert len(legs) > 0
    destinations = {l.destination for l in legs}
    assert "ISB" in destinations
    assert "IST" in destinations
    months = {l.date[:7] for l in legs}
    assert "2027-06" in months
    assert "2027-07" in months
    assert "2027-12" in months
    cabins = {l.cabin_class for l in legs}
    assert "economy" in cabins
    assert "business" in cabins


# ── Price-drop detection ──────────────────────────────────────────────────────


def test_detect_price_drop():
    current = [
        {"origin": "YYC", "destination": "YYZ", "date": "2026-07-02",
         "price_cad": 200.0, "airline": "Air Canada", "source": "google_flights"},
    ]
    historical = [
        {"origin": "YYC", "destination": "YYZ", "date": "2026-07-02",
         "price_cad": 300.0, "airline": "Air Canada", "source": "google_flights"},
    ]
    drops = detect_price_drops(current, historical)
    assert len(drops) == 1
    assert drops[0].new_price_cad == 200.0
    assert drops[0].previous_price_cad == 300.0
    assert drops[0].drop_percent == pytest.approx(33.3, abs=0.1)


def test_no_drop_when_price_increases():
    current = [
        {"origin": "YYC", "destination": "YYZ", "date": "2026-07-02",
         "price_cad": 350.0, "airline": None, "source": "rapidapi"},
    ]
    historical = [
        {"origin": "YYC", "destination": "YYZ", "date": "2026-07-02",
         "price_cad": 300.0, "airline": None, "source": "rapidapi"},
    ]
    drops = detect_price_drops(current, historical)
    assert drops == []


def test_no_drop_below_threshold():
    current = [
        {"origin": "YYZ", "destination": "YYC", "date": "2026-06-10",
         "price_cad": 295.0, "airline": "WestJet", "source": "google_flights"},
    ]
    historical = [
        {"origin": "YYZ", "destination": "YYC", "date": "2026-06-10",
         "price_cad": 300.0, "airline": "WestJet", "source": "google_flights"},
    ]
    # 1.67% drop — below the default 5% threshold
    drops = detect_price_drops(current, historical)
    assert drops == []


def test_no_alert_for_first_seen():
    """No drop should be reported when there is no historical data."""
    current = [
        {"origin": "YYC", "destination": "YYZ", "date": "2026-07-02",
         "price_cad": 200.0, "airline": None, "source": "rapidapi"},
    ]
    drops = detect_price_drops(current, [])
    assert drops == []


def test_null_price_skipped():
    current = [
        {"origin": "YYC", "destination": "YYZ", "date": "2026-07-02",
         "price_cad": None, "airline": None, "source": "google_flights"},
    ]
    historical = [
        {"origin": "YYC", "destination": "YYZ", "date": "2026-07-02",
         "price_cad": 300.0, "airline": None, "source": "google_flights"},
    ]
    drops = detect_price_drops(current, historical)
    assert drops == []
