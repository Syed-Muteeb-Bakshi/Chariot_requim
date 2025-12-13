// ============================================
// VENTO AUREO - Air Quality Dashboard
// ============================================

// Configuration (API_BASE comes from config.js; fallback here for safety)
if (typeof API_BASE === 'undefined' || !API_BASE) {
    var API_BASE = "https://vento-backend-678919375946.us-east1.run.app";
}
if (!API_BASE) {
    API_BASE = "http://127.0.0.1:5000";
}
const API_KEY = "YOUR_API_KEY_HERE";
const REFRESH_INTERVAL = 5000;
const CHART_BUFFER_SIZE = 30;
const TRIVIA_REFRESH_INTERVAL = 20000;
const FORECAST_MAX_POINTS = 60;
const DEFAULT_CITY = "bangalore";
const DEFAULT_CITY_DISPLAY = "Bengaluru";
// Expanded city list - mostly India, some global
const PRESET_CITIES = [
    // Major Indian cities
    "Bangalore", "Delhi", "Mumbai", "Chennai", "Hyderabad", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Surat",
    "Lucknow", "Kanpur", "Nagpur", "Indore", "Thane", "Bhopal", "Visakhapatnam", "Patna", "Vadodara", "Ghaziabad",
    "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot", "Varanasi", "Srinagar", "Amritsar", "Allahabad",
    "Ranchi", "Howrah", "Jabalpur", "Gwalior", "Coimbatore", "Vijayawada", "Jodhpur", "Madurai", "Raipur", "Kota",
    "Guwahati", "Chandigarh", "Solapur", "Hubli", "Bareilly", "Moradabad", "Mysore", "Gurgaon", "Aligarh", "Jalandhar",
    "Tiruchirappalli", "Bhubaneswar", "Salem", "Warangal", "Mira-Bhayandar", "Thiruvananthapuram", "Bhiwandi", "Saharanpur",
    "Guntur", "Amravati", "Bikaner", "Noida", "Jamshedpur", "Bhilai", "Cuttack", "Firozabad", "Kochi", "Nellore",
    "Bhavnagar", "Dehradun", "Durgapur", "Asansol", "Rourkela", "Nanded", "Kolhapur", "Ajmer", "Akola", "Gulbarga",
    "Jamnagar", "Ujjain", "Loni", "Siliguri", "Jhansi", "Ulhasnagar", "Jammu", "Sangli-Miraj", "Belgaum", "Mangalore",
    "Ambattur", "Tirunelveli", "Malegaon", "Gaya", "Jalgaon", "Udaipur", "Maheshtala", "Tirupati", "Karnal", "Bathinda",
    // Global cities
    "New York", "London", "Tokyo", "Paris", "Sydney", "Singapore", "Dubai", "Toronto", "Berlin", "Rome",
    "Barcelona", "Amsterdam", "Vienna", "Stockholm", "Copenhagen", "Oslo", "Zurich", "Brussels", "Dublin", "Edinburgh"
];
const BANGALORE_FALLBACK = {
    latest_aqi: 85,
    pollutants: { pm25: 60, pm10: 90, co2: 420, voc: 0.5, pm2_5: 60 },
    city: "Bengaluru",
    city_matched: "Bengaluru",
    timestamp: new Date().toISOString()
};
const FORECAST_SERIES_META = {
    shortTerm: { label: 'Short-Term ML', color: '#38bdf8' },
    prophet: { label: 'Prophet', color: '#a855f7' },
    hybrid: { label: 'Hybrid Ensemble', color: '#f97316' }
};
const FORECAST_FALLBACK = {
    short_term: Array.from({ length: 24 }, (_, i) => ({
        ts: Date.now() + i * 3600000,
        aqi: Math.round(140 + Math.sin(i / 3) * 8 + (Math.random() * 3 - 1))
    }))
};

async function safeFetchJSON(url, options = {}, fallback = null) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) {
            console.warn("safeFetchJSON non-OK:", res.status, url);
            return fallback;
        }
        return await res.json();
    } catch (err) {
        console.warn("safeFetchJSON fetch error:", err, url);
        return fallback;
    }
}

// Debug: Log API base
console.log('API Base URL:', API_BASE);

// State
let currentSection = 'dashboard';
let currentDevice = 'portable';
let cities = [];
let refreshIntervalId = null;
let triviaIntervalId = null;
let lastTriviaFact = '';

// Device metadata for status tracking
let deviceMetadata = {
    portable: { lastUpdate: null, status: 'unknown' },
    static: { lastUpdate: null, status: 'unknown' }
};

// Chart instances
let charts = {
    portable: { temp: null, pm: null },
    static: { temp: null, gas: null },
    predict: null,
    historic: null,
    forecastComparison: null
};

// Historic chart type
let historicChartType = 'line';
let currentHistoricData = [];
let currentHistoricCity = '';

// Chart data buffers
const chartData = {
    portable: { temp: [], pm25: [], pm10: [], timestamps: [] },
    static: { temp: [], co2: [], voc: [], pm25: [], pm10: [], timestamps: [] }
};

// Map instances
let maps = { portable: null, static: null };
let mapMarkers = { portable: null, static: null };
let forecastState = {
    shortTerm: [],
    prophet: [],
    hybrid: []
};
const DEVICE_IDS = {
    portable: 'PORTABLE-01',
    static: 'Vento-Station-01'
};

// Demo sensor generator
const SENSOR_DEMO_BASES = {
    bangalore: {
        portable: {
            temperature: 28.5, humidity: 60, pm25: 60, pm10: 90, voc: 0.6, pressure: 1012, mq135: 350
        },
        static: {
            temperature: 28.5, humidity: 60, co2: 450, pm25: 60, pm10: 90, voc: 0.6, pressure: 1012, mq135: 350
        }
    }
};

function jitter(value, minDelta = 1, maxDelta = 5) {
    const delta = Math.floor(Math.random() * (maxDelta - minDelta + 1)) + minDelta;
    return Math.round((Math.random() < 0.5 ? value - delta : value + delta) * 10) / 10;
}

let DEMO_ACTIVE = false;
let demoIntervalId = null;

// ==========================
// INITIALIZATION
// ==========================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTitleScreen();
    setupEventListeners();
    // Load cities immediately and retry if needed
    loadCities().then(() => {
        console.log('Cities loaded:', cities.length);
        if (cities.length === 0) {
            console.warn('No cities loaded, retrying...');
            setTimeout(loadCities, 2000);
        }
    });
    startTriviaAutoRefresh();
    loadCurrentLocationAQI();
});

// ==========================
// TITLE SCREEN
// ==========================
function initTitleScreen() {
    const titleScreen = document.getElementById('title-screen');
    const mainApp = document.getElementById('main-app');

    // Animate title screen elements
    setTimeout(() => {
        document.querySelector('.title-text').style.opacity = '1';
        document.querySelector('.title-text').style.transition = 'opacity 1s ease-in';
    }, 300);

    setTimeout(() => {
        document.querySelector('.subtitle-text').style.opacity = '1';
        document.querySelector('.subtitle-text').style.transition = 'opacity 1s ease-in';
    }, 800);

    setTimeout(() => {
        document.querySelector('.floating-symbols').style.opacity = '1';
        document.querySelector('.floating-symbols').style.transition = 'opacity 1s ease-in';
        document.querySelector('.edge-symbols').style.opacity = '1';
        document.querySelector('.edge-symbols').style.transition = 'opacity 1s ease-in';
    }, 1300);

    // Fade out and show main app
    setTimeout(() => {
        titleScreen.style.opacity = '0';
        titleScreen.style.transition = 'opacity 0.8s ease-out';
        setTimeout(() => {
            titleScreen.style.display = 'none';
            mainApp.classList.remove('hidden');
            initializeApp();
        }, 800);
    }, 3000);
}

