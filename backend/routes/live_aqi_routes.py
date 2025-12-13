from flask import Blueprint, jsonify, request
import requests

live_aqi_bp = Blueprint("live_aqi_bp", __name__)

# Predefined city coordinates
CITY_COORDS = {
    "delhi": (28.6139, 77.2090),
    "mumbai": (19.0760, 72.8777),
    "bangalore": (12.9716, 77.5946),
    "chennai": (13.0827, 80.2707),
    "hyderabad": (17.3850, 78.4867),
    "kolkata": (22.5726, 88.3639)
}

FALLBACK_LIVE = {
    "status": "success",
    "city": "Bangalore",
    "data_source": "fallback",
    "latest_aqi": 85,
    "pollutants": {
        "pm10": 90,
        "pm2_5": 60,
        "ozone": None,
        "nitrogen_dioxide": None,
        "sulphur_dioxide": None,
        "carbon_monoxide": None,
        "co2": 420,
        "voc": 0.5,
    }
}


# ===============================
# 1️⃣ Fetch AQI by City Name
# ===============================
@live_aqi_bp.route("/live_aqi/<city>", methods=["GET"])
def get_live_aqi(city):
    city_key = city.strip().lower()
    if city_key not in CITY_COORDS:
        return jsonify(FALLBACK_LIVE), 200

    lat, lon = CITY_COORDS[city_key]
    url = (
        f"https://air-quality-api.open-meteo.com/v1/air-quality?"
        f"latitude={lat}&longitude={lon}&hourly=pm10,pm2_5,"
        f"carbon_monoxide,ozone,nitrogen_dioxide,sulphur_dioxide,us_aqi"
    )

    try:
        res = requests.get(url, timeout=10)
        if res.status_code != 200:
            return jsonify({"error": "Failed to fetch from external API"}), 502

        data = res.json()
        hourly = data.get("hourly", {})
        if not hourly:
            return jsonify({"error": "No data available for this city"}), 404

        latest = {k: v[-1] if isinstance(v, list) and v else None for k, v in hourly.items()}
        latest["city"] = city.title()

        return jsonify({
            "status": "success",
            "city": city.title(),
            "data_source": "Open-Meteo Air Quality API",
            "latest_aqi": latest.get("us_aqi"),
            "pollutants": {
                "pm10": latest.get("pm10"),
                "pm2_5": latest.get("pm2_5"),
                "ozone": latest.get("ozone"),
                "nitrogen_dioxide": latest.get("nitrogen_dioxide"),
                "sulphur_dioxide": latest.get("sulphur_dioxide"),
                "carbon_monoxide": latest.get("carbon_monoxide"),
            }
        })

    except Exception as e:
        return jsonify(FALLBACK_LIVE), 200


# ===============================
# 2️⃣ Fetch AQI by Coordinates
# ===============================
@live_aqi_bp.route("/live_aqi_coords", methods=["GET"])
def get_live_aqi_by_coords():
    """Get live AQI data using latitude and longitude."""
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)

    if lat is None or lon is None:
        return jsonify(FALLBACK_LIVE), 200

    url = (
        f"https://air-quality-api.open-meteo.com/v1/air-quality?"
        f"latitude={lat}&longitude={lon}&hourly=pm10,pm2_5,"
        f"carbon_monoxide,ozone,nitrogen_dioxide,sulphur_dioxide,us_aqi"
    )

    try:
        res = requests.get(url, timeout=10)
        if res.status_code != 200:
            return jsonify({"error": "Failed to fetch from external API"}), 502

        data = res.json()
        hourly = data.get("hourly", {})
        if not hourly:
            return jsonify({"error": "No AQI data available"}), 404

        latest = {k: v[-1] if isinstance(v, list) and v else None for k, v in hourly.items()}
        latest["latitude"], latest["longitude"] = lat, lon

        return jsonify({
            "status": "success",
            "location": {"lat": lat, "lon": lon},
            "data_source": "Open-Meteo Air Quality API",
            "latest_aqi": latest.get("us_aqi"),
            "pollutants": {
                "pm10": latest.get("pm10"),
                "pm2_5": latest.get("pm2_5"),
                "ozone": latest.get("ozone"),
                "nitrogen_dioxide": latest.get("nitrogen_dioxide"),
                "sulphur_dioxide": latest.get("sulphur_dioxide"),
                "carbon_monoxide": latest.get("carbon_monoxide"),
                "sulphur_dioxide": latest.get("sulphur_dioxide"),
            }
        })

    except Exception:
        return jsonify(FALLBACK_LIVE), 200
