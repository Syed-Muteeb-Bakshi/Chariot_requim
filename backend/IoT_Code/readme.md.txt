LIBRARIES TO INSTALL ON LAB PC (don’t forget this!)
Search & install in Arduino IDE:

✔ Adafruit BME680
✔ Adafruit Unified Sensor
✔ Adafruit GFX
✔ Adafruit SSD1306
✔ TinyGPSPlus
✔ DHT sensor library
✔ ArduinoJson (version 6)

ESP32 board support:

Boards Manager → esp32 → Install

windows uart port driver link : https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads



# 🌬️ Vento Aureo – IoT Firmware  
### **Air Quality Intelligence Platform – IoT Node Software**

This repository contains the full firmware and documentation for the **Portable Air Quality Device (PORTABLE-01)** and the **Static Air Quality Station (Vento-Station-01)** used in the Vento Aureo project.

Vento Aureo is an end-to-end Air Quality Intelligence Platform featuring:

- ESP32-based IoT sensors  
- Flask backend deployed on Google Cloud Run  
- PostgreSQL (Cloud SQL) storage  
- Real-time visualization dashboard  
- Machine Learning forecasting models (Prophet + LSTM)  

This repo contains ONLY the IoT device firmware for ESP32.

---

# 📡 Device Overviews

## 1️⃣ Portable Device – `PORTABLE-01`
Compact ESP32-based AQI monitor with:
- **BMP280/BME280** – Temperature, Pressure (Humidity optional)
- **MQ135** – VOC / gas resistance
- **CH20 (DFRobot)** – VOC levels (optional)
- **NEO-6M (optional)** – GPS location
- **SSD1306 OLED** – Live display
- **SPIFFS queue** – Offline storage (max 50 samples)
- **Wi-Fi uploads** → Google Cloud Run

**Firmware file:**  
👉 `portable_device/portable_final.ino`

--- 

## 2️⃣ Static Station – `Vento-Station-01`
Full-featured ESP32 air quality station with:
- **PMS7003** – PM2.5 / PM10 (laser dust sensor)
- **MH-Z19E** – CO₂ sensor (NDIR)
- **BME680** – Temperature, Humidity, Pressure, VOC gas
- **DHT11** – Backup humidity / temp
- **MQ135** – VOC gas
- **NEO-6M** – GPS
- **SSD1306 OLED** – Real-time screen
- **SPIFFS queue** – Offline storage
- POSTS JSON every 30–60 seconds to Cloud Run

**Firmware file:**  
👉 `static_device/static_station_full.ino`

---

# 🔌 Wiring Diagrams (Text Form)

Below are the exact GPIO connections used.

---

## 🔹 Portable Device Wiring (PORTABLE-01)

### ➤ **OLED (SSD1306)**
VCC → 3.3V
GND → GND
SDA → GPIO21
SCL → GPIO22

markdown
Copy code

### ➤ **BMP280/BME280**
VCC → 3.3V
GND → GND
SDA → GPIO21
SCL → GPIO22

markdown
Copy code

### ➤ **MQ135**
AOUT → GPIO34
VCC → 5V
GND → GND

markdown
Copy code

### ➤ **CH20 (optional)**
AOUT → GPIO35
VCC → 5V
GND → GND

markdown
Copy code

### ➤ **GPS (NEO-6M) – optional**
TX → GPIO14
RX → GPIO27
VCC → 5V
GND → GND

yaml
Copy code

---

## 🔹 Static Station Wiring (Vento-Station-01)

### ➤ **OLED SSD1306**
VCC → 3.3V
GND → GND
SDA → GPIO21
SCL → GPIO22

markdown
Copy code

### ➤ **BME680**
VCC → 3.3V
GND → GND
SDA → GPIO21
SCL → GPIO22

markdown
Copy code

### ➤ **PMS7003 (PM2.5/PM10)**
TX → GPIO16 (ESP32 RX2)
RX → GPIO17 (ESP32 TX2)
VCC → 5V
GND → GND
SET → 3.3V (optional)
RESET → 3.3V (optional)

markdown
Copy code

