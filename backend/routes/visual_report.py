from flask import Blueprint, jsonify
import os, json
import pandas as pd
from datetime import datetime

visual_bp = Blueprint("visual_bp", __name__)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
LOG_PATH = os.path.join(BASE_DIR, "sensor_logs", "sensor_data.json")

@visual_bp.route("/visual_report", methods=["GET"])
def get_visual_report():
    if not os.path.exists(LOG_PATH):
        return jsonify({"error": "No sensor data available"}), 404

    with open(LOG_PATH, "r") as f:
        logs = json.load(f)

    df = pd.DataFrame(logs)
    if df.empty:
        return jsonify({"message": "No data to visualize"}), 200

    df["city"] = df["city"].fillna("Unknown")

    summary = df.groupby("city").mean(numeric_only=True).reset_index()

    pollutants = {col: summary[col].tolist() for col in summary.columns if col not in ["city"]}

    return jsonify({
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "entries_count": len(df),
        "data": {
            "cities": summary["city"].tolist(),
            "pollutants": pollutants
        }
    })
