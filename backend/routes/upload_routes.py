# backend/backend/routes/upload_routes.py
from flask import Blueprint, request, jsonify
import os

upload_bp = Blueprint("upload_bp", __name__)
UPLOAD_TMP = os.environ.get("UPLOAD_TMP", "/tmp/local_models")
os.makedirs(UPLOAD_TMP, exist_ok=True)

@upload_bp.route("/upload_model", methods=["POST"])
def upload_model():
    """
    POST file field 'file' to upload a single model into /tmp/local_models.
    This is intended as a temporary way to push large models to a running service.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "No selected file"}), 400
    dest = os.path.join(UPLOAD_TMP, f.filename)
    f.save(dest)
    return jsonify({"message": "Uploaded", "path": dest}), 200
