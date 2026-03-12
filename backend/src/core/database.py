"""Async SQLAlchemy database models and session management."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import AsyncGenerator, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from backend.src.core.config import settings

# ── Engine & Session factory ──────────────────────────────────────────────────

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Base ──────────────────────────────────────────────────────────────────────


class Base(DeclarativeBase):
    pass


# ── Enums ─────────────────────────────────────────────────────────────────────


class ScraperStatus(str, enum.Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    SKIPPED = "skipped"


class TripType(str, enum.Enum):
    ECONOMY = "economy"
    BUSINESS = "business"
    FIRST = "first"
    AWARD = "award"


# ── Models ────────────────────────────────────────────────────────────────────


class Flight(Base):
    """Scraped regular flight price record."""

    __tablename__ = "flights"
    __table_args__ = (
        Index("ix_flights_route_date", "origin", "destination", "departure_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    return_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    airline: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    flight_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    price_cad: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cabin_class: Mapped[str] = mapped_column(
        Enum(TripType), default=TripType.ECONOMY, nullable=False
    )
    source: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "google_flights", "rapidapi"
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    raw_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<Flight {self.origin}->{self.destination} "
            f"{self.departure_date} ${self.price_cad}>"
        )


class AwardFlight(Base):
    """Scraped award flight availability record."""

    __tablename__ = "award_flights"
    __table_args__ = (
        Index("ix_award_flights_route_date", "origin", "destination", "departure_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[str] = mapped_column(String(10), nullable=False)
    program: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "QatarPrivilegeClub"
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. "business"
    miles_required: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    taxes_cad: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    available: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    raw_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<AwardFlight {self.origin}->{self.destination} "
            f"{self.departure_date} {self.program}>"
        )


class PriceAlert(Base):
    """Records of price-drop alerts that have been sent."""

    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    origin: Mapped[str] = mapped_column(String(3), nullable=False)
    destination: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_date: Mapped[str] = mapped_column(String(10), nullable=False)
    previous_price_cad: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    new_price_cad: Mapped[float] = mapped_column(Float, nullable=False)
    drop_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    alerted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    notification_sent: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<PriceAlert {self.origin}->{self.destination} "
            f"{self.departure_date} {self.previous_price_cad}->{self.new_price_cad}>"
        )


class ScraperLog(Base):
    """Audit log for each scraper run."""

    __tablename__ = "scraper_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    scraper_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(ScraperStatus), default=ScraperStatus.SUCCESS, nullable=False
    )
    records_found: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<ScraperLog {self.scraper_name} {self.status} "
            f"records={self.records_found}>"
        )


# ── Helper ────────────────────────────────────────────────────────────────────


async def create_tables() -> None:
    """Create all tables (used in development / startup)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
