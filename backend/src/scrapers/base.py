"""Abstract base scraper with retry logic and proxy rotation."""
from __future__ import annotations

import abc
import itertools
import logging
import random
from typing import Any, Dict, Iterator, List, Optional

from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from backend.src.core.config import settings

logger = logging.getLogger(__name__)

# ── User-agent pool ───────────────────────────────────────────────────────────

_USER_AGENTS: List[str] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) "
    "Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.2 Safari/605.1.15",
]


def random_user_agent() -> str:
    """Return a random user-agent string."""
    return random.choice(_USER_AGENTS)


# ── Proxy rotation ────────────────────────────────────────────────────────────


class ProxyRotator:
    """Round-robin proxy rotator.  Returns ``None`` if no proxies are configured."""

    def __init__(self, proxy_list: Optional[List[str]] = None) -> None:
        self._proxies = proxy_list or settings.proxy_list
        self._cycle: Iterator[str] = (
            itertools.cycle(self._proxies) if self._proxies else iter([])
        )

    def next_proxy(self) -> Optional[str]:
        """Return the next proxy, or ``None`` if no proxies are available."""
        if not self._proxies:
            return None
        return next(self._cycle)


# ── Abstract base scraper ─────────────────────────────────────────────────────


class ScraperError(Exception):
    """Raised when a scraper fails after all retries are exhausted."""


class BaseScraper(abc.ABC):
    """Abstract scraper.

    Sub-classes must implement :meth:`_fetch` which performs the actual
    HTTP/browser interaction and returns a list of raw result dicts.

    The public :meth:`scrape` method wraps :meth:`_fetch` with retry logic
    powered by **tenacity** and automatic proxy rotation.
    """

    name: str = "base"

    def __init__(self) -> None:
        self._proxy_rotator = ProxyRotator()
        self._configure_retry()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def scrape(self, **kwargs: Any) -> List[Dict[str, Any]]:
        """Run the scraper with retry logic.

        Passes ``**kwargs`` straight through to :meth:`_fetch`.
        """
        return await self._fetch_with_retry(**kwargs)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _configure_retry(self) -> None:
        """Wrap :meth:`_fetch` with tenacity retry at instantiation time."""

        @retry(
            retry=retry_if_exception_type(Exception),
            stop=stop_after_attempt(settings.scraper_max_retries),
            wait=wait_exponential(
                multiplier=settings.scraper_retry_wait_seconds,
                min=settings.scraper_retry_wait_seconds,
                max=settings.scraper_retry_wait_seconds * 8,
            ),
            before_sleep=before_sleep_log(logger, logging.WARNING),
            reraise=True,
        )
        async def _wrapped(**kwargs: Any) -> List[Dict[str, Any]]:
            proxy = self._proxy_rotator.next_proxy()
            return await self._fetch(proxy=proxy, **kwargs)

        self._fetch_with_retry = _wrapped  # type: ignore[method-assign]

    @abc.abstractmethod
    async def _fetch(
        self,
        *,
        proxy: Optional[str] = None,
        **kwargs: Any,
    ) -> List[Dict[str, Any]]:
        """Perform the actual data retrieval.

        Parameters
        ----------
        proxy:
            Optional proxy URL to use for this request.
        **kwargs:
            Scraper-specific parameters (e.g. ``origin``, ``destination``,
            ``date``).

        Returns
        -------
        list of dict
            Raw result items; each dict is scraper-specific but should at
            minimum contain ``price``, ``airline``, ``date`` keys where
            applicable.
        """
