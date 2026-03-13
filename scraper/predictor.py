"""
scraper/predictor.py
7-day price forecasting using linear regression.
Runs after the scraper, reads from DB, writes predictions back.
"""

import os
import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler

from scraper.db import execute, get_pool

logger = logging.getLogger(__name__)

MIN_POINTS = 7
FORECAST_DAYS = 7


def load_history() -> pd.DataFrame:
    rows = execute(
        """SELECT monitor_id, total_price, checked_at, departure_date
           FROM quotes
           WHERE kind='cash' AND total_price IS NOT NULL
           ORDER BY checked_at ASC"""
    )
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df["total_price"] = df["total_price"].astype(float)
    df["checked_at"] = pd.to_datetime(df["checked_at"], utc=True)
    df["departure_date"] = pd.to_datetime(df["departure_date"])
    return df


def predict_for_monitor(monitor_id: str, df: pd.DataFrame) -> dict | None:
    mdf = df[df["monitor_id"] == monitor_id].copy()
    if len(mdf) < MIN_POINTS:
        return None

    mdf = mdf.sort_values("checked_at")
    mdf["day_of_week"] = mdf["checked_at"].dt.dayofweek
    mdf["days_since_first"] = (mdf["checked_at"] - mdf["checked_at"].min()).dt.days
    mdf["days_until_dep"] = (mdf["departure_date"] - mdf["checked_at"]).dt.days.clip(lower=0)
    mdf["rolling_mean"] = mdf["total_price"].rolling(7, min_periods=3).mean().fillna(mdf["total_price"].mean())

    features = ["day_of_week", "days_since_first", "days_until_dep", "rolling_mean"]
    X = mdf[features].fillna(0).values
    y = mdf["total_price"].values

    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)
    model = LinearRegression().fit(X_s, y)

    last = mdf.iloc[-1]
    last_checked = mdf["checked_at"].max()
    last_dep = mdf["departure_date"].iloc[0]

    future_rows = []
    for i in range(1, FORECAST_DAYS + 1):
        fd = last_checked + timedelta(days=i)
        future_rows.append([
            fd.weekday(),
            last["days_since_first"] + i,
            max(0, (last_dep - fd).days),
            float(last["rolling_mean"]),
        ])
    future_X = scaler.transform(np.array(future_rows))
    preds = np.clip(model.predict(future_X), 50, 5000)

    cv = float(np.std(y) / (np.mean(y) + 1e-9))
    data_score = min(1.0, len(mdf) / 30)
    stability_score = max(0.0, 1.0 - cv)
    confidence = round((data_score + stability_score) / 2, 3)

    return {
        "monitor_id": monitor_id,
        "predicted_mean": round(float(np.mean(preds)), 2),
        "predicted_min": round(float(np.min(preds)), 2),
        "predicted_max": round(float(np.max(preds)), 2),
        "confidence": confidence,
    }


def save_predictions(predictions: list[dict]) -> None:
    for p in predictions:
        execute(
            """INSERT INTO predictions
               (monitor_id, predicted_mean, predicted_min, predicted_max,
                confidence, forecast_days, generated_at)
               VALUES (%s, %s, %s, %s, %s, %s, NOW())""",
            (p["monitor_id"], p["predicted_mean"], p["predicted_min"],
             p["predicted_max"], p["confidence"], FORECAST_DAYS)
        )


def run() -> None:
    logger.info("🤖 Running ML price predictor...")
    df = load_history()
    if df.empty:
        logger.info("No historical data yet — skipping predictions.")
        return

    monitor_ids = df["monitor_id"].unique()
    preds = []
    for mid in monitor_ids:
        result = predict_for_monitor(mid, df)
        if result:
            preds.append(result)
            logger.info(f"  ✓ {mid}: CAD {result['predicted_mean']:.2f} "
                        f"({result['confidence']*100:.0f}% confidence)")
        else:
            logger.info(f"  ⚠ {mid}: insufficient data")

    if preds:
        save_predictions(preds)
        logger.info(f"✅ Saved {len(preds)} predictions.")


if __name__ == "__main__":
    import dotenv
    dotenv.load_dotenv()
    logging.basicConfig(level=logging.INFO)
    run()
