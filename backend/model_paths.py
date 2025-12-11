# backend/backend/model_paths.py
import os

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
LOCAL_MODEL_ROOT = os.environ.get("MODEL_DIR", os.path.join(APP_ROOT, "models"))

# bucket name - used only for local defaults, loader uses GCS env
GCS_BUCKET = os.environ.get("GCS_BUCKET") or os.environ.get("BUCKET_NAME") or "vento_aureo_models"

PATH_OTHER_MODELS = os.path.join(LOCAL_MODEL_ROOT, "other_models")
PATH_PROPHET_MODELS = os.path.join(LOCAL_MODEL_ROOT, "prophet_models")
PATH_HYBRID_MODELS = os.path.join(LOCAL_MODEL_ROOT, "hybrid_models")
PATH_HYBRID_PROPHET = os.path.join(PATH_HYBRID_MODELS, "prophet_models")
PATH_HYBRID_LSTM = os.path.join(PATH_HYBRID_MODELS, "lstm_models")

# ensure MODEL_DIR env matches
os.environ.setdefault("MODEL_DIR", LOCAL_MODEL_ROOT)
