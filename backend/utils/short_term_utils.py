# backend/backend/utils/short_term_utils.py

import numpy as np
from datetime import datetime, timedelta

def generate_short_term_forecast(city, base_value):
    """
    Generate realistic short-term AQI values from a 'base_value'.
    No ML, but a physically reasonable simulation.
    """

    base = float(base_value)

    # Seasonal small variation
    hour_factor = np.sin(np.linspace(0, np.pi, 24))
    day_factor = np.sin(np.linspace(0, 2*np.pi, 7))

    # Random noise (Gaussian)
    noise_weak = np.random.normal(0, 2, size=48)       # next 48 hours
    noise_mid  = np.random.normal(0, 4, size=14)       # 2 weeks
    noise_long = np.random.normal(0, 8, size=30)       # 1 month

    now = datetime.now()

    output = {
        "city": city,
        "generated_at": now.isoformat(),
        "forecasts": {}
    }

    # 1. Tomorrow (24 hours)
    hourly = base + hour_factor * 8 + noise_weak[:24]
    hourly = np.clip(hourly, 10, 500)
    output["forecasts"]["tomorrow"] = [
        {"date": (now + timedelta(hours=i)).isoformat(), "aqi": float(hourly[i])}
        for i in range(24)
    ]

    # 2. Next 3 days (72 hours)
    three_days = base + noise_mid[:3]
    three_days = np.clip(three_days, 10, 500)
    output["forecasts"]["next_3_days"] = [
        {"date": (now + timedelta(days=i)).date().isoformat(), "aqi": float(three_days[i])}
        for i in range(3)
    ]

    # 3. Next week (7 days)
    week_vals = base + day_factor * 10 + noise_mid[:7]
    week_vals = np.clip(week_vals, 10, 500)
    output["forecasts"]["next_week"] = [
        {"date": (now + timedelta(days=i)).date().isoformat(), "aqi": float(week_vals[i])}
        for i in range(7)
    ]

    # 4. Next 2 weeks (14 days)
    two_weeks = base + day_factor.repeat(2) * 12 + noise_long[:14]
    two_weeks = np.clip(two_weeks, 10, 500)
    output["forecasts"]["next_2_weeks"] = [
        {"date": (now + timedelta(days=i)).date().isoformat(), "aqi": float(two_weeks[i])}
        for i in range(14)
    ]

    # 5. Next 3 weeks (21 days)
    three_weeks = base + np.sin(np.linspace(0, 1.5*np.pi, 21)) * 12 + noise_long[:21]
    three_weeks = np.clip(three_weeks, 10, 500)
    output["forecasts"]["next_3_weeks"] = [
        {"date": (now + timedelta(days=i)).date().isoformat(), "aqi": float(three_weeks[i])}
        for i in range(21)
    ]

    return output
