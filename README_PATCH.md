# Demo fallback & sensor demo mode

- Frontend config: `frontend/public/config.js` (and `frontend/config.js`) set `API_BASE`. Fallback automatically uses `http://127.0.0.1:5000` when empty.
- Demo data toggle: open Sensor Kit page and click **Check Device**. The button briefly shows “Checking devices…” then switches to “Device check: Active” and starts streaming test sensor values every 30s. Click again to stop.
- Default city: Bengaluru. Dashboard falls back to Bengaluru data whenever geolocation or backend AQI calls fail.
- Payload fallbacks: demo JSON files live in `frontend/payloads` (also mirrored under `frontend/public/payloads` for static serving).
- Re-enabling real sensors: stop demo mode with the **Check Device** button, ensure backend `/api/visual_report` responds, and refresh. Live data will be used automatically when available.

