"""Telegram notification service — sends a single condensed daily digest."""
from __future__ import annotations

import logging
from typing import List, Optional

import httpx

from backend.src.core.config import settings
from backend.src.services.flight_service import AwardSearchLeg, PriceDrop

logger = logging.getLogger(__name__)

_TELEGRAM_API_BASE = "https://api.telegram.org/bot{token}/sendMessage"


class NotificationService:
    """Sends a single condensed daily digest via Telegram.

    All price-drop alerts and award availability updates are batched into
    **one** Telegram message to avoid notification fatigue.
    """

    def __init__(
        self,
        bot_token: Optional[str] = None,
        chat_id: Optional[str] = None,
    ) -> None:
        self._token = bot_token or settings.telegram_bot_token
        self._chat_id = chat_id or settings.telegram_chat_id

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def send_daily_digest(
        self,
        price_drops: List[PriceDrop],
        award_results: List[dict],
        errors: Optional[List[str]] = None,
    ) -> bool:
        """Compose and send a single digest message.

        Parameters
        ----------
        price_drops:
            List of detected price drops from :func:`detect_price_drops`.
        award_results:
            List of raw award availability dicts returned by the Qatar scraper.
        errors:
            Optional list of error messages to include in the digest.

        Returns
        -------
        bool
            ``True`` if the message was sent successfully, ``False`` otherwise.
        """
        if not self._token or not self._chat_id:
            logger.warning(
                "Telegram credentials not configured — skipping notification."
            )
            return False

        message = self._compose_message(price_drops, award_results, errors)
        return await self._send(message)

    # ------------------------------------------------------------------
    # Message composition
    # ------------------------------------------------------------------

    def _compose_message(
        self,
        price_drops: List[PriceDrop],
        award_results: List[dict],
        errors: Optional[List[str]] = None,
    ) -> str:
        """Build the condensed digest message text (Markdown v2)."""
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines: List[str] = [
            "✈️ *Flight Tracker Daily Digest*",
            f"_{now}_",
            "",
        ]

        # ── Price drops ──────────────────────────────────────────────────────
        if price_drops:
            lines.append("💰 *Price Drops Detected*")
            for drop in price_drops:
                prev = (
                    f"~~CA\\${drop.previous_price_cad:.0f}~~"
                    if drop.previous_price_cad
                    else "N/A"
                )
                airline_str = f" \\({drop.airline}\\)" if drop.airline else ""
                lines.append(
                    f"  • {_esc(drop.origin)}→{_esc(drop.destination)} "
                    f"{_esc(drop.departure_date)}: "
                    f"{prev} → *CA\\${drop.new_price_cad:.0f}*"
                    f" \\(↓{drop.drop_percent:.1f}%\\){airline_str}"
                )
            lines.append("")
        else:
            lines.append("💰 *Price Drops:* None today\\.")
            lines.append("")

        # ── Award availability ────────────────────────────────────────────────
        available_awards = [a for a in award_results if a.get("available")]
        if available_awards:
            lines.append("🏆 *Qatar Award Availability*")
            for award in available_awards:
                miles_str = (
                    f"{award['miles_required']:,} miles"
                    if award.get("miles_required")
                    else "miles N/A"
                )
                lines.append(
                    f"  • {_esc(award['origin'])}→{_esc(award['destination'])} "
                    f"{_esc(award['date'])} "
                    f"\\({_esc(award.get('cabin_class','?').title())}\\): "
                    f"{_esc(miles_str)}"
                )
            lines.append("")
        else:
            lines.append("🏆 *Qatar Awards:* No availability found\\.")
            lines.append("")

        # ── Errors ───────────────────────────────────────────────────────────
        if errors:
            lines.append("⚠️ *Scraper Errors*")
            for err in errors:
                lines.append(f"  • {_esc(err)}")
            lines.append("")

        lines.append("_Next run: tomorrow at 09:00 UTC_")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Delivery
    # ------------------------------------------------------------------

    async def _send(self, text: str) -> bool:
        """Send the message to the configured Telegram chat."""
        url = _TELEGRAM_API_BASE.format(token=self._token)
        payload = {
            "chat_id": self._chat_id,
            "text": text,
            "parse_mode": "MarkdownV2",
            "disable_web_page_preview": True,
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    logger.info("Telegram daily digest sent successfully.")
                    return True
                else:
                    logger.error(
                        "Telegram API returned %s: %s",
                        response.status_code,
                        response.text,
                    )
                    return False
        except Exception as exc:
            logger.error("Failed to send Telegram message: %s", exc)
            return False


# ── Markdown escaping helper ──────────────────────────────────────────────────


def _esc(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    special = r"\_*[]()~`>#+-=|{}.!"
    for ch in special:
        text = text.replace(ch, f"\\{ch}")
    return text
