# backend/backend/utils/generate_city_coordinates.py
import os
import json
import time
import requests
import re

from model_paths import GCS_BUCKET
OUT_FILE = os.path.join(os.path.dirname(__file__), "city_coordinates.json")

# Try to import GCS client
try:
    from google.cloud import storage
    _GCS_CLIENT_AVAILABLE = True
except Exception:
    _GCS_CLIENT_AVAILABLE = False


def list_gcs_prefix(prefix: str):
    """
    Return list of filenames under the given prefix in the GCS bucket.
    Requires GOOGLE_APPLICATION_CREDENTIALS configured or running on GCP.
    """
    files = []
    if _GCS_CLIENT_AVAILABLE:
        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        blobs = client.list_blobs(GCS_BUCKET, prefix=prefix)
        for b in blobs:
            # we only want filenames (basename)
            if b.name.endswith("_prophet.joblib"):
                files.append(b.name.split("/")[-1])
        return list(set(files))
    else:
        # Fallback: try the public JSON listing (may not work if bucket restricted)
        url = f"https://storage.googleapis.com/storage/v1/b/{GCS_BUCKET}/o?prefix={prefix}"
        r = requests.get(url, timeout=20)
        if r.status_code != 200:
            return []
        data = r.json()
        items = data.get("items", [])
        for it in items:
            name = it.get("name", "")
            if name.endswith("_prophet.joblib"):
                files.append(name.split("/")[-1])
        return list(set(files))


def extract_city_name(filename):
    name = re.sub(r"_prophet\.joblib$", "", filename)
    name = name.replace("_", " ")
    return name.strip()


def fetch_coordinates(city):
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            print(f"[WARN] API failure for {city}: HTTP {r.status_code}")
            return None
        data = r.json()
        if "results" not in data or not data["results"]:
            print(f"[WARN] No coordinates found for {city}")
            return None
        result = data["results"][0]
        return {
            "city": city,
            "lat": result["latitude"],
            "lon": result["longitude"],
            "country": result.get("country", "")
        }
    except Exception as e:
        print(f"[ERROR] Exception fetching coordinates for {city}: {e}")
        return None


def main():
    prefixes = ["hybrid_models/prophet_models", "prophet_models"]
    files = []
    for p in prefixes:
        files.extend(list_gcs_prefix(p))

    files = list(set(files))

    if not files:
        print("[FATAL] No prophet joblib files found in GCS under prefixes:", prefixes)
        return

    print(f"[INFO] Found {len(files)} prophet files.")
    output = {}
    for i, f in enumerate(files):
        city = extract_city_name(f)
        print(f"[{i+1}/{len(files)}] Fetching → {city}")
        info = fetch_coordinates(city)
        if info:
            output[city] = info
        time.sleep(0.35)

    with open(OUT_FILE, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)

    print("\n[SUCCESS] Coordinates saved to:", OUT_FILE)


if __name__ == "__main__":
    main()
