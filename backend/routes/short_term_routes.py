# backend/routes/short_term_routes.py
import os
from flask import Blueprint, jsonify, request, current_app
import requests
import math
from datetime import datetime, timedelta

short_term_bp = Blueprint("short_term_bp", __name__)

# External ML server (ngrok/Cloudflare tunnel)
ML_SERVER_URL = os.environ.get(
    "ML_SERVER_URL",
    "https://extollingly-superfunctional-graciela.ngrok-free.dev"
)

def downsample_monthly_to_days(monthly_forecast, horizon_days):
    """monthly_forecast: list of {date: 'YYYY-MM-DD', predicted_aqi: float}
       returns list of length horizon_days with daily estimates by repeating / linear interp.
    """
    if not monthly_forecast or horizon_days <= 0:
        return []
    # simple approach: repeat monthly value across that month's days proportionally
    # Build list of daily values by mapping each monthly value to approx 30 days each
    daily = []
    for mf in monthly_forecast:
        val = mf.get("predicted_aqi") if "predicted_aqi" in mf else (mf.get("hybrid_pred") or mf.get("prophet_pred") or 0)
        # clamp/convert
        try:
            v = float(val)
        except Exception:
            v = 0.0
        # assume 30 days per month for simplicity
        repeat_days = 30
        for _ in range(repeat_days):
            if len(daily) >= horizon_days:
                break
            daily.append(v)
        if len(daily) >= horizon_days:
            break
    # if still short, pad with last value
    while len(daily) < horizon_days:
        daily.append(daily[-1] if daily else 0.0)
    return daily[:horizon_days]

@short_term_bp.route("/short_term_forecast", methods=["POST"])
def short_term_forecast_post():
    """
    POST /api/short_term_forecast
    Body: { "city": "Mumbai", "hours": 48 } or { "device_id": "PORTABLE-01", "hours": 48 }
    Forwards request to external ML server. If external server replies that no short-term model
    is available, fallback to hybrid monthly forecast and convert to hourly predictions.
    """
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON body"}), 400

    city = data.get("city") or data.get("device_id") or ""
    hours_raw = data.get("hours", data.get("horizon_days", 48))
    try:
        hours = int(hours_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid 'hours' (or 'horizon_days'). Must be an integer."}), 400

    if not city:
        return jsonify({"error": "city (or device_id) required"}), 400

    # First try external short_term endpoint and normalize to unified format
    try:
        resp = requests.post(
            f"{ML_SERVER_URL}/short_term",
            json={"city": city, "hours": hours},
            timeout=40,
        )
        try:
            resp_data = resp.json()
        except Exception:
            resp_data = {}

        error_msg = str(resp_data.get("detail", "") or resp_data.get("error", "")).lower()
        if "no short-term model" in error_msg or "short_term error" in error_msg:
            raise RuntimeError("No short-term model available on ML server")

        if resp.status_code == 200:
            raw_series = []
            if isinstance(resp_data, dict):
                if isinstance(resp_data.get("forecast"), list):
                    raw_series = resp_data["forecast"]
                elif isinstance(resp_data.get("hourly"), list):
                    raw_series = resp_data["hourly"]
            elif isinstance(resp_data, list):
                raw_series = resp_data

            series = []
            now = datetime.utcnow()
            for idx, item in enumerate(raw_series):
                if not isinstance(item, dict):
                    continue
                hour_idx = item.get("hour_index", idx)
                aqi_val = item.get("aqi") or item.get("predicted_aqi") or item.get("value")
                try:
                    aqi = float(aqi_val)
                except Exception:
                    continue
                ts = now + timedelta(hours=int(hour_idx))
                series.append({"timestamp": ts.isoformat(), "aqi": aqi})

            return jsonify({"city": city, "forecast": series}), 200

    except RuntimeError:
        current_app.logger.info("Short-term model not available, using hybrid fallback")
    except requests.exceptions.RequestException as e:
        current_app.logger.info("External short_term request failed: %s -- falling back to hybrid", str(e))
    except Exception as e:
        current_app.logger.info("Unexpected short_term error: %s -- falling back to hybrid", str(e))

    # Fallback: Use hybrid forecast and convert to hourly predictions
    try:
        horizon_months = max(1, math.ceil(hours / (24 * 30)))  # Convert hours to months (approx)

        hybrid_resp = requests.post(
            f"{ML_SERVER_URL}/hybrid",
            json={"city": city, "horizon_months": horizon_months},
            timeout=40,
        )
        try:
            hybrid_data = hybrid_resp.json()
        except Exception:
            hybrid_data = {}

        if hybrid_resp.status_code != 200:
            msg = hybrid_data.get("error") or hybrid_data.get("detail") or f"Hybrid status {hybrid_resp.status_code}"
            raise Exception(msg)

        forecast_list = []
        if isinstance(hybrid_data, dict) and isinstance(hybrid_data.get("forecast"), list):
            forecast_list = hybrid_data["forecast"]
        elif isinstance(hybrid_data, list):
            forecast_list = hybrid_data

        if not forecast_list:
            raise Exception("Hybrid forecast returned empty data")

        series = []
        now = datetime.utcnow()
        days_needed = math.ceil(hours / 24)

        for day_data in forecast_list[:days_needed]:
            aqi_value = (
                day_data.get("aqi")
                or day_data.get("predicted_aqi")
                or day_data.get("yhat")
                or day_data.get("value")
                or 0
            )
            try:
                aqi_value = float(aqi_value)
            except Exception:
                aqi_value = 0.0

            hours_for_day = min(24, hours - len(series))
            for _ in range(hours_for_day):
                idx = len(series)
                ts = now + timedelta(hours=idx)
                series.append({"timestamp": ts.isoformat(), "aqi": aqi_value})

            if len(series) >= hours:
                break

        while len(series) < hours:
            last_aqi = series[-1]["aqi"] if series else 0.0
            ts = now + timedelta(hours=len(series))
            series.append({"timestamp": ts.isoformat(), "aqi": last_aqi})

        return jsonify({"city": city, "source": "fallback_hybrid", "forecast": series[:hours]}), 200

    except Exception as e:
        current_app.logger.exception("Short-term fallback failed")
        return jsonify({"error": f"Short-term forecast unavailable: {str(e)}"}), 500