### ➤ **MH-Z19E (CO₂)**
TX → GPIO4 (ESP32 RX)
RX → GPIO5 (ESP32 TX)
VCC → 5V
GND → GND

markdown
Copy code

### ➤ **MQ135**
AOUT → GPIO34
VCC → 5V
GND → GND

markdown
Copy code

### ➤ **DHT11**
DATA → GPIO13
VCC → 3.3V
GND → GND

markdown
Copy code

### ➤ **GPS (NEO-6M)**
TX → GPIO14
RX → GPIO27
VCC → 5V
GND → GND

yaml
Copy code

❗ **IMPORTANT:**  
Provide external 5V power when using PMS7003 + MH-Z19E + GPS simultaneously.  
Share GND with ESP32.

---

# 🔧 Arduino IDE Setup Instructions

## 1️⃣ Install ESP32 Board Support
In Arduino IDE:

File → Preferences → Additional Boards Manager URLs:
https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json

makefile
Copy code

Then:

Tools → Board → Boards Manager → Search "esp32" → Install

yaml
Copy code

---

# 📚 Required Arduino Libraries

Install these from **Sketch → Include Library → Manage Libraries**:

### ✔ ESP32 Core Libraries (auto-installed):
- WiFi
- SPIFFS
- HTTPClient
- WiFiClientSecure

### ✔ Third-Party Libraries:
| Library | Purpose |
|--------|----------|
| **Adafruit SDD1306** | OLED display |
| **Adafruit GFX** | OLED graphics |
| **Adafruit Sensor** | Unified sensor driver |
| **Adafruit BME680** | BME680 support |
| **TinyGPSPlus** | GPS parsing |
| **DHT Sensor Library** | DHT11 readings |
| **ArduinoJson (v6)** | JSON encoding |
| **Adafruit BusIO** | Needed by Adafruit libs |

---

# 🚀 Uploading Firmware to ESP32

## STEP 1 — Connect ESP32 via USB  
Use a cable that supports **data** (not just charging).

## STEP 2 — Select board
Tools → Board → ESP32 Dev Module

shell
Copy code

## STEP 3 — Select COM port
Tools → Port → COMX (your ESP32)

markdown
Copy code

## STEP 4 — Upload (BOOT button method)
If upload fails:

1. Hold **BOOT** button  
2. Click **Upload**  
3. Release BOOT when you see:  Uploading...


🆘 Troubleshooting
❌ "Failed to connect to ESP32" during upload

→ Disconnect PMS7003, MH-Z19E, GPS
→ Hold BOOT during upload
→ Release when “Connecting…” appears

❌ WiFi stuck: wifi: sta is connecting, cannot set config

→ Upload wifi_reset_utility.ino (provided)
→ Power cycle
→ Upload firmware again

❌ No PM2.5/PM10 readings

→ PMS7003 TX must go to ESP32 RX2 (GPIO16)
→ PMS needs clean 5V and airflow
→ Wait 5–10 seconds after boot

❌ CO₂ always -1

→ MH-Z19E wired incorrectly (TX/RX swapped)


# Vento Aureo – IoT Device Firmware

This repository contains the firmware for the IoT devices used in the
Vento Aureo Air Quality Intelligence Platform.

## Devices

### 1. Portable Device (PORTABLE-01)
Sensors:
- BMP280/BME280
- MQ135
- CH20
- GPS (optional)
- SSD1306 OLED

Firmware:
- `/portable_device/portable_final.ino`

### 2. Static Station (Vento-Station-01)
Sensors:
- PMS7003 (PM2.5/PM10)
- MH-Z19E (CO2)
- BME680 (Temp/Humidity/Pressure/VOC)
- DHT11
- MQ135
- GPS NEO-6M
- SSD1306 OLED

Firmware:
- `/static_device/static_station_full.ino`

## Cloud

Backend endpoint:
POST https://vento-backend-678919375946.us-east1.run.app/api/upload_sensor

arduino
Copy code

Devices automatically upload readings every 30–60 seconds.  
If WiFi is offline, readings are stored in SPIFFS queue and uploaded later.
