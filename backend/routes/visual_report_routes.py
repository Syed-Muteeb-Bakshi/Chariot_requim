# backend/backend/routes/visual_report_routes.py

from flask import Blueprint, request, jsonify
from sqlalchemy import text
from datetime import datetime, timedelta
from db import get_db_connection

visual_bp = Blueprint("visual_bp", __name__)


@visual_bp.route("/visual_report", methods=["GET"])
def visual_report():
    """
    Return latest reading + small chart history for a given device_id.
    Pulls data from sensor_readings table (Cloud SQL).
    """
    device_id = request.args.get("device_id")
    if not device_id:
        return jsonify({"error": "device_id is required"}), 400

    try:
        conn = get_db_connection()

        # 1️⃣ LATEST READING
        latest_query = text("""
            SELECT
                id, device_id, device_type, city, timestamp,
                pm25, pm10, co2,
                temperature, humidity, voc_ppm,
                latitude, longitude,
                measurements, meta
            FROM sensor_readings
            WHERE device_id = :device_id
            ORDER BY timestamp DESC
            LIMIT 1;
        """)
        latest_row = conn.execute(latest_query, {"device_id": device_id}).mappings().first()

        if not latest_row:
            return jsonify({
                "device_id": device_id,
                "status": "no_data",
                "latest": None,
                "chart": []
            }), 200

        # 2️⃣ CHART HISTORY (last 50 rows)
        chart_query = text("""
            SELECT
                timestamp,
                pm25, pm10, co2,
                temperature, humidity, voc_ppm
            FROM sensor_readings
            WHERE device_id = :device_id
            ORDER BY timestamp DESC
            LIMIT 50;
        """)
        chart_rows = conn.execute(chart_query, {"device_id": device_id}).mappings().all()

        conn.close()

        # Build chart data
        chart_data = []
        for r in reversed(chart_rows):
            chart_data.append({
                "timestamp": r["timestamp"].isoformat(),
                "pm25": r["pm25"],
                "pm10": r["pm10"],
                "co2": r["co2"],
                "temperature": r["temperature"],
                "humidity": r["humidity"],
                "voc_ppm": r["voc_ppm"]
            })

        # latest reading formatted
        latest = {
            "id": latest_row["id"],
            "timestamp": latest_row["timestamp"].isoformat(),
            "device_id": latest_row["device_id"],
            "device_type": latest_row["device_type"],
            "city": latest_row["city"],
            "temperature": latest_row["temperature"],
            "humidity": latest_row["humidity"],
            "pressure": latest_row["measurements"].get("pressure"),
            "pm25": latest_row["pm25"],
            "pm10": latest_row["pm10"],
            "voc_ppm": latest_row["voc_ppm"],
            "co2": latest_row["co2"],
            "latitude": latest_row["latitude"],
            "longitude": latest_row["longitude"],
            "raw": latest_row["measurements"],
        }

        return jsonify({
            "status": "ok",
            "device_id": device_id,
            "latest": latest,
            "chart": chart_data
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
