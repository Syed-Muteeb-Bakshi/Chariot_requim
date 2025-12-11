# backend/backend/upload_models.py
import os
from flask import Blueprint, request, jsonify

upload_bp = Blueprint("upload_bp", __name__)
LOCAL_UPLOAD_DIR = os.environ.get("LOCAL_UPLOAD_DIR", "/tmp/local_models")
os.makedirs(LOCAL_UPLOAD_DIR, exist_ok=True)

@upload_bp.route("/api/upload_model", methods=["POST"])
def upload_model():
    """
    POST multipart/form-data with 'file' -> uploads to LOCAL_UPLOAD_DIR
    Use for large single model uploads when you don't have a persistent disk.
    """
    if "file" not in request.files:
        return jsonify({"error": "Missing file field 'file'"}), 400
    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    dest = os.path.join(LOCAL_UPLOAD_DIR, f.filename)
    f.save(dest)
    return jsonify({"message": "Uploaded", "path": dest}), 200
