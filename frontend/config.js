// config.js — update API_BASE to your Cloud Run URL
var API_BASE = "https://vento-backend-678919375946.us-east1.run.app";

// Dev fallback
if (!API_BASE) {
    API_BASE = "http://127.0.0.1:5000";
}

