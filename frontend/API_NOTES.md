# API Endpoint Notes

## Visual Report Endpoint

The current `visual_report` endpoint in the backend (`backend/routes/visual_report.py`) does **not** support `device_id` as a query parameter. It reads from a JSON file and returns city-based summaries.

### Current Endpoint Structure:
```
GET /api/visual_report
Returns: City-based pollutant summaries
```

### Expected by Frontend:
```
GET /api/visual_report?device_id=PORTABLE-01
Expected: Device-specific sensor readings with latest data
```

## Solutions

### Option 1: Create New Endpoint (Recommended)
Add a new endpoint in `backend/routes/iot_routes.py` or create `backend/routes/device_routes.py`:

```python
@iot_bp.route("/device_data/<device_id>", methods=["GET"])
def get_device_data(device_id):
    """Get latest sensor readings for a specific device."""
    from db import get_db_connection
    from sqlalchemy import text
    
    conn = get_db_connection()
    try:
        result = conn.execute(
            text("""
                SELECT 
                    device_id, timestamp, temperature, humidity, pressure,
                    pm25, pm10, co2, voc_ppm, mq135,
                    latitude, longitude
                FROM sensor_readings
                WHERE device_id = :device_id
                ORDER BY timestamp DESC
                LIMIT 1
            """),
            {"device_id": device_id}
        )
        row = result.fetchone()
        
        if not row:
            return jsonify({"error": f"No data found for device {device_id}"}), 404
        
        return jsonify({
            "device_id": row.device_id,
            "latest": {
                "timestamp": row.timestamp.isoformat() if row.timestamp else None,
                "temperature": float(row.temperature) if row.temperature else None,
                "humidity": float(row.humidity) if row.humidity else None,
                "pressure": float(row.pressure) if row.pressure else None,
                "pm25": float(row.pm25) if row.pm25 else None,
                "pm10": float(row.pm10) if row.pm10 else None,
                "co2": float(row.co2) if row.co2 else None,
                "voc_ppm": float(row.voc_ppm) if row.voc_ppm else None,
                "mq135": float(row.mq135) if row.mq135 else None,
                "gps": {
                    "lat": float(row.latitude) if row.latitude else None,
                    "lon": float(row.longitude) if row.longitude else None
                }
            }
        })
    finally:
        conn.close()
```

Then update `frontend/app.js`:
```javascript
const url = `${API_BASE}/api/device_data/${deviceId}`;
```

### Option 2: Modify Existing Endpoint
Update `backend/routes/visual_report.py` to support `device_id` parameter and query the database.

### Option 3: Use Mock Data (Current Fallback)
The frontend currently falls back to mock data files in `example_payloads/` when the API doesn't return the expected structure.

## Testing

To test the current setup:
1. The frontend will try the API endpoint
2. If it fails or returns unexpected structure, it automatically uses mock data
3. Connection status will show "Offline" if API fails, "Connected" if mock data loads successfully

## Next Steps

1. **Check if backend has a device-specific endpoint** - The deployed backend might have a different endpoint structure
2. **Add the new endpoint** if needed (Option 1 above)
3. **Update frontend API calls** once the correct endpoint is confirmed

