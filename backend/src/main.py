"""FastAPI application entry point with APScheduler daily cron job."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.core.config import settings
from backend.src.core.database import (
    AsyncSessionLocal,
    AwardFlight,
    Flight,
    PriceAlert,
    ScraperLog,
    ScraperStatus,
    create_tables,
    get_db,
)
from backend.src.scrapers.awards.qatar import QatarAwardScraper
from backend.src.scrapers.google_flights import GoogleFlightsScraper
from backend.src.scrapers.rapidapi import RapidAPIFlightScraper, quota_remaining
from backend.src.services.flight_service import (
    detect_price_drops,
    generate_award_search_legs,
    generate_regular_search_legs,
)
from backend.src.services.notification import NotificationService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Scheduler ─────────────────────────────────────────────────────────────────

scheduler = AsyncIOScheduler()


# ── Daily job ─────────────────────────────────────────────────────────────────


async def run_daily_job() -> None:
    """Main orchestration function executed by the scheduler each day."""
    logger.info("Daily flight-tracker job started at %s UTC", datetime.now(timezone.utc))

    all_current: List[Dict[str, Any]] = []
    award_results: List[Dict[str, Any]] = []
    errors: List[str] = []

    google_scraper = GoogleFlightsScraper()
    rapidapi_scraper = RapidAPIFlightScraper()
    qatar_scraper = QatarAwardScraper()
    notifier = NotificationService()

    async with AsyncSessionLocal() as session:
        # ── Regular flights ───────────────────────────────────────────────
        legs = generate_regular_search_legs()
        for leg in legs:
            # Try RapidAPI first (subject to quota), fall back to Google Flights
            results: List[Dict[str, Any]] = []

            try:
                if settings.rapidapi_key and quota_remaining() > 0:
                    results = await rapidapi_scraper.scrape(
                        origin=leg.origin,
                        destination=leg.destination,
                        date=leg.date,
                    )
            except Exception as exc:
                errors.append(f"RapidAPI {leg.origin}→{leg.destination} {leg.date}: {exc}")
                logger.warning("RapidAPI scrape failed for %s: %s", leg.label, exc)

            if not results:
                try:
                    results = await google_scraper.scrape(
                        origin=leg.origin,
                        destination=leg.destination,
                        date=leg.date,
                    )
                except Exception as exc:
                    errors.append(
                        f"Google Flights {leg.origin}→{leg.destination} {leg.date}: {exc}"
                    )
                    logger.warning(
                        "Google Flights scrape failed for %s: %s", leg.label, exc
                    )

            # Persist results to DB
            for r in results:
                flight = Flight(
                    origin=r["origin"],
                    destination=r["destination"],
                    departure_date=r["date"],
                    price_cad=r.get("price_cad"),
                    airline=r.get("airline"),
                    source=r["source"],
                    raw_json=r.get("raw"),
                )
                session.add(flight)

            all_current.extend(results)

        # ── Award flights ─────────────────────────────────────────────────
        award_legs = generate_award_search_legs()
        for leg in award_legs:
            try:
                leg_results = await qatar_scraper.scrape(
                    origin=leg.origin,
                    destination=leg.destination,
                    date=leg.date,
                    cabin_class=leg.cabin_class,
                )
                for r in leg_results:
                    award = AwardFlight(
                        origin=r.get("origin", leg.origin),
                        destination=r.get("destination", leg.destination),
                        departure_date=r.get("date", leg.date),
                        program=r.get("program", "QatarPrivilegeClub"),
                        cabin_class=r.get("cabin_class", leg.cabin_class),
                        miles_required=r.get("miles_required"),
                        taxes_cad=r.get("taxes_cad"),
                        available=r.get("available", False),
                        raw_json=r.get("raw"),
                    )
                    session.add(award)
                award_results.extend(leg_results)
            except Exception as exc:
                errors.append(
                    f"QatarAwards {leg.origin}→{leg.destination} {leg.date}: {exc}"
                )

        # ── Price-drop detection ──────────────────────────────────────────
        # Fetch previous prices from DB for comparison
        stmt = select(Flight).order_by(desc(Flight.scraped_at)).limit(5000)
        result_db = await session.execute(stmt)
        historical = [
            {
                "origin": f.origin,
                "destination": f.destination,
                "date": f.departure_date,
                "price_cad": f.price_cad,
                "airline": f.airline,
                "source": f.source,
            }
            for f in result_db.scalars().all()
        ]

        drops = detect_price_drops(all_current, historical)
        for drop in drops:
            alert = PriceAlert(
                origin=drop.origin,
                destination=drop.destination,
                departure_date=drop.departure_date,
                previous_price_cad=drop.previous_price_cad,
                new_price_cad=drop.new_price_cad,
                drop_percent=drop.drop_percent,
                notification_sent=False,
            )
            session.add(alert)

        await session.commit()

        # ── Send single Telegram digest ───────────────────────────────────
        sent = await notifier.send_daily_digest(drops, award_results, errors)
        if sent:
            # Mark alerts as notified
            for drop in drops:
                # Bulk update is fine here — small dataset
                stmt_update = (
                    select(PriceAlert)
                    .where(
                        PriceAlert.origin == drop.origin,
                        PriceAlert.destination == drop.destination,
                        PriceAlert.departure_date == drop.departure_date,
                        PriceAlert.notification_sent.is_(False),
                    )
                    .order_by(desc(PriceAlert.alerted_at))
                    .limit(1)
                )
                alert_result = await session.execute(stmt_update)
                alert_obj = alert_result.scalar_one_or_none()
                if alert_obj:
                    alert_obj.notification_sent = True
            await session.commit()

        # ── Write scraper log ─────────────────────────────────────────────
        log_entry = ScraperLog(
            scraper_name="daily_job",
            status=ScraperStatus.SUCCESS if not errors else ScraperStatus.FAILURE,
            records_found=len(all_current),
            error_message="; ".join(errors) if errors else None,
            finished_at=datetime.now(timezone.utc),
        )
        session.add(log_entry)
        await session.commit()

    logger.info("Daily job finished. %d results, %d drops.", len(all_current), len(drops))


# ── Application lifespan ──────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await create_tables()
    scheduler.add_job(
        run_daily_job,
        trigger=CronTrigger(
            hour=settings.scheduler_hour_utc,
            minute=settings.scheduler_minute_utc,
            timezone="UTC",
        ),
        id="daily_flight_check",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler started. Daily job at %02d:%02d UTC.",
        settings.scheduler_hour_utc,
        settings.scheduler_minute_utc,
    )
    yield
    scheduler.shutdown(wait=False)


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Flight Tracker API",
    description="Tracks flight prices and award availability.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── API routes ────────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/flights")
async def list_flights(
    origin: str | None = None,
    destination: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return the most recent flight prices, optionally filtered by route."""
    stmt = select(Flight).order_by(desc(Flight.scraped_at)).limit(limit)
    if origin:
        stmt = stmt.where(Flight.origin == origin.upper())
    if destination:
        stmt = stmt.where(Flight.destination == destination.upper())
    result = await db.execute(stmt)
    flights = result.scalars().all()
    return [
        {
            "id": f.id,
            "origin": f.origin,
            "destination": f.destination,
            "departure_date": f.departure_date,
            "price_cad": f.price_cad,
            "airline": f.airline,
            "source": f.source,
            "scraped_at": f.scraped_at.isoformat() if f.scraped_at else None,
        }
        for f in flights
    ]