// ==========================
// APP INITIALIZATION
// ==========================
function initializeApp() {
    setupSidebar();
    initializeCharts();
    initializeMaps();
    startAutoRefresh();
    // Don't fetch device data on init - wait for button click
    // fetchDeviceData(DEVICE_IDS.portable, 'portable');
    // fetchDeviceData(DEVICE_IDS.static, 'static');
    generateDeviceForecasts();
}

// ==========================
// SIDEBAR NAVIGATION
// ==========================
function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle = document.getElementById('sidebar-toggle');
    const navItems = document.querySelectorAll('.nav-item');

    // Toggle sidebar (mobile only)
    toggle?.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
        overlay.classList.toggle('hidden');
    });

    // Close on overlay click
    overlay?.addEventListener('click', () => {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    });

    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            switchSection(section);

            // Update active state
            navItems.forEach(ni => {
                ni.classList.remove('active', 'bg-blue-50', 'dark:bg-blue-900', 'text-blue-600', 'dark:text-blue-400');
            });
            item.classList.add('active', 'bg-blue-50', 'dark:bg-blue-900', 'text-blue-600', 'dark:text-blue-400');

            // Close sidebar on mobile
            if (window.innerWidth < 768) {
                sidebar.classList.add('-translate-x-full');
                overlay.classList.add('hidden');
            }
        });
    });
}

// ==========================
// THEME TOGGLE
// ==========================
function initTheme() {
    const stored = localStorage.getItem('ventoa_theme') || 'light';
    document.documentElement.classList.toggle('dark', stored === 'dark');
    updateThemeIcon(stored === 'dark');
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('ventoa_theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);

    // Fixed: Update all charts when theme changes
    if (charts.portable.temp) {
        const config = charts.portable.temp.config;
        const textColor = isDark ? '#e2e8f0' : '#64748b';
        const tickColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        config.options.plugins.legend.labels.color = textColor;
        config.options.scales.x.ticks.color = tickColor;
        config.options.scales.y.ticks.color = tickColor;
        config.options.scales.x.grid.color = gridColor;
        config.options.scales.y.grid.color = gridColor;
        charts.portable.temp.update();
    }

    if (charts.portable.pm) {
        const config = charts.portable.pm.config;
        const textColor = isDark ? '#e2e8f0' : '#64748b';
        const tickColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        config.options.plugins.legend.labels.color = textColor;
        config.options.scales.x.ticks.color = tickColor;
        config.options.scales.y.ticks.color = tickColor;
        config.options.scales.x.grid.color = gridColor;
        config.options.scales.y.grid.color = gridColor;
        charts.portable.pm.update();
    }

    if (charts.static.temp) {
        const config = charts.static.temp.config;
        const textColor = isDark ? '#e2e8f0' : '#64748b';
        const tickColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        config.options.plugins.legend.labels.color = textColor;
        config.options.scales.x.ticks.color = tickColor;
        config.options.scales.y.ticks.color = tickColor;
        config.options.scales.x.grid.color = gridColor;
        config.options.scales.y.grid.color = gridColor;
        charts.static.temp.update();
    }

    if (charts.static.gas) {
        const config = charts.static.gas.config;
        const textColor = isDark ? '#e2e8f0' : '#64748b';
        const tickColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        config.options.plugins.legend.labels.color = textColor;
        config.options.scales.x.ticks.color = tickColor;
        config.options.scales.y.ticks.color = tickColor;
        config.options.scales.x.grid.color = gridColor;
        config.options.scales.y.grid.color = gridColor;
        charts.static.gas.update();
    }

    if (charts.predict) {
        const config = charts.predict.config;
        const textColor = isDark ? '#e2e8f0' : '#64748b';
        const tickColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        config.options.plugins.legend.labels.color = textColor;
        config.options.scales.x.ticks.color = tickColor;
        config.options.scales.y.ticks.color = tickColor;
        config.options.scales.x.grid.color = gridColor;
        config.options.scales.y.grid.color = gridColor;
        charts.predict.update();
    }

    if (charts.historic) {
        const config = charts.historic.config;
        const textColor = isDark ? '#e2e8f0' : '#64748b';
        const tickColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        config.options.plugins.legend.labels.color = textColor;
        config.options.scales.x.ticks.color = tickColor;
        config.options.scales.y.ticks.color = tickColor;
        config.options.scales.x.grid.color = gridColor;
        config.options.scales.y.grid.color = gridColor;
        charts.historic.update();
    }
}

function updateThemeIcon(isDark) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.textContent = isDark ? '☀️' : '🌙';
    }
}

function switchSection(section) {
    // Hide all sections
    document.querySelectorAll('.section-content').forEach(s => s.classList.add('hidden'));

    // Show selected section
    const targetSection = document.getElementById(`section-${section}`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        currentSection = section;

        // Update page title
        const titles = {
            'dashboard': 'Dashboard',
            'sensor-kit': 'Sensor Kit',
            'predictive': 'Predictive AQI Analysis',
            'historic': 'Historic AQI Charts'
        };
        document.getElementById('page-title').textContent = titles[section] || 'Dashboard';

        if (section === 'predictive' && (!forecastState.shortTerm.length && !forecastState.prophet.length && !forecastState.hybrid.length)) {
            generateDeviceForecasts();
        }
    }
}

// ==========================
// EVENT LISTENERS
// ==========================
function setupEventListeners() {
    // Theme toggle
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

    // Device tabs
    document.querySelectorAll('.device-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const device = tab.dataset.device;
            switchDevice(device);
        });
    });

    // City search
    document.getElementById('city-search-btn')?.addEventListener('click', searchCityAQI);
    document.getElementById('city-search-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchCityAQI();
    });

    // Predictive
    document.getElementById('predict-generate')?.addEventListener('click', generatePrediction);
    document.getElementById('predict-search')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim().toLowerCase();
            if (!val) return;
            const match = cities.find(c => c.toLowerCase().includes(val));
            if (match) {
                document.getElementById('predict-city').value = match;
                generatePrediction();
            }
        }
    });

    // Historic
    document.getElementById('historic-apply')?.addEventListener('click', loadHistoric);
    document.getElementById('historic-search')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim().toLowerCase();
            if (!val) return;
            const match = cities.find(c => c.toLowerCase().includes(val));
            if (match) {
                document.getElementById('historic-city').value = match;
                loadHistoric();
            }
        }
    });
    
    // Historic chart type toggles
    document.getElementById('historic-toggle-line')?.addEventListener('click', () => {
        historicChartType = 'line';
        updateHistoricChartType();
    });
    document.getElementById('historic-toggle-bar')?.addEventListener('click', () => {
        historicChartType = 'bar';
        updateHistoricChartType();
    });
    document.getElementById('historic-toggle-area')?.addEventListener('click', () => {
        historicChartType = 'area';
        updateHistoricChartType();
    });
    document.getElementById('historic-toggle-scatter')?.addEventListener('click', () => {
        historicChartType = 'scatter';
        updateHistoricChartType();
    });

    // Forecast controls
    document.getElementById('forecast-refresh')?.addEventListener('click', generateDeviceForecasts);

    // Demo device check toggle
    document.getElementById('check-device-btn')?.addEventListener('click', async function() {
        const btn = this;
        btn.disabled = true;
        const old = btn.innerText;
        btn.innerText = 'Checking devices…';
        await new Promise(res => setTimeout(res, 1200));
        if (!DEMO_ACTIVE) {
            startDemoSensors('bangalore');
            btn.innerText = 'Device check: Active';
            // Show charts when activated
            showSensorCharts();
        } else {
            stopDemoSensors();
            btn.innerText = 'Check Device';
            // Hide charts when deactivated
            hideSensorCharts();
        }
        btn.disabled = false;
    });
}

