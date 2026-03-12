"""Application configuration using Pydantic Settings."""
from __future__ import annotations

from typing import List, Optional

from pydantic import AnyUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@db:5432/flighttracker",
        description="Async SQLAlchemy database URL (must use asyncpg driver).",
    )

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "database_url must use the asyncpg driver "
                "(e.g. postgresql+asyncpg://user:pass@host/db)"
            )
        return v

    # ── RapidAPI ──────────────────────────────────────────────────────────────
    rapidapi_key: Optional[str] = Field(
        default=None,
        description="RapidAPI key for Google Flights API.",
    )
    rapidapi_host: str = Field(
        default="sky-scrapper.p.rapidapi.com",
        description="RapidAPI host header value.",
    )
    rapidapi_monthly_limit: int = Field(
        default=10,
        ge=1,
        description="Maximum RapidAPI calls allowed per calendar month.",
    )

    # ── Telegram ─────────────────────────────────────────────────────────────
    telegram_bot_token: Optional[str] = Field(
        default=None,
        description="Telegram Bot API token.",
    )
    telegram_chat_id: Optional[str] = Field(
        default=None,
        description="Telegram chat/channel ID to send notifications to.",
    )

    # ── Playwright / Scraper ──────────────────────────────────────────────────
    proxy_list: List[str] = Field(
        default_factory=list,
        description=(
            "Comma-separated list of HTTP proxies "
            "(e.g. http://user:pass@host:port)."
        ),
    )
    scraper_max_retries: int = Field(
        default=3,
        ge=1,
        description="Maximum retry attempts for each scraper request.",
    )
    scraper_retry_wait_seconds: float = Field(
        default=5.0,
        ge=0,
        description="Base wait time (seconds) between retry attempts.",
    )
    playwright_headless: bool = Field(
        default=True,
        description="Run Playwright in headless mode.",
    )

    # ── Scheduler ─────────────────────────────────────────────────────────────
    scheduler_hour_utc: int = Field(
        default=9,
        ge=0,
        le=23,
        description="UTC hour at which the daily job runs.",
    )
    scheduler_minute_utc: int = Field(
        default=0,
        ge=0,
        le=59,
        description="UTC minute at which the daily job runs.",
    )

    # ── Quota file ────────────────────────────────────────────────────────────
    rapidapi_usage_file: str = Field(
        default="/tmp/rapidapi_usage.json",
        description="Path to JSON file tracking RapidAPI monthly usage.",
    )


settings = Settings()
