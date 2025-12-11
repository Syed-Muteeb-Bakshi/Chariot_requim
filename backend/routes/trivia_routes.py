# backend/routes/trivia_routes.py
from flask import Blueprint, jsonify, current_app
import json, os

trivia_bp = Blueprint("trivia", __name__)

@trivia_bp.route("/trivia")
def trivia():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    fallback = [
        "Did you know? Peace Lily can remove several common indoor pollutants.",
        "Indoor plants can improve mood and perceived air quality."
    ]
    trivia_file = os.path.join(base, "data", "trivia.json")  # put your JSON here if available
    try:
        if os.path.exists(trivia_file):
            with open(trivia_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
                # normalize: return array
                if isinstance(data, dict):
                    out = []
                    for v in data.values():
                        if isinstance(v, list):
                            out.extend(v)
                        elif isinstance(v, str):
                            out.append(v)
                elif isinstance(data, list):
                    out = data
                else:
                    out = fallback
                return jsonify(out)
    except Exception as e:
        current_app.logger.warning("Trivia load failed: %s", e)

    return jsonify(fallback)
