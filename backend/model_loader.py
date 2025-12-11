# backend/backend/model_loader.py
import os
import io
from typing import Optional
from google.cloud import storage
import joblib

# Environment-driven config
GCS_BUCKET = os.environ.get("GCS_BUCKET") or os.environ.get("BUCKET_NAME") or "vento_aureo_models"
LOCAL_MODEL_ROOT = os.environ.get("MODEL_DIR", "/var/models")   # persistent disk if available
MODEL_CACHE_DIR = os.environ.get("MODEL_CACHE_DIR", "/tmp/model_cache")
os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

# lazy client (create when needed)
_storage_client = None

def _get_storage_client():
    global _storage_client
    if _storage_client is None:
        _storage_client = storage.Client()
    return _storage_client

def _cache_path(prefix: str, filename: str) -> str:
    safe = f"{prefix.replace('/', '__')}_{filename}"
    return os.path.join(MODEL_CACHE_DIR, safe)

def _local_path(prefix: str, filename: str) -> str:
    # Look inside MODEL_DIR folder structure first (fast local)
    p = os.path.join(LOCAL_MODEL_ROOT, prefix, filename) if prefix else os.path.join(LOCAL_MODEL_ROOT, filename)
    return p

def _download_from_gcs(prefix: str, filename: str) -> str:
    client = _get_storage_client()
    bucket = client.bucket(GCS_BUCKET)
    blob_name = f"{prefix.rstrip('/')}/{filename}" if prefix else filename
    blob_name = blob_name.lstrip("/")
    blob = bucket.blob(blob_name)
    if not blob.exists():
        raise FileNotFoundError(f"GCS object not found: gs://{GCS_BUCKET}/{blob_name}")
    dest = _cache_path(prefix, filename)
    # stream to file
    blob.download_to_filename(dest)
    return dest

def load_joblib(filename: str, prefix: str = ""):
    """
    Load a joblib model with the following priority:
      1) Local persistent path: MODEL_DIR/<prefix>/<filename>
      2) /tmp cache (downloaded)
      3) GCS bucket: <prefix>/<filename> (downloaded to cache)
    Raise FileNotFoundError if not available.
    """
    # 1. local persistent
    local = _local_path(prefix, filename)
    if os.path.exists(local):
        try:
            return joblib.load(local)
        except Exception as e:
            # fallthrough to cache/GCS
            print(f"[WARN] Failed to load locally ({local}): {e}")

    # 2. cached path
    cached = _cache_path(prefix, filename)
    if os.path.exists(cached):
        try:
            return joblib.load(cached)
        except Exception as e:
            print(f"[WARN] Cached joblib load failed ({cached}): {e}")
            # try remove corrupted cache then attempt re-download
            try:
                os.remove(cached)
            except:
                pass

    # 3. download from GCS
    if not prefix:
        prefix = ""
    try:
        downloaded = _download_from_gcs(prefix, filename)
        return joblib.load(downloaded)
    except Exception as e:
        raise FileNotFoundError(f"Could not load joblib model '{filename}' from local or GCS: {e}")

def _lazy_load_tf():
    # import in helper to avoid heavy import on startup if not needed
    from tensorflow import keras
    return keras

def load_keras(filename: str, prefix: str = ""):
    """
    Load a Keras model. Priority:
      1) Local persistent MODEL_DIR/<prefix>/<filename>
      2) /tmp cache
      3) GCS download to cache then keras.models.load_model
    """
    local = _local_path(prefix, filename)
    if os.path.exists(local):
        try:
            keras = _lazy_load_tf()
            return keras.models.load_model(local)
        except Exception as e:
            print(f"[WARN] Failed to load local keras model {local}: {e}")

    cached = _cache_path(prefix, filename)
    if os.path.exists(cached):
        try:
            keras = _lazy_load_tf()
            return keras.models.load_model(cached)
        except Exception as e:
            print(f"[WARN] Cached keras load failed ({cached}): {e}")
            try:
                os.remove(cached)
            except:
                pass

    # download from GCS
    try:
        downloaded = _download_from_gcs(prefix, filename)
        keras = _lazy_load_tf()
        return keras.models.load_model(downloaded)
    except Exception as e:
        raise FileNotFoundError(f"Could not load keras model '{filename}' from local or GCS: {e}")