function switchDevice(device) {
    currentDevice = device;

    // Update tabs
    document.querySelectorAll('.device-tab').forEach(tab => {
        if (tab.dataset.device === device) {
            tab.classList.add('active', 'border-blue-600', 'text-blue-600');
            tab.classList.remove('text-slate-600');
        } else {
            tab.classList.remove('active', 'border-blue-600', 'text-blue-600');
            tab.classList.add('text-slate-600');
        }
    });

    // Show/hide device views
    document.getElementById('device-portable').classList.toggle('hidden', device !== 'portable');
    document.getElementById('device-static').classList.toggle('hidden', device !== 'static');

    // Fetch data for selected device
    const deviceId = device === 'portable' ? DEVICE_IDS.portable : DEVICE_IDS.static;
    fetchDeviceData(deviceId, device);
}

// ==========================
// API CALLS
// ==========================
async function fetchDeviceData(deviceId, deviceType) {
    const url = `${API_BASE}/api/visual_report?device_id=${deviceId}`;
    const headers = {};
    if (API_KEY && API_KEY !== "YOUR_API_KEY_HERE") {
        headers['x-api-key'] = API_KEY;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(url, { headers, method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();

        if (result.error) throw new Error(result.error);

        if (result.status === 'ok' || result.latest || result.device_id) {
            const data = {
                device_id: result.device_id || deviceId,
                latest: result.latest || {},
                chart: result.chart || [],
                status: result.status || 'ok'
            };

            // VALIDATION: Check if data is actually valid (not nulls)
            // The backend might return 200 OK but with null values if sensors are initializing
            const l = data.latest;
            const hasValidData = l && (
                (l.temperature != null && l.temperature !== 'null') ||
                (l.pm25 != null && l.pm25 !== 'null') ||
                (l.pm2_5 != null && l.pm2_5 !== 'null') ||
                (l.co2 != null && l.co2 !== 'null')
            );

            if (!hasValidData) {
                // Check if chart has data
                const lastChart = data.chart && data.chart.length > 0 ? data.chart[data.chart.length - 1] : null;
                const chartValid = lastChart && (lastChart.temperature != null || lastChart.pm25 != null);

                if (!chartValid) {
                    throw new Error('API returned null/empty sensor values');
                }
                // Use last chart point as latest if latest is empty
                data.latest = lastChart;
            }

            const deviceStatus = calculateDeviceStatus(data.latest);
            deviceMetadata[deviceType] = {
                lastUpdate: data.latest.timestamp || new Date().toISOString(),
                status: deviceStatus
            };

            updateDeviceView(data, deviceType);
            // Don't show status UI - hide it
            // updateDeviceStatusUI(deviceType, deviceStatus, data.latest.timestamp);
            // updateConnectionStatus(true);
            return;
        }
        throw new Error('Invalid response');
    } catch (error) {
        // Silently fail - don't show errors
        // console.warn(`Device ${deviceId} fetch failed`, error);
        deviceMetadata[deviceType] = {
            lastUpdate: null,
            status: 'unknown'
        };
        // Don't show offline status
        // updateDeviceStatusUI(deviceType, 'offline', null);
        // updateConnectionStatus(false);
        // Don't auto-start demo - wait for button click
    }
}

async function loadCities() {
    // Use expanded preset list for demo
    cities = [...PRESET_CITIES];
    
    // Sort cities alphabetically
    cities.sort((a, b) => a.localeCompare(b));

    const selects = ['predict-city', 'historic-city'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const opts = cities.length ? cities.map(c => `<option value="${c}">${c}</option>`).join('') : '<option>No cities available</option>';
            select.innerHTML = opts;
            const defaultOption = cities.find(c => c.toLowerCase().includes(DEFAULT_CITY));
            if (defaultOption) {
                select.value = defaultOption;
            }
        }
    });

    setTimeout(() => {
        setupCitySearch('predict-search', 'predict-suggest', (val) => {
            const select = document.getElementById('predict-city');
            if (select) select.value = val;
        });

        setupCitySearch('historic-search', 'historic-suggest', (val) => {
            const select = document.getElementById('historic-city');
            if (select) select.value = val;
            loadHistoric();
        });
    }, 500);
}

function setupCitySearch(inputId, suggestId, setterCallback) {
    const inputEl = document.getElementById(inputId);
    const suggestEl = document.getElementById(suggestId);

    if (!inputEl || !suggestEl) {
        return;
    }

    inputEl.addEventListener('input', () => {
        const v = inputEl.value.trim();
        if (!v) {
            suggestEl.style.display = 'none';
            return;
        }

        if (cities.length === 0) {
            return;
        }

        // Case-insensitive, partial match search
        const searchLower = v.toLowerCase();
        const matches = cities.filter(c => c.toLowerCase().includes(searchLower)).slice(0, 15);
        if (!matches.length) {
            suggestEl.style.display = 'none';
            return;
        }
        suggestEl.innerHTML = matches.map(m =>
            `<div class="px-4 py-2 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer text-slate-900 dark:text-slate-100" data-val="${m}">${m}</div>`
        ).join('');
        suggestEl.style.display = 'block';
        suggestEl.className = 'absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-auto';

        suggestEl.querySelectorAll('div').forEach(el => {
            el.addEventListener('click', () => {
                const val = el.getAttribute('data-val');
                inputEl.value = val;
                suggestEl.style.display = 'none';
                if (typeof setterCallback === 'function') setterCallback(val);
            });
        });
    });

    document.addEventListener('click', (ev) => {
        if (!inputEl.contains(ev.target) && !suggestEl.contains(ev.target)) {
            suggestEl.style.display = 'none';
        }
    });
}

function startTriviaAutoRefresh() {
    if (triviaIntervalId) clearInterval(triviaIntervalId);
    refreshTriviaFact();
    triviaIntervalId = setInterval(refreshTriviaFact, TRIVIA_REFRESH_INTERVAL);
}

