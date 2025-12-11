# backend/backend/routes/hybrid_routes.py
import os
from flask import Blueprint, jsonify, request
import requests
from datetime import datetime

hybrid_bp = Blueprint("hybrid_bp", __name__)

# External ML server (ngrok/Cloudflare tunnel)
ML_SERVER_URL = os.environ.get(
    "ML_SERVER_URL",
    "https://extollingly-superfunctional-graciela.ngrok-free.dev"
)


def _normalize_hybrid_response(city: str, raw_json: dict, horizon_months: int):
    """
    Normalize any ML hybrid response into:
    {
      "city": "<City_Country>",
      "forecast": [ { "timestamp": "...", "aqi": float }, ... ]
    }
    """
    # ML server may already send "forecast" with date/predicted_aqi
    forecast_list = []

    if isinstance(raw_json, dict):
        if isinstance(raw_json.get("forecast"), list):
            forecast_list = raw_json["forecast"]
        elif isinstance(raw_json.get("data"), list):
            forecast_list = raw_json["data"]

    # Fallback: if server returned list directly
    if not forecast_list and isinstance(raw_json, list):
        forecast_list = raw_json

    normalized = []
    for item in forecast_list:
        if not isinstance(item, dict):
            continue
        # Prefer explicit date/timestamp-style fields
        ts = (
            item.get("timestamp")
            or item.get("date")
            or item.get("ds")
        )
        if not ts:
            # As last resort, skip
            continue

        # Normalize timestamp string (let frontend handle formatting)
        try:
            # If it's already ISO or YYYY-MM-DD, keep as-is
            _ = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))  # validation only
            timestamp = str(ts)
        except Exception:
            # Just cast to string
            timestamp = str(ts)

        # Normalize AQI value
        aqi_val = (
            item.get("aqi")
            or item.get("predicted_aqi")
            or item.get("yhat")
            or item.get("value")
        )
        try:
            aqi = float(aqi_val)
        except Exception:
            continue

        normalized.append({"timestamp": timestamp, "aqi": aqi})

    return {
        "city": city,
        "horizon_months": horizon_months,
        "forecast": normalized,
    }

# POST route must be defined BEFORE GET route with path parameter to ensure correct matching
@hybrid_bp.route("/hybrid_forecast", methods=["POST"])
def hybrid_forecast_post():
    """
    POST /api/hybrid_forecast
    Body: { "city": "<city name>", "horizon_months": 3 }
    Forwards request to external ML server.
    """
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON body"}), 400

    city = data.get("city")
    horizon_raw = data.get("horizon_months", 12)
    try:
        horizon = int(horizon_raw or 12)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid 'horizon_months'. Must be an integer."}), 400

    if not city:
        return jsonify({"error": "Missing 'city'"}), 400

    try:
        resp = requests.post(
            f"{ML_SERVER_URL}/hybrid",
            json={"city": city, "horizon_months": horizon},
            timeout=40,
        )
        try:
            raw = resp.json()
        except Exception:
            return jsonify({"error": "ML server returned non-JSON response"}), 502

        if resp.status_code != 200:
            msg = raw.get("error") or raw.get("detail") or f"ML server status {resp.status_code}"
            return jsonify({"error": msg}), 502

        normalized = _normalize_hybrid_response(city, raw, horizon)
        return jsonify(normalized), 200

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"ML server unavailable: {str(e)}"}), 502
    except Exception as e:
        return jsonify({"error": f"Failed to get hybrid forecast: {str(e)}"}), 500

@hybrid_bp.route("/hybrid_forecast/<path:city>", methods=["GET"])
def hybrid_forecast(city):
    """
    GET /api/hybrid_forecast/<city>?horizon=24
    city can include spaces (URL-encoded). horizon is months (int).
    Forwards request to external ML server.
    """
    # get horizon from querystring (default 24)
    horizon = request.args.get("horizon", default=24)
    try:
        horizon = int(horizon)
    except Exception:
        return jsonify({"error": "Invalid horizon. Must be integer months."}), 400

    try:
        resp = requests.post(
            f"{ML_SERVER_URL}/hybrid",
            json={"city": city, "horizon_months": horizon},
            timeout=40,
        )
        try:
            raw = resp.json()
        except Exception:
            return jsonify({"error": "ML server returned non-JSON response"}), 502

        if resp.status_code != 200:
            msg = raw.get("error") or raw.get("detail") or f"ML server status {resp.status_code}"
            return jsonify({"error": msg}), 502

        normalized = _normalize_hybrid_response(city, raw, horizon)
        return jsonify(normalized), 200

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"ML server unavailable: {str(e)}"}), 502
    except Exception as e:
        return jsonify({"error": f"Failed to get hybrid forecast: {str(e)}"}), 500