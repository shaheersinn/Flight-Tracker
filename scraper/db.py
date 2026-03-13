"""
scraper/db.py
PostgreSQL database helpers — connection pool, CRUD operations,
RapidAPI usage tracking, alert evaluation helpers.
"""

import os
import json
import base64
import hashlib
from typing import Optional, Any
from datetime import datetime

import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor

_pool: Optional[psycopg2.pool.ThreadedConnectionPool] = None

RAPIDAPI_MONTHLY_LIMIT = 10


def get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        dsn = os.environ["DATABASE_URL"]
        ssl_mode = "disable" if "localhost" in dsn or "127.0.0.1" in dsn else "require"
        _pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=5,
            dsn=dsn,
            sslmode=ssl_mode,
        )
    return _pool


def execute(sql: str, params: tuple = ()) -> list[dict]:
    """Execute a query and return all rows as dicts."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            conn.commit()
            try:
                return [dict(r) for r in cur.fetchall()]
            except psycopg2.ProgrammingError:
                return []
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def run_schema() -> None:
    """Create all tables. Safe to run multiple times (IF NOT EXISTS)."""
    schema = """
    CREATE TABLE IF NOT EXISTS monitors (
        id         TEXT PRIMARY KEY,
        kind       TEXT NOT NULL,
        config     JSONB NOT NULL,
        active     BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quotes (
        id             SERIAL PRIMARY KEY,
        monitor_id     TEXT NOT NULL REFERENCES monitors(id),
        provider       TEXT NOT NULL,
        kind           TEXT NOT NULL,
        origin         TEXT NOT NULL,
        destination    TEXT NOT NULL,
        departure_date DATE,
        total_price    NUMERIC(10,2),
        currency       TEXT DEFAULT 'CAD',
        points_cost    INTEGER,
        cash_surcharge NUMERIC(10,2),
        cabin          TEXT,
        airline        TEXT NOT NULL,
        flight_number  TEXT,
        stops          INTEGER NOT NULL DEFAULT 0,
        duration       TEXT,
        booking_url    TEXT,
        checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fingerprint    TEXT NOT NULL,
        UNIQUE (monitor_id, fingerprint)
    );

    CREATE TABLE IF NOT EXISTS predictions (
        id             SERIAL PRIMARY KEY,
        monitor_id     TEXT NOT NULL REFERENCES monitors(id),
        predicted_mean NUMERIC(10,2),
        predicted_min  NUMERIC(10,2),
        predicted_max  NUMERIC(10,2),
        confidence     NUMERIC(4,3),
        forecast_days  INTEGER DEFAULT 7,
        generated_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alerts (
        id                  SERIAL PRIMARY KEY,
        monitor_id          TEXT NOT NULL REFERENCES monitors(id),
        alert_type          TEXT NOT NULL,
        message             TEXT NOT NULL,
        sent_at             TIMESTAMPTZ DEFAULT NOW(),
        telegram_message_id TEXT
    );

    CREATE TABLE IF NOT EXISTS runs (
        id               SERIAL PRIMARY KEY,
        started_at       TIMESTAMPTZ DEFAULT NOW(),
        completed_at     TIMESTAMPTZ,
        status           TEXT,
        monitors_checked INTEGER DEFAULT 0,
        quotes_saved     INTEGER DEFAULT 0,
        alerts_sent      INTEGER DEFAULT 0,
        errors           JSONB
    );

    CREATE TABLE IF NOT EXISTS rapid_api_calls (
        id        SERIAL PRIMARY KEY,
        called_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_quotes_monitor_checked
        ON quotes(monitor_id, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotes_departure
        ON quotes(departure_date);
    CREATE INDEX IF NOT EXISTS idx_rapid_api_month
        ON rapid_api_calls(called_at);
    """
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(schema)
        conn.commit()
    finally:
        pool.putconn(conn)


def seed_monitors(monitors: list) -> None:
    """Upsert all monitor definitions into the monitors table."""
    from scraper.monitors import CashMonitor
    for m in monitors:
        cfg = {
            "id": m.id, "kind": m.kind,
            "origin": m.origin, "destination": m.destination,
        }
        if isinstance(m, CashMonitor):
            cfg.update({"date_from": m.date_from, "date_to": m.date_to,
                        "alert_threshold": m.alert_threshold})
        else:
            cfg.update({"month": m.month, "cabin": m.cabin,
                        "destination_label": m.destination_label})
        execute(
            """INSERT INTO monitors (id, kind, config)
               VALUES (%s, %s, %s)
               ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config""",
            (m.id, m.kind, json.dumps(cfg))
        )


def make_fingerprint(monitor_id: str, provider: str, departure_date: str,
                     airline: str, price: Any, stops: int) -> str:
    raw = f"{monitor_id}|{provider}|{departure_date}|{airline}|{price}|{stops}"
    return base64.b64encode(hashlib.sha256(raw.encode()).digest()).decode()[:48]


def save_quote(q: dict) -> None:
    execute(
        """INSERT INTO quotes (
               monitor_id, provider, kind, origin, destination,
               departure_date, total_price, currency, points_cost,
               cash_surcharge, cabin, airline, flight_number, stops,
               duration, booking_url, checked_at, fingerprint
           ) VALUES (
               %(monitor_id)s, %(provider)s, %(kind)s, %(origin)s, %(destination)s,
               %(departure_date)s, %(total_price)s, %(currency)s, %(points_cost)s,
               %(cash_surcharge)s, %(cabin)s, %(airline)s, %(flight_number)s, %(stops)s,
               %(duration)s, %(booking_url)s, %(checked_at)s, %(fingerprint)s
           ) ON CONFLICT (monitor_id, fingerprint) DO NOTHING""",
        (
            q["monitor_id"], q["provider"], q["kind"], q["origin"], q["destination"],
            q.get("departure_date"), q.get("total_price"), q.get("currency", "CAD"),
            q.get("points_cost"), q.get("cash_surcharge"), q.get("cabin"),
            q["airline"], q.get("flight_number"), q.get("stops", 0),
            q.get("duration"), q.get("booking_url"), q.get("checked_at", datetime.utcnow()),
            q["fingerprint"],
        )
    )


def get_historical_best(monitor_id: str) -> Optional[float]:
    rows = execute(
        "SELECT MIN(total_price) AS best FROM quotes WHERE monitor_id=%s AND total_price IS NOT NULL",
        (monitor_id,)
    )
    v = rows[0]["best"] if rows else None
    return float(v) if v is not None else None


def get_last_price(monitor_id: str) -> Optional[float]:
    rows = execute(
        "SELECT total_price FROM quotes WHERE monitor_id=%s ORDER BY checked_at DESC LIMIT 1",
        (monitor_id,)
    )
    v = rows[0]["total_price"] if rows else None
    return float(v) if v is not None else None


def save_alert(monitor_id: str, alert_type: str, message: str,
               telegram_msg_id: Optional[str] = None) -> None:
    execute(
        """INSERT INTO alerts (monitor_id, alert_type, message, telegram_message_id)
           VALUES (%s, %s, %s, %s)""",
        (monitor_id, alert_type, message, telegram_msg_id)
    )


def start_run() -> int:
    rows = execute(
        "INSERT INTO runs (started_at, status) VALUES (NOW(), 'running') RETURNING id",
        ()
    )
    return rows[0]["id"]


def finish_run(run_id: int, status: str, monitors_checked: int,
               quotes_saved: int, alerts_sent: int, errors: list[str]) -> None:
    execute(
        """UPDATE runs SET completed_at=NOW(), status=%s, monitors_checked=%s,
           quotes_saved=%s, alerts_sent=%s, errors=%s WHERE id=%s""",
        (status, monitors_checked, quotes_saved, alerts_sent,
         json.dumps(errors), run_id)
    )


# ─── RapidAPI Budget Tracking ─────────────────────────────────────────────────

def rapidapi_used_this_month() -> int:
    rows = execute(
        "SELECT COUNT(*) AS cnt FROM rapid_api_calls "
        "WHERE called_at >= date_trunc('month', NOW())",
        ()
    )
    return int(rows[0]["cnt"]) if rows else 0


def can_use_rapidapi() -> bool:
    return bool(os.getenv("RAPIDAPI_KEY")) and rapidapi_used_this_month() < RAPIDAPI_MONTHLY_LIMIT


def record_rapidapi_call() -> None:
    execute("INSERT INTO rapid_api_calls (called_at) VALUES (NOW())", ())