async function refreshTriviaFact() {
    const factEl = document.getElementById('aqi-fact');
    if (!factEl) return;

    try {
        const res = await fetch(`${API_BASE}/api/trivia`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();

        let fact = '';
        if (Array.isArray(payload) && payload.length) {
            const randomEntry = payload[Math.floor(Math.random() * payload.length)];
            fact = typeof randomEntry === 'string' ? randomEntry : (randomEntry.fact || randomEntry.text || '');
        } else if (typeof payload === 'object' && payload !== null) {
            fact = payload.fact || payload.message || payload.text || '';
        } else if (typeof payload === 'string') {
            fact = payload;
        }

        if (!fact) throw new Error('Trivia response empty');

        factEl.classList.add('fade-out');
        setTimeout(() => {
            factEl.textContent = fact;
            factEl.classList.remove('fade-out');
            factEl.classList.add('fade-in');
            setTimeout(() => factEl.classList.remove('fade-in'), 300);
        }, 200);
        lastTriviaFact = fact;
    } catch (error) {
        // Silently fail - don't show errors
        if (!lastTriviaFact) {
            factEl.textContent = 'Air quality monitoring helps protect public health.';
        }
    }
}

async function loadCurrentLocationAQI() {
    const aqiValue = document.getElementById('aqi-value');
    const aqiCategory = document.getElementById('aqi-category');
    const currentLocation = document.getElementById('current-location');
    const currentPm25 = document.getElementById('current-pm25');
    const currentPm10 = document.getElementById('current-pm10');

    aqiValue.textContent = '...';
    aqiCategory.textContent = 'Fetching live data...';
    currentLocation.textContent = DEFAULT_CITY_DISPLAY;
    currentPm25.textContent = '—';
    currentPm10.textContent = '—';

    const tryGeolocation = async () => {
        if (!navigator.geolocation) return null;
        try {
            const position = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Geolocation timeout')), 3000);
                navigator.geolocation.getCurrentPosition(
                    (pos) => { clearTimeout(timeout); resolve(pos); },
                    (err) => { clearTimeout(timeout); reject(err); },
                    { timeout: 3000, enableHighAccuracy: false }
                );
            });
            return {
                lat: position.coords.latitude,
                lon: position.coords.longitude
            };
        } catch (error) {
            // Silently fail - use default city
            return null;
        }
    };

    const coords = await tryGeolocation();
    let payload = null;
    if (coords) {
        payload = await safeFetchJSON(`${API_BASE}/api/live_aqi_coords?lat=${coords.lat}&lon=${coords.lon}`, { signal: AbortSignal.timeout(4000) }, null);
    }

    if (!payload && coords) {
        payload = await safeFetchJSON(`${API_BASE}/api/live_aqi/${DEFAULT_CITY}`, {}, null);
    }
    if (!payload) {
        payload = await safeFetchJSON(`${API_BASE}/api/city_aqi/${DEFAULT_CITY}`, {}, null);
    }
    if (!payload) {
        console.warn('Using Bangalore static fallback for dashboard');
        payload = BANGALORE_FALLBACK;
    }

    updateDashboardUI(payload.latest_aqi ?? payload.aqi ?? payload.latest, payload.city_matched || payload.city || DEFAULT_CITY_DISPLAY, payload.pollutants || payload.data || payload);
}

function updateDashboardUI(aqi, city, pollutants) {
    const aqiValue = document.getElementById('aqi-value');
    const aqiCategory = document.getElementById('aqi-category');
    const currentLocation = document.getElementById('current-location');
    const currentPm25 = document.getElementById('current-pm25');
    const currentPm10 = document.getElementById('current-pm10');
    const safeAqi = typeof aqi === 'number' && !Number.isNaN(aqi) ? Math.round(aqi) : null;

    aqiValue.textContent = safeAqi ?? '—';
    aqiCategory.textContent = safeAqi ? getAQICategory(safeAqi) : 'Unavailable';
    currentLocation.textContent = city || DEFAULT_CITY_DISPLAY;
    currentPm25.textContent = pollutants?.pm2_5 ?? pollutants?.pm25 ?? '—';
    currentPm10.textContent = pollutants?.pm10 ?? pollutants?.pm_10 ?? '—';
    updateAQIColor(aqiValue, safeAqi);
}

// Global safety check - silent
setTimeout(() => {
    const val = document.getElementById('aqi-value')?.textContent;
    if (val === '—' || val === '...' || val === 'undefined') {
        // Silently use fallback - no error shown
    }
}, 4000);

async function searchCityAQI() {
    const input = document.getElementById('city-search-input');
    const result = document.getElementById('city-search-result');
    const city = input.value.trim();

    if (!city) {
        result.innerHTML = '<span class="text-red-600">Please enter a city name</span>';
        return;
    }

    result.innerHTML = '<span class="text-slate-600">Searching...</span>';

    const cityLower = city.toLowerCase();
    let data = null;

    if (PRESET_CITIES.includes(cityLower)) {
        data = await safeFetchJSON(`${API_BASE}/api/live_aqi/${encodeURIComponent(cityLower)}`, {}, null);
    }
    if (!data) {
        data = await safeFetchJSON(`${API_BASE}/api/city_aqi/${encodeURIComponent(cityLower)}`, {}, null);
    }
    if (!data) {
        try {
            data = await safeFetchJSON(`./payloads/${cityLower}.json`, {}, null);
        } catch (err) {
            console.warn('No payload fallback for city', cityLower, err);
        }
    }

    if (!data) {
        // Use fallback data without showing error
        renderSearchResult({ latest_aqi: BANGALORE_FALLBACK.latest_aqi, pollutants: BANGALORE_FALLBACK.pollutants, city_matched: city });
        return;
    }

    renderSearchResult(data);
}

function renderSearchResult(data) {
    const result = document.getElementById('city-search-result');
    const aqi = data.latest_aqi;
    const category = getAQICategory(aqi);

    result.innerHTML = `
        <div class="space-y-2">
            <div class="font-semibold text-slate-900 dark:text-slate-100">${data.city_matched || data.city_requested}</div>
            <div class="text-slate-700 dark:text-slate-300">AQI: <span class="font-bold text-lg">${aqi ?? 'N/A'}</span> - ${category}</div>
            <div class="text-sm text-slate-600 dark:text-slate-400">PM2.5: ${data.pollutants?.pm2_5 ?? '—'} µg/m³ | PM10: ${data.pollutants?.pm10 ?? '—'} µg/m³</div>
        </div>
    `;
}

// Generate fake predictive AQI data
function generatePredictiveAQIData(city, horizonMonths) {
    const data = [];
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + horizonMonths);
    
    // Base AQI varies by city (deterministic)
    let cityHash = 0;
    for (let i = 0; i < city.length; i++) {
        cityHash = ((cityHash << 5) - cityHash) + city.charCodeAt(i);
        cityHash = cityHash & cityHash;
    }
    const baseAQI = 50 + Math.abs(cityHash % 150);
    
    // Generate monthly data points
    const current = new Date(now);
    let lastAQI = baseAQI;
    
    while (current <= endDate) {
        // Smooth forecast curve
        const change = (Math.random() - 0.5) * 6; // Max ±3 change per month
        lastAQI = Math.max(20, Math.min(400, lastAQI + change));
        
        // Add seasonal trend
        const month = current.getMonth();
        const seasonalAdjust = Math.sin((month / 12) * 2 * Math.PI) * 12;
        const finalAQI = Math.round(lastAQI + seasonalAdjust);
        
        data.push({
            timestamp: current.toISOString(),
            aqi: finalAQI,
            predicted_aqi: finalAQI
        });
        
        current.setMonth(current.getMonth() + 1);
    }
    
    return data;
}

