# backend/backend/app.py

import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

# ==========================
# LOCAL DEV TOGGLE
# ==========================
# Use LOCAL_DEV=1 to disable Cloud SQL locally
IS_LOCAL = os.environ.get("LOCAL_DEV", "0") == "1"

# ==========================
# Cloud SQL Connector Setup
# ==========================
# Only import Cloud SQL dependencies when NOT in local dev mode
connector = None
PROJECT_ID = "just-smithy-479012-a1"
REGION = "us-east1"
INSTANCE = "vento-postgres"
INSTANCE_CONNECTION_NAME = f"{PROJECT_ID}:{REGION}:{INSTANCE}"

DB_USER = os.environ.get("DB_USER", "giorno_geovanna")
DB_PASS = os.environ.get("DB_PASS", "")
DB_NAME = os.environ.get("DB_NAME", "gold_experience")

if not IS_LOCAL:
    try:
        from google.cloud.sql.connector import Connector, IPTypes
        import pg8000.native
        
        connector = Connector(ip_type=IPTypes.PUBLIC)
        print("Cloud SQL Connector initialized (Cloud Run mode)")
    except Exception as e:
        print("ERROR: Failed to initialize Cloud SQL Connector:", e)
        connector = None
else:
    print("LOCAL_DEV=1 → Cloud SQL connector DISABLED")

def get_connection():
    """
    Provides a DB connection when running on Cloud Run.
    In local mode: raises an intentional error.
    """
    if IS_LOCAL:
        raise RuntimeError("Cloud SQL disabled in LOCAL_DEV mode")
    
    if connector is None:
        raise RuntimeError("Cloud SQL connector not initialized")
    
    return connector.connect(
        INSTANCE_CONNECTION_NAME,
        "pg8000",
        user=DB_USER,
        password=DB_PASS,
        db=DB_NAME
    )

# ==========================
# Flask App Setup
# ==========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

app = Flask(__name__, static_folder=FRONTEND_DIR, template_folder=TEMPLATES_DIR)
CORS(app)

CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=True,
    allow_headers=["Content-Type", "x-api-key"],
    methods=["GET", "POST", "OPTIONS"]
)

# ==========================
# BLUEPRINTS
# ==========================
# forecast_routes is DISABLED - obsolete, uses local ML models
# from routes.forecast_routes import forecast_bp
from routes.iot_routes import iot_bp
from routes.ml_routes import ml_bp
from routes.live_aqi_routes import live_aqi_bp
from routes.trivia_routes import trivia_bp
from routes.hybrid_routes import hybrid_bp
from routes.prophet_routes import prophet_bp
from routes.short_term_routes import short_term_bp
from routes.city_aqi_routes import city_bp
from routes.upload_routes import upload_bp
from routes.visual_report_routes import visual_bp

# forecast_routes blueprint registration DISABLED
# app.register_blueprint(forecast_bp, url_prefix="/api")
app.register_blueprint(iot_bp, url_prefix="/api")
app.register_blueprint(ml_bp, url_prefix="/api")
app.register_blueprint(live_aqi_bp, url_prefix="/api")
app.register_blueprint(hybrid_bp, url_prefix="/api")
app.register_blueprint(trivia_bp, url_prefix="/api")
app.register_blueprint(prophet_bp, url_prefix="/api")
app.register_blueprint(short_term_bp, url_prefix="/api")
app.register_blueprint(city_bp, url_prefix="/api")
app.register_blueprint(upload_bp, url_prefix="/api")
app.register_blueprint(visual_bp, url_prefix="/api")

# ==========================
# HEALTH CHECK
# ==========================
@app.route("/health")
def health():
    return jsonify({"status": "ok"})

# ==========================
# DASHBOARD FALLBACK
# ==========================
@app.route("/")
def serve_dashboard():
    dashboard_path = os.path.join(app.static_folder, "dashboard.html")

    if os.path.exists(dashboard_path):
        return send_from_directory(app.static_folder, "dashboard.html")

    return "<h3>Frontend deployed on Vercel. Backend active.</h3>"

# ==========================
# GLOBAL AQI ENDPOINT (unchanged)
# ==========================
@app.route("/api/global_aqi")
def global_aqi():
    import json, requests

    coords_file = os.path.join(BASE_DIR, "data", "city_coordinates.json")
    if not os.path.exists(coords_file):
        return jsonify({"error": "city_coordinates.json missing"}), 500

    with open(coords_file) as f:
        data = json.load(f)

    results = {}
    for city, info in list(data.items())[:300]:
        try:
            url = (
                "https://air-quality-api.open-meteo.com/v1/air-quality?"
                f"latitude={info['lat']}&longitude={info['lon']}&hourly=us_aqi,pm10,pm2_5"
            )
            j = requests.get(url, timeout=5).json()
            results[city] = {
                "aqi": j["hourly"]["us_aqi"][-1],
                "pm25": j["hourly"]["pm2_5"][-1],
                "pm10": j["hourly"]["pm10"][-1],
            }
        except:
            results[city] = {"aqi": None, "pm25": None, "pm10": None}

    return jsonify(results)

@app.route("/api/db_test")
def db_test():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT NOW();")
        row = cur.fetchone()
        cur.close()
        conn.close()
        return {"db_status": "connected", "now": str(row[0])}
    except Exception as e:
        return {"db_status": "error", "message": str(e)}, 500

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response

# ==========================
# DEBUG ROUTE
# ==========================
@app.route("/api/debug_routes")
def debug_routes():
    return jsonify([
        {"rule": str(r), "methods": list(r.methods)}
        for r in app.url_map.iter_rules()
    ])

# ==========================
# LOCAL DEV SERVER
# ==========================
if __name__ == "__main__":
    print("LOCAL_DEV =", IS_LOCAL)
    print("Starting development server...")
    app.run(debug=True, port=5000)
