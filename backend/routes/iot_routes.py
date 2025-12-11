from flask import Blueprint, jsonify, request, current_app
from sqlalchemy import text
from datetime import datetime
import json
import os

from db import get_db_connection, execute_text

iot_bp = Blueprint("iot_bp", __name__)


@iot_bp.route("/upload_sensor", methods=["POST"])
def upload_sensor():
    # ---------------------------
    # Parse JSON safely
    # ---------------------------
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    if not payload:
        return jsonify({"error": "No payload provided"}), 400

    # Basic fields
    device_id = payload.get("device_id")
    city = payload.get("city", None)
    timestamp = payload.get("timestamp") or datetime.utcnow().isoformat()

    sensors = payload.get("sensors", {}) or {}
    meta = payload.get("meta", {}) or {}

    # Sensor fields
    pm25 = sensors.get("pm25")
    pm10 = sensors.get("pm10")
    co2 = sensors.get("co2")
    temperature = sensors.get("temperature")
    humidity = sensors.get("humidity")
    voc = sensors.get("voc_ppm") or sensors.get("voc")

    # GPS fields
    latitude = sensors.get("latitude") or sensors.get("lat")
    longitude = sensors.get("longitude") or sensors.get("lon")

    # ---------------------------
    # 1️⃣ INSERT INTO ingestion_logs
    # ---------------------------
    ingestion_id = None

    try:
        conn = get_db_connection()
        try:
            result = conn.execute(
                text("""
                    INSERT INTO ingestion_logs
                    (device_id, raw_payload, received_at, validated, validation_errors, stored_in_readings)
                    VALUES (:device_id, :raw_payload, NOW(), TRUE, NULL, FALSE)
                    RETURNING id;
                """),
                {
                    "device_id": device_id,
                    "raw_payload": json.dumps(payload)
                }
            )
            ingestion_id = result.scalar()
        finally:
            conn.close()

    except Exception as e:
        current_app.logger.exception("Failed to write ingestion log: %s", e)
        ingestion_id = None  # still insert readings

    # ---------------------------
    # 2️⃣ INSERT INTO sensor_readings (SQL FIXED)
    # ---------------------------
    try:
        conn = get_db_connection()
        try:
            insert_result = conn.execute(
                text("""
                    INSERT INTO sensor_readings (
                        device_id, device_type, city, timestamp,
                        pm25, pm10, co2,
                        temperature, humidity, voc_ppm,
                        latitude, longitude,
                        measurements, meta, created_at
                    )
                    VALUES (
                        :device_id, :device_type, :city, :timestamp,
                        :pm25, :pm10, :co2,
                        :temperature, :humidity, :voc_ppm,
                        :latitude, :longitude,
                        CAST(:measurements AS JSONB),
                        CAST(:meta AS JSONB),
                        NOW()
                    )
                    RETURNING id;
                """),
                {
                    "device_id": device_id,
                    "device_type": payload.get("device_type", "portable"),
                    "city": city,
                    "timestamp": timestamp,
                    "pm25": pm25,
                    "pm10": pm10,
                    "co2": co2,
                    "temperature": temperature,
                    "humidity": humidity,
                    "voc_ppm": voc,
                    "latitude": latitude,
                    "longitude": longitude,
                    "measurements": json.dumps(sensors),
                    "meta": json.dumps(meta),
                }
            )

            reading_id = insert_result.scalar()

        finally:
            conn.close()

        # ---------------------------
        # 3️⃣ Update ingestion_logs
        # ---------------------------
        if ingestion_id:
            try:
                execute_text(
                    """
                    UPDATE ingestion_logs
                    SET stored_in_readings = TRUE
                    WHERE id = :id
                    """,
                    {"id": ingestion_id}
                )
            except Exception as e:
                current_app.logger.warning(
                    "Failed to update ingestion_logs for id=%s: %s",
                    ingestion_id, e
                )

        # Success response
        return jsonify({
            "status": "ok",
            "reading_id": reading_id,
            "ingestion_id": ingestion_id
        }), 201

    except Exception as e:
        current_app.logger.exception("Failed to insert sensor reading: %s", e)
        return jsonify({
            "error": "Database insert failed",
            "details": str(e)
        }), 500