async function generatePrediction() {
    const city = document.getElementById('predict-city').value;
    const horizon = parseInt(document.getElementById('predict-horizon').value) || 12;
    const stats = document.getElementById('predict-stats');

    if (!city) {
        stats.textContent = 'Please select a city';
        stats.className = 'mt-4 text-sm text-slate-600 dark:text-slate-400';
        return;
    }

    stats.textContent = 'Generating forecast...';
    stats.className = 'mt-4 text-sm text-slate-600 dark:text-slate-400';

    // Generate fake forecast data
    const forecast = generatePredictiveAQIData(city, horizon);

    renderPredictChart(forecast, city);
    const avg = forecast.length
        ? (forecast.reduce((a, b) => a + (Number(b.aqi || b.predicted_aqi || 0)), 0) / forecast.length).toFixed(2)
        : 'N/A';
    stats.textContent = `${city} · Horizon: ${horizon} months · Avg: ${avg}`;
}

// Generate fake historic AQI data for a city
function generateHistoricAQIData(city, fromDate, toDate) {
    const data = [];
    const start = fromDate ? new Date(fromDate) : new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000); // 2 years ago
    const end = toDate ? new Date(toDate) : new Date();
    
    // Base AQI varies by city (deterministic based on city name hash)
    let cityHash = 0;
    for (let i = 0; i < city.length; i++) {
        cityHash = ((cityHash << 5) - cityHash) + city.charCodeAt(i);
        cityHash = cityHash & cityHash;
    }
    const baseAQI = 50 + Math.abs(cityHash % 150); // Base between 50-200
    
    // Generate daily data points
    const current = new Date(start);
    let lastAQI = baseAQI;
    
    while (current <= end) {
        // Slow fluctuations - no sharp spikes
        const change = (Math.random() - 0.5) * 8; // Max ±4 change per day
        lastAQI = Math.max(20, Math.min(400, lastAQI + change));
        
        // Add some seasonal variation
        const month = current.getMonth();
        const seasonalAdjust = Math.sin((month / 12) * 2 * Math.PI) * 15;
        const finalAQI = Math.round(lastAQI + seasonalAdjust);
        
        data.push({
            timestamp: current.toISOString(),
            aqi: finalAQI
        });
        
        current.setDate(current.getDate() + 1);
    }
    
    return data;
}

async function loadHistoric() {
    const city = document.getElementById('historic-city').value;
    const from = document.getElementById('historic-from').value;
    const to = document.getElementById('historic-to').value;
    const stats = document.getElementById('historic-stats');

    if (!city) {
        stats.textContent = 'Please select a city';
        stats.className = 'mt-4 text-sm text-slate-600 dark:text-slate-400';
        return;
    }

    stats.textContent = 'Loading historic data...';
    stats.className = 'mt-4 text-sm text-slate-600 dark:text-slate-400';

    // Generate fake data instead of calling API
    const fromDate = from ? from + '-01' : null;
    const toDate = to ? to + '-01' : null;
    const history = generateHistoricAQIData(city, fromDate, toDate);

    renderHistoricChart(history, city);
    const avg = history.length
        ? (history.reduce((a, b) => a + (Number(b.aqi || 0)), 0) / history.length).toFixed(2)
        : 'N/A';
    stats.textContent = `${city} · points: ${history.length} · Avg: ${avg}`;
}

async function generateDeviceForecasts() {
    const deviceSelect = document.getElementById('forecast-device');
    const horizonSelect = document.getElementById('forecast-horizon');
    const statusEl = document.getElementById('forecast-status');
    if (!deviceSelect || !horizonSelect || !statusEl) return;

    const deviceId = deviceSelect.value;
    const horizonDays = parseInt(horizonSelect.value, 10) || 7;

    // Use selected city from predictive dropdown as canonical forecast target
    const citySelect = document.getElementById('predict-city');
    const city = citySelect && citySelect.value ? citySelect.value : DEFAULT_CITY;

    statusEl.textContent = `Fetching forecasts for ${city}...`;
    statusEl.className = 'mt-4 text-sm text-slate-600 dark:text-slate-400';

    const endpoints = [
        { 
            key: 'shortTerm', 
            name: 'Short-term ML', 
            url: `${API_BASE}/api/short_term_forecast`, 
            payload: { city, hours: 48 } 
        },
        { 
            key: 'prophet', 
            name: 'Prophet', 
            url: `${API_BASE}/api/prophet_forecast`, 
            payload: { city, horizon_days: 30 } 
        },
        { 
            key: 'hybrid', 
            name: 'Hybrid Ensemble', 
            url: `${API_BASE}/api/hybrid_forecast`, 
            payload: { city, horizon_months: 12 } 
        }
    ];

    const results = await Promise.all(endpoints.map(async (ep) => {
        const res = await safeFetchJSON(ep.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ep.payload),
            signal: AbortSignal.timeout(8000)
        }, null);
        return { key: ep.key, name: ep.name, data: res };
    }));

    let hasSuccess = false;
    const summaryParts = [];
    results.forEach(r => {
        const series = normalizeForecastSeries(r.data);
        forecastState[r.key] = series;
        if (series.length) {
            hasSuccess = true;
            summaryParts.push(`${r.name} ✓ (${series.length})`);
            if (r.key === 'shortTerm') updateForecastSummaries(series);
        } else {
            forecastState[r.key] = [];
            summaryParts.push(`${r.name} ✗`);
        }
    });

    if (!hasSuccess && FORECAST_FALLBACK.short_term) {
        const synthetic = FORECAST_FALLBACK.short_term.map(p => ({ timestamp: p.ts, aqi: p.aqi }));
        forecastState.shortTerm = normalizeForecastSeries(synthetic);
        updateForecastSummaries(forecastState.shortTerm);
        summaryParts.push('Demo forecast active');
        hasSuccess = true;
    }

    renderForecastComparisonChart();
    statusEl.textContent = summaryParts.join(' · ');
    statusEl.className = 'mt-4 text-sm text-slate-600 dark:text-slate-400';
}

function normalizeForecastSeries(payload) {
    const series = extractForecastArray(payload);
    return series
        .map(point => {
            const isoLabel = resolveForecastIsoLabel(point);
            if (!isoLabel) return null;
            const displayLabel = formatForecastDisplayLabel(isoLabel);
            const rawValue = point.aqi;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return null;
            return { isoLabel, displayLabel, value: Number(value.toFixed(2)) };
        })
        .filter(Boolean)
        .slice(-FORECAST_MAX_POINTS);
}

function extractForecastArray(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.forecast)) return payload.forecast;
    return [];
}

function resolveForecastIsoLabel(point) {
    const raw = point.timestamp || point.ts;
    if (!raw) return null;
    const asDate = new Date(raw);
    if (!Number.isNaN(asDate.getTime())) {
        return asDate.toISOString();
    }
    return typeof raw === 'string' ? raw : null;
}

