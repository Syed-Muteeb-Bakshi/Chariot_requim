# backend/backend/model_fetcher.py
from model_loader import load_joblib, load_keras

def fetch_joblib(prefix: str, filename: str):
    return load_joblib(filename, prefix)

def fetch_keras(prefix: str, filename: str):
    return load_keras(filename, prefix)
