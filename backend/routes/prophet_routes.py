# backend/backend/routes/prophet_routes.py
import os
from flask import Blueprint, jsonify, request
import requests
from datetime import datetime

prophet_bp = Blueprint("prophet_bp", __name__)

# External ML server (ngrok/Cloudflare tunnel)
ML_SERVER_URL = os.environ.get(
    "ML_SERVER_URL",
    "https://extollingly-superfunctional-graciela.ngrok-free.dev"
)


def _normalize_prophet_response(city: str, raw_json: dict, horizon_days: int):
    """
    Normalize any ML prophet response into:
    {
      "city": "<City_Country>",
      "forecast": [ { "timestamp": "...", "aqi": float }, ... ]
    }
    """
    series = []

    if isinstance(raw_json, dict):
        if isinstance(raw_json.get("forecast"), list):
            series = raw_json["forecast"]
        elif isinstance(raw_json.get("data"), list):
            series = raw_json["data"]
        elif isinstance(raw_json.get("history"), list):
            # In case ML server already uses history terminology
            series = raw_json["history"]

    if not series and isinstance(raw_json, list):
        series = raw_json

    out = []
    for item in series:
        if not isinstance(item, dict):
            continue
        ts = item.get("timestamp") or item.get("date") or item.get("ds")
        if not ts:
            continue
        try:
            _ = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            timestamp = str(ts)
        except Exception:
            timestamp = str(ts)

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

        out.append({"timestamp": timestamp, "aqi": aqi})

    return {
        "city": city,
        "horizon_days": horizon_days,
        "forecast": out,
    }

# POST route defined first to ensure proper registration
@prophet_bp.route("/prophet_forecast", methods=["POST"])
def prophet_forecast_post():
    """
    POST /api/prophet_forecast
    Body: { "city": "<city>", "horizon_days": 7 }
    Forwards request to external ML server.
    """
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON body"}), 400

    city = data.get("city")
    horizon_raw = data.get("horizon_days", 7)
    try:
        horizon = int(horizon_raw or 7)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid 'horizon_days'. Must be an integer."}), 400

    if not city:
        return jsonify({"error": "Missing 'city'"}), 400

    try:
        resp = requests.post(
            f"{ML_SERVER_URL}/prophet",
            json={"city": city, "horizon_days": horizon},
            timeout=40,
        )
        try:
            raw = resp.json()
        except Exception:
            return jsonify({"error": "ML server returned non-JSON response"}), 502

        if resp.status_code != 200:
            msg = raw.get("error") or raw.get("detail") or f"ML server status {resp.status_code}"
            return jsonify({"error": msg}), 502

        normalized = _normalize_prophet_response(city, raw, horizon)
        return jsonify(normalized), 200

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"ML server unavailable: {str(e)}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@prophet_bp.route("/get_forecast/<path:city>", methods=["GET"])
def get_forecast(city):
    """
    GET /api/get_forecast/<city>?periods=12
    Forwards request to external ML server.
    """
    try:
        # Convert periods (months) to horizon_days (approximate: periods * 30)
        periods = int(request.args.get("periods", 12))
        horizon_days = periods * 30  # Approximate conversion

        resp = requests.post(
            f"{ML_SERVER_URL}/prophet",
            json={"city": city, "horizon_days": horizon_days},
            timeout=40,
        )
        try:
            raw = resp.json()
        except Exception:
            return jsonify({"error": "ML server returned non-JSON response"}), 502

        if resp.status_code != 200:
            msg = raw.get("error") or raw.get("detail") or f"ML server status {resp.status_code}"
            return jsonify({"error": msg}), 502

        # Historic view should use "history"
        normalized = _normalize_prophet_response(city, raw, horizon_days)
        return jsonify(
            {
                "city": normalized["city"],
                "history": normalized["forecast"],
            }
        ), 200

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"ML server unavailable: {str(e)}"}), 502
    except Exception as e:
        return jsonify({"error": f"Failed to get prophet forecast: {str(e)}"}), 500