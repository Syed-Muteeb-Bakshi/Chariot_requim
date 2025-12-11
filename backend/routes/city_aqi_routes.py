# backend/backend/routes/city_aqi_routes.py
from flask import Blueprint, jsonify, current_app
import os
import json
import requests
import unicodedata
import re
from typing import Optional, Tuple


city_bp = Blueprint("city_aqi", __name__)

# External ML server (ngrok/Cloudflare tunnel)
ML_SERVER_URL = os.environ.get(
    "ML_SERVER_URL",
    "https://extollingly-superfunctional-graciela.ngrok-free.dev"
)

# helper normalizer
def _normalize(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r'[^0-9a-z]+', '', s.lower())
    return s

def _load_coords(base_dir: str) -> dict:
    """Load city coordinates from JSON file, with fallback to model filenames."""
    coords_file = os.path.join(base_dir, "data", "city_coordinates.json")
    coords = {}
    
    # Try to load from JSON file first
    if os.path.exists(coords_file):
        try:
            with open(coords_file, "r", encoding="utf-8") as f:
                coords = json.load(f)
        except Exception as e:
            # Log warning if current_app is available, otherwise just continue
            try:
                current_app.logger.warning(f"Failed to load city_coordinates.json: {e}")
            except:
                pass
            coords = {}

    # Fallback: derive city list from available prophet model filenames (if coords missing)
    if not coords:
        try:
            from model_paths import LOCAL_MODEL_ROOT
            cand_folders = [
                os.path.join(LOCAL_MODEL_ROOT, "hybrid_models", "prophet_models"),
                os.path.join(LOCAL_MODEL_ROOT, "prophet_models")
            ]
            coords = {}
            for folder in cand_folders:
                if not os.path.exists(folder):
                    continue
                try:
                    for f in os.listdir(folder):
                        if f.endswith("_prophet.joblib"):
                            city_name = f.replace("_prophet.joblib", "").replace("_", " ")
                            # no lat/lon available — leave lat/lon None so function will error later with helpful note
                            if city_name not in coords:
                                coords[city_name] = {"lat": None, "lon": None}
                except Exception:
                    continue
        except Exception:
            coords = {}
    
    return coords

def _find_city_entry(city: str, coords: dict) -> Optional[Tuple[str, dict]]:
    """Return (matched_key, info) or None"""
    if not coords:
        return None
    city_norm = _normalize(city)
    # 1) exact (case-insensitive) match keys
    for k in coords.keys():
        if k.lower() == city.lower():
            return k, coords[k]
    # 2) normalized substring match (best)
    candidates = []
    for k, info in coords.items():
        kn = _normalize(k)
        if city_norm in kn or kn in city_norm:
            candidates.append((k, kn))
    if candidates:
        # choose shortest difference (heuristic)
        candidates.sort(key=lambda x: abs(len(x[1]) - len(city_norm)))
        chosen = candidates[0][0]
        return chosen, coords[chosen]
    # 3) best common prefix length fallback
    scored = []
    for k in coords.keys():
        kn = _normalize(k)
        common = sum(1 for a, b in zip(kn, city_norm) if a == b)
        scored.append((common, k))
    scored.sort(reverse=True, key=lambda x: x[0])
    if scored and scored[0][0] > 0:
        best = scored[0][1]
        return best, coords[best]
    return None

@city_bp.route("/list_cities", methods=["GET"])
def list_cities():
    """
    GET /api/list_cities
    Proxies request to ML server to get list of available cities.
    City names are expected to be in the "{City}_{Country}" format already.
    """
    try:
        resp = requests.get(f"{ML_SERVER_URL}/list_cities", timeout=40)
        try:
            payload = resp.json()
        except Exception:
            return jsonify({"error": "ML server returned non-JSON response"}), 502

        if resp.status_code != 200:
            msg = None
            if isinstance(payload, dict):
                msg = payload.get("error") or payload.get("detail")
            return jsonify({"error": msg or f"ML server status {resp.status_code}"}), 502

        # ML server is considered the source of truth for city naming.
        # Preserve the format exactly as returned.
        if isinstance(payload, list):
            return jsonify(payload)
        if isinstance(payload, dict) and "cities" in payload and isinstance(payload["cities"], list):
            return jsonify(payload["cities"])
        if isinstance(payload, dict):
            # If dict of {city_name: ...}, return keys
            return jsonify(list(payload.keys()))
        return jsonify(payload), 200

    except requests.exceptions.RequestException as e:
        current_app.logger.error("Failed to fetch cities from ML server: %s", str(e))
        return jsonify({"error": f"ML server unavailable: {str(e)}"}), 502
    except Exception as e:
        current_app.logger.exception("Unexpected error in list_cities")
        return jsonify({"error": "Internal error"}), 500

@city_bp.route("/city_aqi/<city>", methods=["GET"])
def city_aqi(city):
    """
    Returns latest AQI for a single city by looking up coordinates from data/city_coordinates.json
    and querying Open-Meteo's air-quality API for that coordinate.
    """
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    coords = _load_coords(base_dir)
    if not coords:
        return jsonify({"error": "Coordinates file not available"}), 500

    match = _find_city_entry(city, coords)
    if not match:
        # include helpful hint: list few nearby candidates
        sample = list(coords.keys())[:8]
        return jsonify({
            "error": f"No coordinate entry found for '{city}'. Closest candidates: {sample}"
        }), 404

    matched_name, info = match
    lat = info.get("lat")
    lon = info.get("lon")
    if lat is None or lon is None:
        return jsonify({"error": f"No lat/lon for matched city '{matched_name}'"}), 500

    # query open-meteo
    try:
        url = f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&hourly=us_aqi,pm10,pm2_5"
        r = requests.get(url, timeout=8)
        r.raise_for_status()
        j = r.json()
        hourly = j.get("hourly", {})
        aqi_arr = hourly.get("us_aqi", [])
        pm25_arr = hourly.get("pm2_5", [])
        pm10_arr = hourly.get("pm10", [])

        latest = None
        latest_pm25 = None
        latest_pm10 = None
        # get last available numeric element if present
        if isinstance(aqi_arr, list) and len(aqi_arr) > 0:
            try:
                latest = aqi_arr[-1]
            except:
                latest = None
        if isinstance(pm25_arr, list) and len(pm25_arr) > 0:
            try:
                latest_pm25 = pm25_arr[-1]
            except:
                latest_pm25 = None
        if isinstance(pm10_arr, list) and len(pm10_arr) > 0:
            try:
                latest_pm10 = pm10_arr[-1]
            except:
                latest_pm10 = None

        return jsonify({
            "city_requested": city,
            "city_matched": matched_name,
            "lat": lat,
            "lon": lon,
            "latest_aqi": latest,
            "pollutants": {
                "pm2_5": latest_pm25,
                "pm10": latest_pm10
            },
            "source": "open-meteo"
        })
    except requests.exceptions.RequestException as rexc:
        current_app.logger.warning("Open-meteo request failed for %s (%s)", matched_name, rexc)
        return jsonify({"error": "Failed to fetch live AQI from provider"}), 502
    except Exception as exc:
        current_app.logger.exception("Unexpected error in city_aqi")
        return jsonify({"error": "Internal error"}), 500
