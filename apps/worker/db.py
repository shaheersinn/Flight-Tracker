# apps/worker/db.py
import os
import base64
import hashlib
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from datetime import datetime, timezone

DATABASE_URL = os.environ.get("DATABASE_URL", "")


def get_conn():
    """Return a new psycopg2 connection. Caller must close it."""
    ssl = os.environ.get("DATABASE_SSL", "true").lower() != "false"
    kwargs = {"dsn": DATABASE_URL}
    if ssl:
        kwargs["sslmode"] = "require"
    return psycopg2.connect(**kwargs)


@contextmanager
def cursor():
    conn = get_conn()
    try:
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                yield cur
    finally:
        conn.close()


def build_fingerprint(result: dict) -> str:
    key = "|".join([
        result.get("monitor_id", ""),
        result.get("departure_date", ""),
        result.get("airline", ""),
        result.get("flight_number", ""),
        str(result.get("total_price") or result.get("points_cost") or 0),
        result.get("provider", ""),
    ])
    return base64.b64encode(key.encode()).decode()


def save_quote(monitor_id: str, result: dict) -> int | None:
    """Insert quote; return new row id or None if it was a duplicate."""
    fp = build_fingerprint({**result, "monitor_id": monitor_id})
    sql = """
        INSERT INTO quotes
            (monitor_id, provider, kind, origin, destination, departure_date,
             total_price, currency, points_cost, cash_surcharge, cabin,
             airline, flight_number, stops, duration, booking_url, fingerprint)
        VALUES
            (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (monitor_id, fingerprint) DO NOTHING
        RETURNING id
    """
    try:
        with cursor() as cur:
            cur.execute(sql, (
                monitor_id,
                result.get("provider"),
                result.get("kind", "cash"),
                result.get("origin"),
                result.get("destination"),
                result.get("departure_date"),
                result.get("total_price"),
                result.get("currency", "CAD"),
                result.get("points_cost"),
                result.get("cash_surcharge"),
                result.get("cabin"),
                result.get("airline"),
                result.get("flight_number"),
                result.get("stops", 0),
                result.get("duration", ""),
                result.get("booking_url", ""),
                fp,
            ))
            row = cur.fetchone()
            return row["id"] if row else None
    except Exception as e:
        print(f"[DB] save_quote error: {e}")
        return None


def get_previous_best(monitor_id: str, kind: str) -> dict | None:
    """Return the cheapest previously seen price for a monitor."""
    field = "total_price" if kind == "cash" else "points_cost"
    sql = f"""
        SELECT {field} as value FROM quotes
        WHERE monitor_id = %s AND {field} IS NOT NULL
          AND checked_at < NOW() - INTERVAL '1 hour'
        ORDER BY {field} ASC LIMIT 1
    """
    try:
        with cursor() as cur:
            cur.execute(sql, (monitor_id,))
            row = cur.fetchone()
            if not row:
                return None
            val = float(row["value"])
            return {"total_price": val} if kind == "cash" else {"points_cost": int(val)}
    except Exception:
        return None


def get_average_price(monitor_id: str) -> float | None:
    sql = """
        SELECT AVG(total_price) as avg FROM quotes
        WHERE monitor_id = %s
          AND total_price IS NOT NULL
          AND checked_at > NOW() - INTERVAL '14 days'
    """
    try:
        with cursor() as cur:
            cur.execute(sql, (monitor_id,))
            row = cur.fetchone()
            return float(row["avg"]) if row and row["avg"] else None
    except Exception:
        return None


def create_run() -> int:
    with cursor() as cur:
        cur.execute("INSERT INTO runs (status) VALUES ('running') RETURNING id")
        return cur.fetchone()["id"]


def finish_run(run_id: int, status: str, stats: dict):
    import json
    sql = """
        UPDATE runs
        SET status=%s, completed_at=NOW(),
            monitors_checked=%s, quotes_saved=%s,
            alerts_sent=%s, errors=%s
        WHERE id=%s
    """
    with cursor() as cur:
        cur.execute(sql, (
            status,
            stats.get("monitors_checked", 0),
            stats.get("quotes_saved", 0),
            stats.get("alerts_sent", 0),
            json.dumps(stats.get("errors", [])),
            run_id,
        ))


def get_rapidapi_usage(year_month: str) -> int:
    try:
        with cursor() as cur:
            cur.execute(
                "SELECT call_count FROM rapidapi_usage WHERE year_month = %s",
                (year_month,)
            )
            row = cur.fetchone()
            return int(row["call_count"]) if row else 0
    except Exception:
        return 0


def increment_rapidapi_usage(year_month: str):
    sql = """
        INSERT INTO rapidapi_usage (year_month, call_count)
        VALUES (%s, 1)
        ON CONFLICT (year_month)
        DO UPDATE SET call_count = rapidapi_usage.call_count + 1
    """
    with cursor() as cur:
        cur.execute(sql, (year_month,))