function formatForecastDisplayLabel(label) {
    const asDate = new Date(label);
    if (!Number.isNaN(asDate.getTime())) {
        return asDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return label;
}

function renderForecastComparisonChart() {
    const canvas = document.getElementById('forecast-comparison-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { labels, datasets } = buildForecastChartData();

    if (!labels.length || !datasets.length) {
        if (charts.forecastComparison) {
            charts.forecastComparison.destroy();
            charts.forecastComparison = null;
        }
        return;
    }

    if (charts.forecastComparison) charts.forecastComparison.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#475569';
    const gridColor = isDark ? '#334155' : '#cbd5f5';

    charts.forecastComparison = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: textColor }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y ?? '—'} AQI`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, maxRotation: 45, minRotation: 0 },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

function buildForecastChartData() {
    const labelMap = new Map();
    Object.values(forecastState).forEach(series => {
        series.forEach(point => {
            if (!labelMap.has(point.isoLabel)) {
                labelMap.set(point.isoLabel, point.displayLabel);
            }
        });
    });

    let isoLabels = Array.from(labelMap.keys()).sort((a, b) => {
        const aTime = new Date(a).getTime();
        const bTime = new Date(b).getTime();
        if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
            return a.localeCompare(b);
        }
        return aTime - bTime;
    });

    if (isoLabels.length > FORECAST_MAX_POINTS) {
        isoLabels = isoLabels.slice(-FORECAST_MAX_POINTS);
    }

    const labels = isoLabels.map(iso => labelMap.get(iso));

    const datasets = Object.keys(FORECAST_SERIES_META).map(key => {
        const series = forecastState[key] || [];
        const meta = FORECAST_SERIES_META[key];
        const data = isoLabels.map(iso => {
            const found = series.find(point => point.isoLabel === iso);
            return found ? found.value : null;
        });
        return {
            label: meta.label,
            data,
            borderColor: meta.color,
            backgroundColor: meta.color + '22',
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            spanGaps: true
        };
    }).filter(dataset => dataset.data.some(value => value !== null));

    return { labels, datasets };
}

function updateForecastSummaries(series) {
    const tomorrowEl = document.getElementById('forecast-tomorrow');
    const weekEl = document.getElementById('forecast-week');
    const threeWeekEl = document.getElementById('forecast-three-weeks');
    if (!tomorrowEl || !weekEl || !threeWeekEl) return;

    if (!series.length) {
        tomorrowEl.textContent = '—';
        weekEl.textContent = '—';
        threeWeekEl.textContent = '—';
        return;
    }

    const values = series.map(point => point.value);
    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : '—');

    tomorrowEl.textContent = values[0] != null ? Math.round(values[0]) : '—';
    weekEl.textContent = avg(values.slice(0, 7));
    threeWeekEl.textContent = avg(values.slice(0, 21));
}

// Manual AQI Prediction (ML) section and handlers have been removed per requirements.

// ==========================
// DEVICE VIEW UPDATES
// ==========================
function updateDeviceView(data, deviceType) {
    const latest = data.latest || {};
    const chart = data.chart || [];
    const prefix = deviceType;

    // Update stat cards with null-safe handling and field mapping
    updateStatCard(`${prefix}-temp`, latest.temperature);
    updateStatCard(`${prefix}-humidity`, latest.humidity);
    // Handle both pm25 and pm2_5
    updateStatCard(`${prefix}-pm25`, latest.pm25 || latest.pm2_5);
    updateStatCard(`${prefix}-pm10`, latest.pm10);
    updateStatCard(`${prefix}-voc`, latest.voc_ppm || latest.voc || latest.voc_index);
    updateStatCard(`${prefix}-pressure`, latest.pressure);
    updateStatCard(`${prefix}-mq135`, latest.mq135 || latest.mq135_raw);

    if (deviceType === 'static') {
        updateStatCard(`${prefix}-co2`, latest.co2);
    }

    // Update charts with historical data from chart[] array
    if (chart.length > 0) {
        updateDeviceChartsFromHistory(chart, deviceType);
    } else {
        // Fallback to single point update
        updateDeviceCharts(latest, deviceType);
    }

    updatePollutantPieChart();
}

function updateStatCard(id, value) {
    const el = document.getElementById(id);
    if (el) {
        if (value !== null && value !== undefined && !isNaN(value)) {
            el.textContent = parseFloat(value).toFixed(1);
        } else {
            el.textContent = '—';
        }
    }
}

// ==========================
// CHARTS
// ==========================
function initializeCharts() {
    // Portable charts - initialize empty, will populate when device check is clicked
    const portableTempCtx = document.getElementById('portable-temp-chart')?.getContext('2d');
    if (portableTempCtx) {
        charts.portable.temp = new Chart(portableTempCtx, getChartConfig('Temperature (°C)', '#3b82f6'));
    }

    const portablePmCtx = document.getElementById('portable-pm-chart')?.getContext('2d');
    if (portablePmCtx) {
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#e2e8f0' : '#64748b';
        const tickColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        const bgColor = isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)';

        charts.portable.pm = new Chart(portablePmCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: 'PM2.5', data: [], borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', tension: 0.4, fill: true },
                    { label: 'PM10', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: 0.4, fill: true }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Fixed: Prevent chart from growing infinitely
                backgroundColor: bgColor, // Fixed: Dark background for charts
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: 10
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: textColor },
                        display: true
                    }
                },
                scales: {
                    x: {
                        ticks: { color: tickColor, maxRotation: 45, minRotation: 0 },
                        grid: { color: gridColor, drawBorder: true, borderColor: gridColor }
                    },
                    y: {
                        ticks: { color: tickColor },
                        grid: { color: gridColor, drawBorder: true, borderColor: gridColor }
                    }
                }
            }
        });
    }

    // Static charts - initialize empty
    const staticTempCtx = document.getElementById('static-temp-chart')?.getContext('2d');
    if (staticTempCtx) {
        charts.static.temp = new Chart(staticTempCtx, getChartConfig('Temperature (°C)', '#3b82f6'));
    }
    
    // Initialize pie chart
    updatePollutantPieChart();

    const staticGasCtx = document.getElementById('static-gas-chart')?.getContext('2d');
    if (staticGasCtx) {
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#e2e8f0' : '#64748b';
        const tickColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        const bgColor = isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)';

        charts.static.gas = new Chart(staticGasCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: 'CO₂', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.4, fill: true },
                    { label: 'VOC', data: [], borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', tension: 0.4, fill: true },
                    { label: 'PM2.5', data: [], borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', tension: 0.4, fill: true }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Fixed: Prevent chart from growing infinitely
                backgroundColor: bgColor, // Fixed: Dark background for charts
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: 10
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: textColor },
                        display: true
                    }
                },
                scales: {
                    x: {
                        ticks: { color: tickColor, maxRotation: 45, minRotation: 0 },
                        grid: { color: gridColor, drawBorder: true, borderColor: gridColor }
                    },
                    y: {
                        ticks: { color: tickColor },
                        grid: { color: gridColor, drawBorder: true, borderColor: gridColor }
                    }
                }
            }
        });
    }
}

function getChartConfig(label, color) {
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#64748b';
    const tickColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const bgColor = isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)';

    return {
        type: 'line',
        data: { labels: [], datasets: [{ label, data: [], borderColor: color, backgroundColor: color + '20', tension: 0.4, fill: true }] },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Fixed: Prevent chart from growing infinitely
            backgroundColor: bgColor, // Fixed: Dark background for charts
            layout: {
                padding: {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                }
            },
            plugins: {
                legend: {
                    labels: { color: textColor },
                    display: true
                }
            },
            scales: {
                x: {
                    ticks: { color: tickColor, maxRotation: 45, minRotation: 0 },
                    grid: { color: gridColor, drawBorder: true, borderColor: gridColor }
                },
                y: {
                    ticks: { color: tickColor },
                    grid: { color: gridColor, drawBorder: true, borderColor: gridColor }
                }
            }
        }
    };
}

function updateDeviceCharts(latest, deviceType) {
    const now = new Date().toLocaleTimeString();
    const data = chartData[deviceType];

    // Add to buffers
    data.timestamps.push(now);
    data.temp.push(latest.temperature || null);
    data.pm25.push(latest.pm25 || null);
    data.pm10.push(latest.pm10 || null);

    if (deviceType === 'static') {
        data.co2.push(latest.co2 || null);
        data.voc.push(latest.voc_ppm || latest.voc || null);
    }

    // Trim buffers
    Object.keys(data).forEach(key => {
        if (data[key].length > CHART_BUFFER_SIZE) {
            data[key] = data[key].slice(-CHART_BUFFER_SIZE);
        }
    });

    // Update portable charts
    if (deviceType === 'portable') {
        if (charts.portable.temp) {
            charts.portable.temp.data.labels = data.timestamps;
            charts.portable.temp.data.datasets[0].data = data.temp;
            charts.portable.temp.update('none');
        }
        if (charts.portable.pm) {
            charts.portable.pm.data.labels = data.timestamps;
            charts.portable.pm.data.datasets[0].data = data.pm25;
            charts.portable.pm.data.datasets[1].data = data.pm10;
            charts.portable.pm.update('none');
        }
    }

    // Update static charts
    if (deviceType === 'static') {
        if (charts.static.temp) {
            charts.static.temp.data.labels = data.timestamps;
            charts.static.temp.data.datasets[0].data = data.temp;
            charts.static.temp.update('none');
        }
        if (charts.static.gas) {
            charts.static.gas.data.labels = data.timestamps;
            charts.static.gas.data.datasets[0].data = data.co2;
            charts.static.gas.data.datasets[1].data = data.voc;
            charts.static.gas.data.datasets[2].data = data.pm25;
            charts.static.gas.update('none');
        }
    }
}

function renderPredictChart(forecast, city) {
    const ctx = document.getElementById('predict-chart')?.getContext('2d');
    if (!ctx) return;

    const labels = (forecast || []).map(d => d.timestamp || d.ts || d.date || d.ds);
    const values = (forecast || []).map(d => Number(d.aqi ?? d.predicted_aqi ?? d.yhat));

    if (charts.predict) charts.predict.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#64748b';
    const tickColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    charts.predict = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `Forecast — ${city}`,
                data: values,
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.25,
                fill: true,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textColor }
                }
            },
            scales: {
                x: {
                    ticks: { color: tickColor },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: { color: tickColor },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

function renderHistoricChart(history, city) {
    currentHistoricData = history || [];
    currentHistoricCity = city || '';
    updateHistoricChartType();
}

function updateHistoricChartType() {
    const ctx = document.getElementById('historic-chart')?.getContext('2d');
    if (!ctx || !currentHistoricData.length) return;

    // Format labels - show dates nicely
    const labels = currentHistoricData.map(d => {
        const date = new Date(d.timestamp || d.date || d.ds || d.ts);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    });
    const dataPoints = currentHistoricData.map(d => Number(d.aqi ?? d.yhat ?? d.predicted_aqi));

    if (charts.historic) charts.historic.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#64748b';
    const tickColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const bgColor = isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)';

    // Update button states
    document.getElementById('historic-toggle-line')?.classList.toggle('bg-blue-600', historicChartType === 'line');
    document.getElementById('historic-toggle-line')?.classList.toggle('text-white', historicChartType === 'line');
    document.getElementById('historic-toggle-line')?.classList.toggle('bg-slate-200', historicChartType !== 'line');
    document.getElementById('historic-toggle-line')?.classList.toggle('dark:bg-slate-700', historicChartType !== 'line');
    
    document.getElementById('historic-toggle-bar')?.classList.toggle('bg-blue-600', historicChartType === 'bar');
    document.getElementById('historic-toggle-bar')?.classList.toggle('text-white', historicChartType === 'bar');
    document.getElementById('historic-toggle-bar')?.classList.toggle('bg-slate-200', historicChartType !== 'bar');
    document.getElementById('historic-toggle-bar')?.classList.toggle('dark:bg-slate-700', historicChartType !== 'bar');
    
    document.getElementById('historic-toggle-area')?.classList.toggle('bg-blue-600', historicChartType === 'area');
    document.getElementById('historic-toggle-area')?.classList.toggle('text-white', historicChartType === 'area');
    document.getElementById('historic-toggle-area')?.classList.toggle('bg-slate-200', historicChartType !== 'area');
    document.getElementById('historic-toggle-area')?.classList.toggle('dark:bg-slate-700', historicChartType !== 'area');
    
    document.getElementById('historic-toggle-scatter')?.classList.toggle('bg-blue-600', historicChartType === 'scatter');
    document.getElementById('historic-toggle-scatter')?.classList.toggle('text-white', historicChartType === 'scatter');
    document.getElementById('historic-toggle-scatter')?.classList.toggle('bg-slate-200', historicChartType !== 'scatter');
    document.getElementById('historic-toggle-scatter')?.classList.toggle('dark:bg-slate-700', historicChartType !== 'scatter');

    const isArea = historicChartType === 'area';
    const isScatter = historicChartType === 'scatter';
    const isBar = historicChartType === 'bar';

    // For scatter, use line chart with pointRadius > 0 to simulate scatter
    const chartType = isBar ? 'bar' : 'line';
    
    charts.historic = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: `${currentHistoricCity}`,
                data: dataPoints,
                borderColor: '#3b82f6',
                backgroundColor: isBar ? 'rgba(59, 130, 246, 0.6)' : (isArea ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.1)'),
                tension: isScatter ? 0 : 0.25,
                fill: isArea,
                borderWidth: isScatter ? 0 : 2,
                pointRadius: isScatter ? 4 : (isBar ? 0 : 2),
                pointHoverRadius: isScatter ? 6 : 4,
                showLine: !isScatter
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            backgroundColor: bgColor,
            layout: {
                padding: {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                }
            },
            plugins: {
                legend: {
                    labels: { color: textColor }
                }
            },
            scales: {
                x: {
                    ticks: { color: tickColor, maxRotation: 45, minRotation: 0 },
                    grid: { color: gridColor, drawBorder: true, borderColor: gridColor }
                },
                y: {
                    ticks: { color: tickColor },
                    grid: { color: gridColor, drawBorder: true, borderColor: gridColor }
                }
            }
        }
    });
}

// ==========================
// MAPS
// ==========================
function initializeMaps() {
    // Maps removed for demo mode; no-op to keep calls safe
    return;
}

function updateMap(lat, lon, deviceType) {
    // Maps removed
    return;
}

// ==========================
// UTILITIES
// ==========================
function getAQICategory(aqi) {
    if (!aqi || isNaN(aqi)) return 'Unavailable';
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
}

function updateAQIColor(element, aqi) {
    if (!aqi || isNaN(aqi)) {
        element.className = 'text-5xl font-bold text-slate-900 mb-2';
        return;
    }

    let color = 'slate-900';
    if (aqi <= 50) color = 'green-600';
    else if (aqi <= 100) color = 'yellow-600';
    else if (aqi <= 150) color = 'orange-600';
    else if (aqi <= 200) color = 'red-600';
    else if (aqi <= 300) color = 'purple-600';
    else color = 'gray-800';

    element.className = `text-5xl font-bold text-${color} mb-2`;
}

function updateConnectionStatus(connected) {
    // Hide connection status completely for demo
    const status = document.getElementById('connection-status');
    if (!status) return;
    status.style.display = 'none';
}

// Demo sensor UI updaters
function updatePortableUI(data) {
    updateStatCard('portable-temp', data.temperature);
    updateStatCard('portable-humidity', data.humidity);
    updateStatCard('portable-pm25', data.pm25);
    updateStatCard('portable-pm10', data.pm10);
    updateStatCard('portable-voc', data.voc);
    updateStatCard('portable-pressure', data.pressure);
    updateStatCard('portable-mq135', data.mq135);
}

function updateStaticUI(data) {
    updateStatCard('static-temp', data.temperature);
    updateStatCard('static-humidity', data.humidity);
    updateStatCard('static-co2', data.co2);
    updateStatCard('static-pm25', data.pm25);
    updateStatCard('static-pm10', data.pm10);
    updateStatCard('static-voc', data.voc);
    updateStatCard('static-pressure', data.pressure);
    updateStatCard('static-mq135', data.mq135);
}

let pollutantPieChart = null;
function createPollutantPieChart(data) {
    const canvas = document.getElementById('pollutantPie');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (pollutantPieChart) pollutantPieChart.destroy();
    
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#64748b';
    
    pollutantPieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['PM2.5','PM10','VOC','CO₂','Other'],
            datasets: [{
                data: data,
                backgroundColor: ['#FF6384','#36A2EB','#FFCE56','#AA66CC','#4BC0C0']
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textColor }
                }
            }
        }
    });
}

function updatePollutantPieChart() {
    // Only update if demo is active
    if (!DEMO_ACTIVE) {
        // Initialize empty pie chart
        const canvas = document.getElementById('pollutantPie');
        if (canvas && !pollutantPieChart) {
            createPollutantPieChart([1, 1, 1, 1, 1]);
        }
        return;
    }
    
    // Get current device type
    const deviceType = currentDevice || 'portable';
    const pm25El = document.getElementById(`${deviceType}-pm25`);
    const pm10El = document.getElementById(`${deviceType}-pm10`);
    const vocEl = document.getElementById(`${deviceType}-voc`);
    const co2El = document.getElementById('static-co2');
    
    const pm25 = parseFloat(pm25El?.textContent || 0);
    const pm10 = parseFloat(pm10El?.textContent || 0);
    const voc = parseFloat(vocEl?.textContent || 0);
    const co2 = parseFloat(co2El?.textContent || 0) || 0;
    
    // Normalize values for pie chart
    let arr = [pm25, pm10, voc * 10, co2 / 10, 1];
    if (arr.reduce((a,b)=>a+b,0) === 0) { 
        arr = [1,1,1,1,1]; 
    }
    createPollutantPieChart(arr);
}

function startDemoSensors(city = 'bangalore') {
    if (DEMO_ACTIVE) return;
    const basePortable = SENSOR_DEMO_BASES[city]?.portable || SENSOR_DEMO_BASES.bangalore.portable;
    const baseStatic = SENSOR_DEMO_BASES[city]?.static || SENSOR_DEMO_BASES.bangalore.static;
    DEMO_ACTIVE = true;
    
    // Initialize current sensor values from base
    let currentPortable = { ...basePortable };
    let currentStatic = { ...baseStatic };
    
    const runTick = () => {
        // Update portable values with slow changes
        currentPortable = {
            temperature: jitter(currentPortable.temperature),
            humidity: jitter(currentPortable.humidity),
            pm25: Math.max(0, Math.round(jitter(currentPortable.pm25))),
            pm10: Math.max(0, Math.round(jitter(currentPortable.pm10))),
            voc: Math.round(jitter(currentPortable.voc, 0.01, 0.05) * 10) / 10,
            pressure: Math.round(jitter(currentPortable.pressure, 0.5, 1)),
            mq135: Math.round(jitter(currentPortable.mq135, 1, 5))
        };
        
        // Update static values with slow changes
        currentStatic = {
            temperature: jitter(currentStatic.temperature),
            humidity: jitter(currentStatic.humidity),
            co2: Math.max(300, Math.round(jitter(currentStatic.co2, 1, 5))),
            pm25: Math.max(0, Math.round(jitter(currentStatic.pm25))),
            pm10: Math.max(0, Math.round(jitter(currentStatic.pm10))),
            voc: Math.round(jitter(currentStatic.voc, 0.01, 0.05) * 10) / 10,
            pressure: Math.round(jitter(currentStatic.pressure, 0.5, 1)),
            mq135: Math.round(jitter(currentStatic.mq135, 1, 5))
        };
        
        updatePortableUI(currentPortable);
        updateStaticUI(currentStatic);
        
        // Update charts with new data
        updateDeviceCharts(currentPortable, 'portable');
        updateDeviceCharts(currentStatic, 'static');
        updatePollutantPieChart();
    };
    runTick();
    demoIntervalId = setInterval(runTick, 30 * 1000);
}

function stopDemoSensors() {
    if (!DEMO_ACTIVE) return;
    clearInterval(demoIntervalId);
    demoIntervalId = null;
    DEMO_ACTIVE = false;
}

// Show sensor charts when device check is activated
function showSensorCharts() {
    const chartContainers = document.querySelectorAll('#device-portable .relative, #device-static .relative, #pollutantPie').forEach(container => {
        if (container) container.style.display = 'block';
    });
}

// Hide sensor charts when device check is deactivated
function hideSensorCharts() {
    // Don't actually hide, just clear data
    // Charts will show empty/placeholder state
}

async function postJSON(url, body, timeout = 6000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
            'Content-Type': 'application/json',
            ...(API_KEY && API_KEY !== 'YOUR_API_KEY_HERE' ? { 'x-api-key': API_KEY } : {})
        },
        body: JSON.stringify(body)
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
        let message = response.statusText;
        try {
            const text = await response.text();
            if (text) {
                message = text;
            }
        } catch (_) {
            // ignore text parse failure
        }
        throw new Error(message || `HTTP ${response.status}`);
    }

    return response.json();
}

function startAutoRefresh() {
    if (refreshIntervalId) clearInterval(refreshIntervalId);

    refreshIntervalId = setInterval(() => {
        fetchDeviceData(DEVICE_IDS.portable, 'portable');
        fetchDeviceData(DEVICE_IDS.static, 'static');
    }, REFRESH_INTERVAL);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600',
        info: 'bg-blue-600'
    };

    toast.className = `${colors[type] || colors.info} text-white px-6 py-3 rounded-lg shadow-lg`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => container.removeChild(toast), 300);
    }, 5000);
}
