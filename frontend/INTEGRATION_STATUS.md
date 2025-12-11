# Vento Aureo Frontend - Integration Status

## 🎉 Server Running Successfully!

Your Vento Aureo frontend is now running at: **http://localhost:5173**

## 📡 Backend Integration

### Cloud Run Backend
- **URL**: `https://vento-backend-678919375946.us-east1.run.app`
- **Region**: us-east1
- **Service Account**: vento-backend-sa@just-smithy-479012-a1.iam.gserviceaccount.com
- **Database**: PostgreSQL (Cloud SQL)
  - Host: 34.74.67.76
  - Database: gold_experience
  - User: giorno_geovanna

### GCS Bucket
- **Bucket**: vento_aureo_models
- **Contents**: Prophet models, LSTM models for 5300+ cities
- **Model Cache**: /tmp/model_cache (backend)
- **Model Directory**: /var/models (backend)

## 🔧 Available Features

### 1. **Historic Analysis** ✅
- **Endpoint**: `/api/get_forecast/<city>`
- **Parameters**: 
  - `start_date` (optional): YYYY-MM-DD format
  - `end_date` (optional): YYYY-MM-DD format
  - `periods` (optional): number of periods (default: 12)
- **Models**: Prophet models for 5300+ cities
- **Data**: Historical data available until November 2024

### 2. **Predictive Analysis** ✅
- **Endpoint**: `/api/hybrid_forecast/<city>`
- **Parameters**:
  - `horizon`: Number of months to forecast (1, 3, 6, 12, 24, 60)
- **Models**: Hybrid Prophet + LSTM models
- **Features**: Long-range AQI predictions (up to 60 months)

### 3. **Short-Term Forecast** ✅
- **Endpoint**: `/api/short_term/<city>`
- **Parameters**:
  - `base`: Base value for interpolation
- **Features**: 1-14 day forecasts with daily interpolation

### 4. **Live AQI** ✅
- **City-based**: `/api/city_aqi/<city>`
- **Coordinate-based**: `/api/live_aqi_coords?lat=<lat>&lon=<lon>`
- **Source**: Open-Meteo API
- **Data**: Real-time AQI, PM2.5, PM10

### 5. **City Search** ✅
- **Endpoint**: `/api/list_cities`
- **Returns**: List of all available cities with models
- **Count**: 5300+ cities worldwide

### 6. **Global AQI Snapshot** ✅
- **Endpoint**: `/api/global_aqi`
- **Features**: Batch AQI data for multiple cities
- **Limit**: First 300 cities from coordinates file

### 7. **Trivia** ✅
- **Endpoint**: `/api/trivia`
- **Features**: Air quality facts and tips

### 8. **IoT Sensor Data** ✅
- **Endpoint**: `/api/visual_report?device_id=<device_id>`
- **Devices**: 
  - PORTABLE-01 (portable sensor)
  - Vento-Station-01 (static station)
- **Data**: Temperature, humidity, PM2.5, PM10, VOC, CO2, etc.

## 🎨 Frontend Features

### Dashboard (`index.html`)
- ✅ Real-time AQI display
- ✅ Location-based AQI detection
- ✅ City search with autocomplete
- ✅ AQI category indicators
- ✅ Air quality trivia
- ✅ Dark/Light theme toggle

### Sensor Kit Section
- ✅ Portable sensor monitoring
- ✅ Static station monitoring
- ✅ Real-time charts (Temperature, PM levels, Gas sensors)
- ✅ GPS tracking (for portable device)
- ✅ Device status indicators

### Predictive AQI Analysis
- ✅ City selection with search
- ✅ Forecast horizon selection (1-60 months)
- ✅ Interactive charts (Line, Bar, Area, Combo)
- ✅ Statistical summaries

### Historic AQI Charts
- ✅ City selection with search
- ✅ Date range filtering
- ✅ Monthly historical trends
- ✅ Interactive charts (Line, Bar, Area, Combo)
- ✅ Statistical summaries

## 🚀 How to Use

### 1. Start the Server
```bash
cd e:\project\vento_aureo_fronted\vento-aureo-test\frontend
node demo-server.js 5173
```

### 2. Open in Browser
Navigate to: `http://localhost:5173`

