from flask import Blueprint, jsonify

ml_bp = Blueprint("ml_bp", __name__)

# Local model prediction disabled because ML now runs on external ML server
@ml_bp.route("/predict_aqi", methods=["POST"])
def predict_aqi_disabled():
    return jsonify({"error": "Local model prediction disabled. Use hybrid/prophet ML API."}), 410

@ml_bp.route("/predict_category", methods=["POST"])
def predict_category_disabled():
    return jsonify({"error": "Local model prediction disabled. Use hybrid/prophet ML API."}), 410
