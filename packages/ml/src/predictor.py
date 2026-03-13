#!/usr/bin/env python3
"""
packages/ml/src/predictor.py
Flight price predictor using scikit-learn linear regression.
Reads from PostgreSQL, writes predictions back, then exits.
"""

import os
import sys
import json
from datetime import datetime, timedelta

import pandas as pd
import numpy as np
import psycopg2
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error

DATABASE_URL = os.environ.get("DATABASE_URL", "")
FORECAST_DAYS = 7
MIN_DATA_POINTS = 7  # Need at least 7 quotes to make a prediction


def get_connection():
    return psycopg2.connect(DATABASE_URL, sslmode="require" if "localhost" not in DATABASE_URL else "disable")


def load_historical_data(conn) -> pd.DataFrame:
    """Load all historical quotes from the DB."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT monitor_id, total_price, checked_at, departure_date
            FROM quotes
            WHERE kind = 'cash'
              AND total_price IS NOT NULL
            ORDER BY checked_at ASC
        """)
        rows = cur.fetchall()

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=["monitor_id", "total_price", "checked_at", "departure_date"])
    df["total_price"] = df["total_price"].astype(float)
    df["checked_at"] = pd.to_datetime(df["checked_at"], utc=True)
    df["departure_date"] = pd.to_datetime(df["departure_date"])
    return df


def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["day_of_week"] = df["checked_at"].dt.dayofweek
    df["days_until_departure"] = (df["departure_date"] - df["checked_at"]).dt.days.clip(lower=0)
    df["days_since_first"] = (df["checked_at"] - df["checked_at"].min()).dt.days

    df["price_7d_mean"] = (
        df.groupby("monitor_id")["total_price"]
        .transform(lambda x: x.rolling(7, min_periods=3).mean())
    )
    df["price_7d_std"] = (
        df.groupby("monitor_id")["total_price"]
        .transform(lambda x: x.rolling(7, min_periods=3).std().fillna(0))
    )
    return df


def detect_anomalies(df: pd.DataFrame, threshold: float = 2.5) -> pd.Series:
    """Z-score anomaly detection: returns True for unusually cheap prices."""
    grouped = df.groupby("monitor_id")["total_price"]
    z_scores = grouped.transform(lambda x: (x - x.mean()) / (x.std() + 1e-9))
    return z_scores < -threshold


def predict_for_monitor(monitor_id: str, df: pd.DataFrame) -> dict:
    """Train and predict for a single monitor."""
    monitor_df = df[df["monitor_id"] == monitor_id].copy()

    if len(monitor_df) < MIN_DATA_POINTS:
        return {
            "monitor_id": monitor_id,
            "error": f"Insufficient data ({len(monitor_df)} points, need {MIN_DATA_POINTS})",
            "confidence": 0.0,
        }

    features = prepare_features(monitor_df)
    feature_cols = ["day_of_week", "days_until_departure", "days_since_first", "price_7d_mean"]
    X = features[feature_cols].fillna(method="ffill").fillna(0)
    y = features["total_price"]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = LinearRegression()
    model.fit(X_scaled, y)

    # Generate future feature rows
    last_row = features.iloc[-1]
    last_checked = monitor_df["checked_at"].max()
    last_dep = monitor_df["departure_date"].iloc[0]
    last_mean = last_row.get("price_7d_mean", y.mean())

    future_rows = []
    for i in range(1, FORECAST_DAYS + 1):
        future_date = last_checked + timedelta(days=i)
        days_left = max(0, (last_dep - future_date).days)
        future_rows.append({
            "day_of_week": future_date.weekday(),
            "days_until_departure": days_left,
            "days_since_first": last_row["days_since_first"] + i,
            "price_7d_mean": last_mean,
        })

    future_X = pd.DataFrame(future_rows)
    future_X_scaled = scaler.transform(future_X)
    predictions = model.predict(future_X_scaled)
    predictions = np.clip(predictions, 50, 5000)  # Sanity bounds

    # Confidence score
    n = len(monitor_df)
    cv = y.std() / (y.mean() + 1e-9)  # Coefficient of variation
    data_score = min(1.0, n / 30)
    stability_score = max(0.0, 1.0 - cv)
    confidence = round((data_score + stability_score) / 2, 3)

    return {
        "monitor_id": monitor_id,
        "predicted_mean": float(np.mean(predictions)),
        "predicted_min": float(np.min(predictions)),
        "predicted_max": float(np.max(predictions)),
        "confidence": confidence,
        "forecast_days": FORECAST_DAYS,
        "predictions": predictions.tolist(),
    }


def save_predictions(conn, predictions: list[dict]) -> None:
    with conn.cursor() as cur:
        for pred in predictions:
            if "error" in pred:
                continue
            cur.execute("""
                INSERT INTO predictions
                  (monitor_id, predicted_mean, predicted_min, predicted_max, confidence, forecast_days, generated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
            """, (
                pred["monitor_id"],
                round(pred["predicted_mean"], 2),
                round(pred["predicted_min"], 2),
                round(pred["predicted_max"], 2),
                pred["confidence"],
                pred["forecast_days"],
            ))
    conn.commit()


def main():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    print("🤖 Running ML price predictor...")
    conn = get_connection()

    try:
        df = load_historical_data(conn)
        if df.empty:
            print("No historical data available yet. Skipping predictions.")
            return

        monitor_ids = df["monitor_id"].unique()
        print(f"Found data for {len(monitor_ids)} monitors, {len(df)} total quotes.")

        all_predictions = []
        for mid in monitor_ids:
            result = predict_for_monitor(mid, df)
            all_predictions.append(result)
            if "error" in result:
                print(f"  ⚠ {mid}: {result['error']}")
            else:
                print(
                    f"  ✓ {mid}: predicted mean CAD {result['predicted_mean']:.2f} "
                    f"(confidence {result['confidence']*100:.0f}%)"
                )

        save_predictions(conn, all_predictions)
        success = sum(1 for p in all_predictions if "error" not in p)
        print(f"\n✅ Saved {success}/{len(all_predictions)} predictions.")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
