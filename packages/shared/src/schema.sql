-- packages/shared/src/schema.sql
-- Run this once to set up your PostgreSQL database

CREATE TABLE IF NOT EXISTS monitors (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('cash', 'award')),
  config      JSONB NOT NULL,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotes (
  id              SERIAL PRIMARY KEY,
  monitor_id      TEXT NOT NULL REFERENCES monitors(id),
  provider        TEXT NOT NULL,
  kind            TEXT NOT NULL,
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  departure_date  DATE,
  total_price     NUMERIC(10, 2),
  currency        TEXT DEFAULT 'CAD',
  points_cost     INTEGER,
  cash_surcharge  NUMERIC(10, 2),
  cabin           TEXT,
  airline         TEXT,
  flight_number   TEXT,
  stops           INTEGER,
  duration        TEXT,
  booking_url     TEXT,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fingerprint     TEXT NOT NULL,
  UNIQUE(monitor_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS alerts (
  id                  SERIAL PRIMARY KEY,
  run_id              INTEGER,
  monitor_id          TEXT NOT NULL REFERENCES monitors(id),
  quote_id            INTEGER REFERENCES quotes(id),
  alert_type          TEXT NOT NULL,
  message             TEXT NOT NULL,
  sent_at             TIMESTAMPTZ DEFAULT NOW(),
  telegram_message_id TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id               SERIAL PRIMARY KEY,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  status           TEXT CHECK (status IN ('running', 'success', 'partial', 'failed')),
  monitors_checked INTEGER DEFAULT 0,
  quotes_saved     INTEGER DEFAULT 0,
  alerts_sent      INTEGER DEFAULT 0,
  errors           JSONB
);

-- Tracks RapidAPI monthly usage (limit: 10 calls/month)
CREATE TABLE IF NOT EXISTS rapidapi_usage (
  id         SERIAL PRIMARY KEY,
  year_month TEXT NOT NULL, -- YYYY-MM
  call_count INTEGER DEFAULT 0,
  UNIQUE(year_month)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_monitor_checked
  ON quotes(monitor_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_departure
  ON quotes(departure_date);

CREATE INDEX IF NOT EXISTS idx_alerts_monitor
  ON alerts(monitor_id, sent_at DESC);