@app.get("/api/awards")
async def list_awards(
    origin: str | None = None,
    destination: str | None = None,
    available_only: bool = False,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return award flight records."""
    stmt = select(AwardFlight).order_by(desc(AwardFlight.scraped_at)).limit(limit)
    if origin:
        stmt = stmt.where(AwardFlight.origin == origin.upper())
    if destination:
        stmt = stmt.where(AwardFlight.destination == destination.upper())
    if available_only:
        stmt = stmt.where(AwardFlight.available.is_(True))
    result = await db.execute(stmt)
    awards = result.scalars().all()
    return [
        {
            "id": a.id,
            "origin": a.origin,
            "destination": a.destination,
            "departure_date": a.departure_date,
            "program": a.program,
            "cabin_class": a.cabin_class,
            "miles_required": a.miles_required,
            "available": a.available,
            "scraped_at": a.scraped_at.isoformat() if a.scraped_at else None,
        }
        for a in awards
    ]


@app.get("/api/alerts")
async def list_alerts(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return recent price-drop alerts."""
    stmt = select(PriceAlert).order_by(desc(PriceAlert.alerted_at)).limit(limit)
    result = await db.execute(stmt)
    alerts = result.scalars().all()
    return [
        {
            "id": a.id,
            "origin": a.origin,
            "destination": a.destination,
            "departure_date": a.departure_date,
            "previous_price_cad": a.previous_price_cad,
            "new_price_cad": a.new_price_cad,
            "drop_percent": a.drop_percent,
            "alerted_at": a.alerted_at.isoformat() if a.alerted_at else None,
            "notification_sent": a.notification_sent,
        }
        for a in alerts
    ]


@app.get("/api/logs")
async def list_logs(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return recent scraper run logs."""
    stmt = select(ScraperLog).order_by(desc(ScraperLog.started_at)).limit(limit)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "scraper_name": l.scraper_name,
            "status": l.status,
            "records_found": l.records_found,
            "error_message": l.error_message,
            "started_at": l.started_at.isoformat() if l.started_at else None,
            "finished_at": l.finished_at.isoformat() if l.finished_at else None,
        }
        for l in logs
    ]


@app.post("/api/run-now", status_code=202)
async def trigger_job() -> Dict[str, str]:
    """Manually trigger the daily scraping job (for testing)."""
    import asyncio

    asyncio.create_task(run_daily_job())
    return {"message": "Job triggered. Check /api/logs for status."}
