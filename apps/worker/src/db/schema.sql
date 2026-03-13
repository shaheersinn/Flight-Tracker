-- apps/worker/src/db/schema.sql
-- Run this once to set up your PostgreSQL database

-- Monitors registry
CREATE TABLE IF NOT EXISTS monitors (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('cash', 'award')),
  config      JSONB NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Price/award quotes
CREATE TABLE IF NOT EXISTS quotes (
  id              SERIAL PRIMARY KEY,
  monitor_id      TEXT NOT NULL REFERENCES monitors(id),
  provider        TEXT NOT NULL,
  kind            TEXT NOT NULL,
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  departure_date  DATE,
  arrival_date    DATE,
  total_price     NUMERIC(10,2),
  currency        TEXT DEFAULT 'CAD',
  points_cost     INTEGER,
  cash_surcharge  NUMERIC(10,2),
  cabin           TEXT,
  airline         TEXT NOT NULL,
  flight_number   TEXT,
  stops           INTEGER NOT NULL DEFAULT 0,
  duration        TEXT,
  booking_url     TEXT,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fingerprint     TEXT NOT NULL,
  UNIQUE(monitor_id, fingerprint)
);

-- ML price predictions
CREATE TABLE IF NOT EXISTS predictions (
  id              SERIAL PRIMARY KEY,
  monitor_id      TEXT NOT NULL REFERENCES monitors(id),
  predicted_mean  NUMERIC(10,2),
  predicted_min   NUMERIC(10,2),
  predicted_max   NUMERIC(10,2),
  confidence      NUMERIC(4,3),
  forecast_days   INTEGER DEFAULT 7,
  generated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Alert history
CREATE TABLE IF NOT EXISTS alerts (
  id                  SERIAL PRIMARY KEY,
  monitor_id          TEXT NOT NULL REFERENCES monitors(id),
  alert_type          TEXT NOT NULL,
  message             TEXT NOT NULL,
  sent_at             TIMESTAMPTZ DEFAULT NOW(),
  telegram_message_id TEXT
);

-- Scraper run logs
CREATE TABLE IF NOT EXISTS runs (
  id                SERIAL PRIMARY KEY,
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  status            TEXT CHECK (status IN ('running','success','partial','failed')),
  monitors_checked  INTEGER DEFAULT 0,
  quotes_saved      INTEGER DEFAULT 0,
  alerts_sent       INTEGER DEFAULT 0,
  errors            JSONB
);

-- RapidAPI usage tracking (max 10/month)
CREATE TABLE IF NOT EXISTS rapid_api_calls (
  id          SERIAL PRIMARY KEY,
  called_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quotes_monitor_checked
  ON quotes(monitor_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_departure
  ON quotes(departure_date);
CREATE INDEX IF NOT EXISTS idx_quotes_monitor_price
  ON quotes(monitor_id, total_price ASC);
CREATE INDEX IF NOT EXISTS idx_alerts_monitor
  ON alerts(monitor_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_monitor
  ON predictions(monitor_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rapid_api_calls_month
  ON rapid_api_calls(called_at);

-- Yearly partitioning for quotes (optional, uncomment for long-term use)
-- ALTER TABLE quotes PARTITION BY RANGE (checked_at);
-- CREATE TABLE quotes_2026 PARTITION OF quotes
--   FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
-- CREATE TABLE quotes_2027 PARTITION OF quotes
--   FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