### 3. Explore Features

#### View Historic Data
1. Go to "Historic AQI Charts" section
2. Search for a city (e.g., "Delhi", "Mumbai", "New York")
3. Select date range (data available until Nov 2024)
4. Click "Apply" to view historical trends

#### Generate Predictions
1. Go to "Predictive AQI Analysis" section
2. Search for a city
3. Select forecast horizon (1-60 months)
4. Click "Generate" to see future predictions

#### Check Live AQI
1. Allow location access when prompted
2. View your current location's AQI on the dashboard
3. Or search for any city in the "City AQI Lookup" section

#### Monitor IoT Sensors
1. Go to "Sensor Kit" section
2. Switch between Portable and Static devices
3. View real-time sensor data and charts

## 🔍 Troubleshooting

### Cities Not Loading
- **Issue**: Empty city dropdown
- **Fix**: The backend should have 5300+ cities. Check console for errors.
- **Fallback**: Frontend has hardcoded fallback cities (Delhi, Mumbai, etc.)

### Historic Data Not Showing
- **Issue**: "No forecast found for city"
- **Possible Causes**:
  - City name mismatch (try different spelling)
  - Model not available for that city
  - Backend model loading issue
- **Solution**: Try popular cities first (Delhi, Mumbai, Beijing, London, etc.)

### Predictions Failing
- **Issue**: "Failed to load prediction"
- **Possible Causes**:
  - Model not found in GCS bucket
  - Backend timeout
  - Network issue
- **Solution**: 
  - Check backend logs
  - Verify GCS bucket has models
  - Try smaller horizon first (1-3 months)

### Live AQI Not Working
- **Issue**: "Unable to fetch location AQI"
- **Possible Causes**:
  - Location permission denied
  - Open-Meteo API rate limit
  - City coordinates not in database
- **Solution**:
  - Allow location access
  - Try city-based lookup instead
  - Wait a few minutes and retry

## 📊 Model Information

### Prophet Models
- **Location**: `gs://vento_aureo_models/prophet_models/`
- **Format**: `{city_name}_prophet.joblib`
- **Count**: 5300+ cities
- **Training Data**: Historical AQI data until Nov 2024

### LSTM Models
- **Location**: `gs://vento_aureo_models/lstm_models/`
- **Format**: Various formats
- **Purpose**: Enhanced predictions for hybrid forecasting

### Hybrid Models
- **Combines**: Prophet + LSTM
- **Advantages**: Better long-term accuracy
- **Use Case**: 12-60 month forecasts

## 🎯 Next Steps

### To Deploy Frontend
1. **Option A: Vercel**
   ```bash
   cd e:\project\vento_aureo_fronted\vento-aureo-test\frontend
   vercel deploy
   ```

2. **Option B: Firebase Hosting**
   ```bash
   firebase init hosting
   firebase deploy
   ```

3. **Option C: Cloud Run (Static)**
   - Create a simple Dockerfile with nginx
   - Deploy to Cloud Run

### To Verify Backend
1. Test health endpoint:
   ```bash
   curl https://vento-backend-678919375946.us-east1.run.app/health
   ```

2. Test city list:
   ```bash
   curl https://vento-backend-678919375946.us-east1.run.app/api/list_cities
   ```

3. Test prediction:
   ```bash
   curl "https://vento-backend-678919375946.us-east1.run.app/api/hybrid_forecast/Delhi?horizon=12"
   ```

## 📝 Notes

- Historical data is available until **November 2024**
- Future predictions are **model-based approximations**
- Live AQI data comes from **Open-Meteo API**
- IoT sensor data requires active devices
- All endpoints support **CORS** for cross-origin requests

## 🎨 UI Enhancements Made

1. ✅ Dark mode compatibility
2. ✅ Responsive design
3. ✅ Interactive charts with multiple view types
4. ✅ City search with autocomplete
5. ✅ Real-time data updates
6. ✅ Error handling and fallbacks
7. ✅ Loading states and animations
8. ✅ AQI color coding
9. ✅ Statistical summaries
10. ✅ Professional styling

---

**Status**: ✅ **READY FOR USE**

Your Vento Aureo air quality monitoring system is fully integrated and ready to analyze air quality data for 5300+ cities worldwide!
