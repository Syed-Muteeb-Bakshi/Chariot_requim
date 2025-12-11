# backend/backend/routes/forecast_routes.py

# ============================================================================
# THIS FILE IS DISABLED — FORECAST ROUTES NOW USE EXTERNAL ML SERVER
# See hybrid_routes.py, prophet_routes.py, short_term_routes.py
# Old local model loading is removed.
# ============================================================================

# All functional code has been removed to prevent model_loader imports
# This file now only exports an inert blueprint for safety


# Create an inert blueprint that does nothing (for safety)
# No routes registered - blueprint is inert
# This prevents import errors if something tries to import forecast_bp
# THIS FILE IS DISABLED — old local ML forecast logic removed.
from flask import Blueprint, jsonify

forecast_bp = Blueprint("forecast_bp", __name__)

@forecast_bp.route("/forecast_disabled")
def disabled():
    return jsonify({"error": "Old forecast API disabled. Use /hybrid_forecast, /prophet_forecast or /short_term_forecast"}), 410
