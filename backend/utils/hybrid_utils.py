# backend/backend/utils/hybrid_utils.py
import os
import re
import unicodedata
import joblib
import numpy as np
import pandas as pd

from model_loader import load_joblib, load_keras

# Model prefixes in GCS
PROPHET_PREFIX = "hybrid_models/prophet_models"
LSTM_PREFIX = "hybrid_models/lstm_models"

def _normalize_name(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r'[^0-9a-z]+', '', s.lower())
    return s

def load_prophet_model_for_city(city: str):
    import difflib
    city_raw = city
    city = re.sub(r"[,._]+", " ", city.strip())
    city_tokens = city.split()
    drop_words = {
        "india","united","states","usa","england","uk","spain","france","germany",
        "italy","china","japan","korea","russia","canada","australia","brazil",
        "mexico","indonesia","turkey","argentina","south","africa","saudi",
        "arabia","emirates","uae"
    }
    city_tokens = [t for t in city_tokens if t.lower() not in drop_words]
    city_core = " ".join(city_tokens[:3])
    city_norm = _normalize_name(city_core)

    # Try loading candidate filenames from local model dir if available to perform matching
    local_dir = os.path.join(os.environ.get("MODEL_DIR", "/var/models"), "hybrid_models", "prophet_models")
    all_files = []
    if os.path.isdir(local_dir):
        all_files = [f for f in os.listdir(local_dir) if f.endswith(".joblib")]
    # If no local files present, we will attempt naive filename guesses:
    if not all_files:
        # attempt simple filename guess
        guessed = f"{city_core.replace(' ','_')}_prophet.joblib"
        try:
            model = load_joblib(guessed, PROPHET_PREFIX)
            return model, guessed
        except Exception:
            # fallback to top-level prophet_models
            try:
                model = load_joblib(guessed, "prophet_models")
                return model, guessed
            except Exception:
                pass
        raise FileNotFoundError(f"No local prophet index and guessed model not found for '{city_raw}'")

    # fuzzy match among local filenames
    candidates = []
    for fname in all_files:
        name_only = os.path.splitext(fname)[0]
        norm = _normalize_name(name_only)
        if city_norm in norm or norm in city_norm:
            candidates.append(fname)
        else:
            if any(tok in norm for tok in city_norm.split()):
                candidates.append(fname)

    if candidates:
        candidates.sort(key=lambda f: abs(len(_normalize_name(f)) - len(city_norm)))
        best_match = candidates[0]
        # try to load using loader (prefer hybrid prefix)
        try:
            model = load_joblib(best_match, PROPHET_PREFIX)
            return model, best_match
        except Exception:
            try:
                model = load_joblib(best_match, "prophet_models")
                return model, best_match
            except Exception as e:
                raise FileNotFoundError(f"Could not load prophet model {best_match}: {e}")

    norm_list = [_normalize_name(os.path.splitext(f)[0]) for f in all_files]
    closest = difflib.get_close_matches(city_norm, norm_list, n=1, cutoff=0.4)
    if closest:
        idx = norm_list.index(closest[0])
        best_match = all_files[idx]
        try:
            model = load_joblib(best_match, PROPHET_PREFIX)
            return model, best_match
        except Exception:
            model = load_joblib(best_match, "prophet_models")
            return model, best_match

    raise FileNotFoundError(f"No Prophet model found for '{city_raw}'")

def load_lstm_model_for_city(city: str):
    city_norm = _normalize_name(city)
    local_lstm_dir = os.path.join(os.environ.get("MODEL_DIR", "/var/models"), "hybrid_models", "lstm_models")
    lstm_candidates = []
    scaler_candidates = []
    if os.path.isdir(local_lstm_dir):
        for f in os.listdir(local_lstm_dir):
            if f.endswith(".keras") and city_norm in _normalize_name(f):
                lstm_candidates.append(f)
            if f.endswith("_scaler.joblib") and city_norm in _normalize_name(f):
                scaler_candidates.append(f)
    # If no local listing, attempt permissive guess
    if not lstm_candidates:
        # try a guessed file name
        guessed = f"{city.replace(' ','_')}.keras"
        try:
            lm = load_keras(guessed, LSTM_PREFIX)
            # scaler
            sc = None
            try:
                sc = load_joblib(f"{city.replace(' ','_')}_scaler.joblib", LSTM_PREFIX)
            except Exception:
                sc = None
            return lm, sc, guessed
        except Exception:
            return None, None, None

    lstm_fname = lstm_candidates[0]
    lstm_model = load_keras(lstm_fname, LSTM_PREFIX)

    scaler = None
    if scaler_candidates:
        try:
            scaler = load_joblib(scaler_candidates[0], LSTM_PREFIX)
        except Exception:
            scaler = None

    return lstm_model, scaler, lstm_fname

def generate_hybrid_forecast(city: str, horizon_months: int = 24):
    from datetime import datetime
    # --- Step 1: Load Prophet model ---
    try:
        prophet_model, prophet_fname = load_prophet_model_for_city(city)
    except FileNotFoundError as e:
        return {"error": str(e)}

    # --- Step 2: Load LSTM model (optional) ---
    try:
        lstm_model, scaler, lstm_fname = load_lstm_model_for_city(city)
    except FileNotFoundError:
        lstm_model, scaler, lstm_fname = None, None, None

    start_date = datetime.now()
    future_dates = pd.date_range(start=start_date, periods=horizon_months, freq="M")
    future = pd.DataFrame({"ds": future_dates})

    try:
        forecast_prophet = prophet_model.predict(future)
    except Exception as e:
        return {"error": f"Prophet forecast failed for {city}: {e}"}

    if forecast_prophet.empty or "yhat" not in forecast_prophet.columns:
        return {"error": f"Prophet model for {city} returned no predictions."}

    yhat_values = forecast_prophet["yhat"].values

    if lstm_model is None or scaler is None:
        forecast = [
            {"date": str(row["ds"].date()), "predicted_aqi": float(row["yhat"])}
            for _, row in forecast_prophet.iterrows()
        ]
        return {
            "city": city,
            "model_used": "Prophet only",
            "forecast_horizon_months": horizon_months,
            "forecast": forecast,
        }

    preds = []
    last_seq = np.random.random((3, 1))
    for _ in range(horizon_months):
        next_pred = lstm_model.predict(last_seq.reshape(1, 3, 1), verbose=0)
        preds.append(next_pred[0][0])
        last_seq = np.append(last_seq[1:], next_pred).reshape(3, 1)

    try:
        forecast_lstm = scaler.inverse_transform(np.array(preds).reshape(-1, 1)).flatten()
    except Exception:
        forecast_lstm = np.array(preds).flatten()

    hybrid_len = min(len(yhat_values), len(forecast_lstm))
    hybrid_forecast = 0.6 * yhat_values[-hybrid_len:] + 0.4 * forecast_lstm[-hybrid_len:]

    forecast = [
        {"date": str(forecast_prophet["ds"].iloc[i].date()), "predicted_aqi": float(hybrid_forecast[i])}
        for i in range(hybrid_len)
    ]

    return {
        "city": city,
        "model_used": "Prophet + LSTM Hybrid",
        "forecast_horizon_months": horizon_months,
        "prophet_model": prophet_fname,
        "lstm_model": lstm_fname,
        "forecast_count": len(forecast),
        "forecast": forecast,
    }
