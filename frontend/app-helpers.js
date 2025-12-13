// New function to update charts from historical data
function updateDeviceChartsFromHistory(historyPoints, deviceType) {
    if (!Array.isArray(historyPoints)) return;
    const recentPoints = historyPoints.slice(-CHART_BUFFER_SIZE);

    // Parse chart array from API: [{ timestamp, temperature, pm25, pm10, co2, humidity, voc_ppm }]
    const timestamps = recentPoints.map(d => {
        const ts = new Date(d.timestamp);
        return ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });

    const temps = recentPoints.map(d => d.temperature || null);
    const pm25s = recentPoints.map(d => d.pm25 || null);
    const pm10s = recentPoints.map(d => d.pm10 || null);

    // Update portable charts
    if (deviceType === 'portable') {
        if (charts.portable.temp) {
            charts.portable.temp.data.labels = timestamps;
            charts.portable.temp.data.datasets[0].data = temps;
            charts.portable.temp.update('none');
        }
        if (charts.portable.pm) {
            charts.portable.pm.data.labels = timestamps;
            charts.portable.pm.data.datasets[0].data = pm25s;
            charts.portable.pm.data.datasets[1].data = pm10s;
            charts.portable.pm.update('none');
        }
    }

    // Update static charts
    if (deviceType === 'static') {
        const co2s = recentPoints.map(d => d.co2 || null);
        const vocs = recentPoints.map(d => d.voc_ppm || null);

        if (charts.static.temp) {
            charts.static.temp.data.labels = timestamps;
            charts.static.temp.data.datasets[0].data = temps;
            charts.static.temp.update('none');
        }
        if (charts.static.gas) {
            charts.static.gas.data.labels = timestamps;
            charts.static.gas.data.datasets[0].data = co2s;
            charts.static.gas.data.datasets[1].data = vocs;
            charts.static.gas.data.datasets[2].data = pm25s;
            charts.static.gas.update('none');
        }
    }
}

// Calculate device status based on timestamp freshness
function calculateDeviceStatus(latest) {
    if (!latest || !latest.timestamp) return 'unknown';

    try {
        const lastUpdate = new Date(latest.timestamp);
        const now = new Date();
        const diffSeconds = (now - lastUpdate) / 1000;

        // Device is online if last update was within 90 seconds
        return diffSeconds < 90 ? 'online' : 'offline';
    } catch (e) {
        console.error('Error calculating device status:', e);
        return 'unknown';
    }
}

// Update device status UI
function updateDeviceStatusUI(deviceType, status, timestamp) {
    // Hide all status indicators for demo
    const deviceView = document.getElementById(`device-${deviceType}`);
    if (!deviceView) return;
    const existing = deviceView.querySelector('.device-status-container');
    if (existing) existing.remove();
}

// Quick AQI Prediction function
async function predictCurrentDeviceAQI() {
    const resultContainer = document.getElementById('quick-prediction-result');
    const aqiEl = document.getElementById('quick-pred-aqi');
    const categoryEl = document.getElementById('quick-pred-category');
    const confidenceEl = document.getElementById('quick-pred-confidence');
    const statusEl = document.getElementById('quick-pred-status');

    // Get current device type (portable or static)
    const deviceType = currentDevice || 'portable';
    const deviceId = deviceType === 'portable' ? 'PORTABLE-01' : 'Vento-Station-01';

    // Show loading state
    resultContainer.classList.remove('hidden');
    aqiEl.textContent = '...';
    categoryEl.textContent = 'Loading...';
    confidenceEl.textContent = '...';
    statusEl.textContent = 'Processing';

    try {
        // Get latest sensor data from the current device view
        const tempEl = document.getElementById(`${deviceType}-temp`);
        const pm25El = document.getElementById(`${deviceType}-pm25`);
        const pm10El = document.getElementById(`${deviceType}-pm10`);
        const vocEl = document.getElementById(`${deviceType}-voc`);
        const co2El = document.getElementById(`${deviceType}-co2`);
        const humidityEl = document.getElementById(`${deviceType}-humidity`);

        // Build payload for prediction API
        const payload = {
            pm25: parseFloat(pm25El?.textContent) || 0,
            pm10: parseFloat(pm10El?.textContent) || 0,
            temperature: parseFloat(tempEl?.textContent) || 0,
            humidity: parseFloat(humidityEl?.textContent) || 0,
            voc: parseFloat(vocEl?.textContent) || 0
        };

        // Add CO2 if available (static device)
        if (co2El) {
            payload.co2 = parseFloat(co2El.textContent) || 0;
        }

        console.log('Predicting AQI with payload:', payload);

        // Call prediction API
        const result = await postJSON(`${API_BASE}/api/predict_aqi`, payload, 10000);
        console.log('Prediction result:', result);

        if (result.error) {
            throw new Error(result.error);
        }

        // Display results
        const predictedAQI = result.predicted_aqi || result.aqi || 0;
        aqiEl.textContent = Math.round(predictedAQI);
        categoryEl.textContent = result.category || getAQICategory(predictedAQI);
        confidenceEl.textContent = result.confidence ? `${(result.confidence * 100).toFixed(1)}%` : 'N/A';
        statusEl.textContent = 'Complete';

        // Color code the AQI value
        updateAQIColor(aqiEl, predictedAQI);

        // Show success toast
        showToast('AQI prediction completed successfully', 'success');

    } catch (error) {
        console.error('Prediction failed:', error);
        aqiEl.textContent = 'Error';
        categoryEl.textContent = error.message || 'Failed to predict';
        confidenceEl.textContent = 'N/A';
        statusEl.textContent = 'Failed';
        showToast('Failed to predict AQI: ' + error.message, 'error');
    }
}

