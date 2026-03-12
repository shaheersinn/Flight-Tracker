"""Tests for the notification service message composition."""
import pytest

from backend.src.services.flight_service import PriceDrop
from backend.src.services.notification import NotificationService, _esc


def test_esc_special_chars():
    # $ is not a Telegram MarkdownV2 special character — should be unchanged
    assert _esc("CA$100") == "CA$100"
    assert _esc("drop (5%)") == r"drop \(5%\)"


def test_compose_message_no_drops_no_awards():
    svc = NotificationService(bot_token="fake", chat_id="fake")
    msg = svc._compose_message([], [], [])
    assert "Flight Tracker Daily Digest" in msg
    assert "None today" in msg
    assert "No availability found" in msg


def test_compose_message_with_drop():
    svc = NotificationService(bot_token="fake", chat_id="fake")
    drops = [
        PriceDrop(
            origin="YYC",
            destination="YYZ",
            departure_date="2026-07-02",
            previous_price_cad=300.0,
            new_price_cad=200.0,
            drop_percent=33.3,
            airline="Air Canada",
            source="google_flights",
        )
    ]
    msg = svc._compose_message(drops, [], [])
    assert "YYC" in msg
    assert "YYZ" in msg
    assert "200" in msg
    assert "33" in msg


def test_compose_message_with_award():
    svc = NotificationService(bot_token="fake", chat_id="fake")
    awards = [
        {
            "origin": "YYZ",
            "destination": "ISB",
            "date": "2027-06-01",
            "cabin_class": "business",
            "miles_required": 75000,
            "available": True,
        }
    ]
    msg = svc._compose_message([], awards, [])
    assert "ISB" in msg
    assert "75" in msg  # part of "75,000"


def test_compose_message_with_errors():
    svc = NotificationService(bot_token="fake", chat_id="fake")
    msg = svc._compose_message([], [], ["Playwright timed out"])
    assert "Scraper Errors" in msg
    assert "Playwright" in msg
