"""Tests for base scraper proxy rotation."""
import pytest

from backend.src.scrapers.base import ProxyRotator, random_user_agent


def test_proxy_rotator_no_proxies():
    rotator = ProxyRotator([])
    assert rotator.next_proxy() is None


def test_proxy_rotator_cycles():
    proxies = ["http://proxy1:8080", "http://proxy2:8080"]
    rotator = ProxyRotator(proxies)
    assert rotator.next_proxy() == "http://proxy1:8080"
    assert rotator.next_proxy() == "http://proxy2:8080"
    # Should cycle back
    assert rotator.next_proxy() == "http://proxy1:8080"


def test_random_user_agent_returns_string():
    ua = random_user_agent()
    assert isinstance(ua, str)
    assert len(ua) > 10
