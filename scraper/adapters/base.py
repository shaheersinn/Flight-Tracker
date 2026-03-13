"""
scraper/adapters/base.py
Shared utilities for all scraper adapters.
"""

import asyncio
import random
import time
import logging
from typing import Optional
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

logger = logging.getLogger(__name__)

# ─── Proxy Config ─────────────────────────────────────────────────────────────

import os

def get_proxy_config() -> Optional[dict]:
    endpoint = os.getenv("PROXY_ENDPOINT")
    if not endpoint:
        return None
    return {
        "server": endpoint,
        "username": os.getenv("PROXY_USERNAME", ""),
        "password": os.getenv("PROXY_PASSWORD", ""),
    }


USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


def random_ua() -> str:
    return random.choice(USER_AGENTS)


async def human_delay(min_ms: int = 1500, max_ms: int = 3500) -> None:
    """Simulate human-like reading pauses."""
    await asyncio.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


async def retry_async(coro_fn, retries: int = 3, base_delay: float = 5.0):
    """Retry an async callable with exponential backoff."""
    last_err = None
    for attempt in range(retries):
        try:
            return await coro_fn()
        except Exception as e:
            last_err = e
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            logger.warning(f"Attempt {attempt+1}/{retries} failed: {e}. Retry in {delay:.1f}s")
            await asyncio.sleep(delay)
    raise last_err


async def make_stealth_context(browser: Browser) -> BrowserContext:
    """Create a browser context with anti-detection settings."""
    ctx = await browser.new_context(
        proxy=get_proxy_config(),  # type: ignore[arg-type]
        user_agent=random_ua(),
        viewport={"width": random.choice([1280, 1440, 1920]),
                  "height": random.choice([800, 900, 1080])},
        locale="en-CA",
        timezone_id="America/Toronto",
        extra_http_headers={"Accept-Language": "en-CA,en;q=0.9"},
    )
    # Override webdriver detection
    await ctx.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', {get: () => false});
        Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3]});
        window.chrome = {runtime: {}};
    """)
    return ctx


async def launch_browser():
    """Launch a Chromium browser with stealth options."""
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--disable-dev-shm-usage",
        ],
    )
    return playwright, browser
