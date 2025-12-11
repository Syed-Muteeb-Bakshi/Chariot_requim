/* static_station_full.ino
   Vento Aureo - Static Station (Vento-Station-01)
   Sensors:
    - PMS7003 (UART2)  RX2=16 TX2=17
    - MH-Z19E (UART1)  RX1=4  TX1=5
    - BME680 (I2C)     SDA=21 SCL=22
    - DHT11            DATA=13
    - MQ135            AOUT=34
    - GPS (NEO-6M)     RX=14 TX=27 (UART0)
    - SSD1306 OLED     I2C 21/22
   Features:
    - WiFi (JioFiber-2.4 Syed)
    - NTP time
    - SPIFFS queue (max 50)
    - POST JSON to Cloud Run endpoint
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <SPIFFS.h>
#include <Wire.h>
#include <time.h>

#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <Adafruit_SSD1306.h>
#include <TinyGPSPlus.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ---------------- PIN CONFIG ----------------
#define I2C_SDA 21
#define I2C_SCL 22

// OLED
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire);

// BME680
Adafruit_BME680 bme;
bool haveBME = false;

// DHT11
#define DHTPIN 13
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// MQ135
const int MQ135_PIN = 34;

// PMS7003 UART2
HardwareSerial PMS(2); // RX2=16, TX2=17

// MH-Z19E UART1
HardwareSerial MHZ(1); // RX1=4, TX1=5

// GPS UART0 (pins 14/27)
HardwareSerial GPSSerial(0);
TinyGPSPlus gps;

// ---------------- WiFi (use your stable 2.4GHz SSID) -------------
const char* ssids[] = { "JioFiber-2.4 Syed" };
const char* passwords[] = { "Pa$$w0rd@123" };
const int WIFI_COUNT = 1;

// Cloud endpoint
const char* CLOUD_URL = "https://vento-backend-678919375946.us-east1.run.app/api/upload_sensor";

// NTP
const char* ntpServer = "pool.ntp.org";
const long gmtOffset = 19800; // IST
const int daylightOffset = 0;

// SPIFFS queue
const char* QUEUE_FILE = "/queue_static_queue.txt";
const int MAX_QUEUE = 50;

// Timing
unsigned long lastSampleMs = 0;
const unsigned long SAMPLE_INTERVAL_MS = 60000UL; // 60s; reduce for demo
unsigned long lastWifiAttemptMs = 0;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000UL; // 10s backoff

// ---------------- Prototypes ----------------
bool initSPIFFS();
bool wifiConnect();
String getISOTime();
bool enqueueSample(const String &line);
bool flushQueue();
int queueCount();
int sendJSON(const String &jsonPayload);
bool readPMS(int &pm25, int &pm10);
int readMHZ19();

// ---------------- Setup ----------------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n--- Vento Station Boot ---");

  // I2C
  Wire.begin(I2C_SDA, I2C_SCL);

  // OLED init
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("OLED init failed");
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0,0);
    display.println("Vento Station Booting...");
    display.display();
  }

  // BME680 init
  if (bme.begin()) {
    haveBME = true;
    // recommended oversampling and heater settings
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150);
    Serial.println("BME680 found");
  } else {
    Serial.println("BME680 NOT found");
  }

  // DHT
  dht.begin();

  // UARTs
  PMS.begin(9600, SERIAL_8N1, 16, 17);  // PMS7003
  MHZ.begin(9600, SERIAL_8N1, 4, 5);    // MH-Z19E
  GPSSerial.begin(9600, SERIAL_8N1, 14, 27); // GPS
  Serial.println("UARTs started");

  // SPIFFS
  if (!initSPIFFS()) Serial.println("SPIFFS init failed");

  // NTP (non-blocking)
  configTime(gmtOffset, daylightOffset, ntpServer);

  // WiFi initial attempt
  wifiConnect();

  lastSampleMs = millis() - 5000;
}

// ---------------- Loop ----------------
void loop() {
  // feed GPS
  while (GPSSerial.available()) gps.encode(GPSSerial.read());

  // flush queue if online
  if (WiFi.status() == WL_CONNECTED) {
    flushQueue();
  } else {
    // reconnect attempt with backoff
    if (millis() - lastWifiAttemptMs > WIFI_RETRY_INTERVAL_MS) {
      wifiConnect();
    }
  }

  // sample interval
  if (millis() - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = millis();

    // Measurements variables
    float bme_temp = NAN;
    float bme_hum = NAN;
    float bme_pres = NAN;
    int bme_gas = -1;
    if (haveBME) {
      if (bme.performReading()) {
        bme_temp = bme.temperature;
        bme_hum = bme.humidity;
        bme_pres = bme.pressure / 100.0F;
        bme_gas = (int)bme.gas_resistance;
      } else {
        Serial.println("BME read failed");
      }
    }

    // DHT11 fallback
    float dht_t = dht.readTemperature();
    float dht_h = dht.readHumidity();
    if (isnan(dht_t)) dht_t = NAN;
    if (isnan(dht_h)) dht_h = NAN;

    // MQ135 analog
    int mq = analogRead(MQ135_PIN);

    // PMS7003
    int pm25 = -1, pm10 = -1;
    bool pms_ok = readPMS(pm25, pm10);

    // MH-Z19E CO2
    int co2 = readMHZ19(); // returns -1 if no reading

    // GPS
    bool haveGPS = gps.location.isValid();
    double lat = haveGPS ? gps.location.lat() : 0.0;
    double lon = haveGPS ? gps.location.lng() : 0.0;

    // timestamp
    String iso = getISOTime();

    // Build JSON payload
    StaticJsonDocument<1024> doc;
    doc["device_id"] = "Vento-Station-01";
    doc["device_type"] = "stationary";
    doc["city"] = "Banglore";
    if (iso.length()) doc["timestamp"] = iso;

    // top-level fields if present
    if (pms_ok && pm25 >= 0) doc["pm25"] = pm25;
    if (pms_ok && pm10 >= 0) doc["pm10"] = pm10;
    if (co2 >= 0) doc["co2"] = co2;
    if (!isnan(bme_temp)) doc["temperature"] = bme_temp;
    if (!isnan(bme_hum)) doc["humidity"] = bme_hum;
    if (bme_gas >= 0) doc["voc_ppm"] = bme_gas;

    // GPS nested
    if (haveGPS) {
      JsonObject g = doc.createNestedObject("gps");
      g["lat"] = lat;
      g["lon"] = lon;
    }

    // measurements JSON for raw values
    JsonObject meas = doc.createNestedObject("measurements");
    meas["mq135_raw"] = mq;
    if (bme_gas >= 0) meas["bme_gas"] = bme_gas;
    if (!isnan(bme_temp)) meas["bme_temp"] = bme_temp;
    if (!isnan(bme_hum)) meas["bme_hum"] = bme_hum;
    if (!isnan(bme_pres)) meas["bme_pres"] = bme_pres;
    if (pms_ok) {
      meas["pm25_raw"] = pm25;
      meas["pm10_raw"] = pm10;
    }
    if (co2 >= 0) meas["co2_ppm"] = co2;
    if (!isnan(dht_t)) meas["dht_t"] = dht_t;
    if (!isnan(dht_h)) meas["dht_h"] = dht_h;

    String payload;
    serializeJson(doc, payload);

    Serial.println("Payload:");
    Serial.println(payload);

    // Try upload or queue
    if (WiFi.status() == WL_CONNECTED) {
      int code = sendJSON(payload);
      if (code >= 200 && code < 300) {
        Serial.printf("Upload OK (%d)\n", code);
        display.clearDisplay();
        display.setCursor(0,0);
        display.setTextSize(1);
        if (!isnan(bme_temp)) display.printf("T:%.1fC H:%.1f%%\n", bme_temp, bme_hum);
        else display.printf("T:-- H:--\n");
        display.printf("PM2.5:%d CO2:%d\n", pm25>=0?pm25:0, co2>=0?co2:0);
        display.display();
      } else {
        Serial.printf("Upload failed -> queue (HTTP %d)\n", code);
        enqueueSample(payload);
      }
    } else {
      Serial.println("No WiFi -> queued");
      enqueueSample(payload);
    }
  } // end sample

  delay(10);
}

// ---------------- WiFi Connect (guarded) ----------------
bool wifiConnect() {
  if (WiFi.status() == WL_CONNECTED) return true;

  unsigned long now = millis();
  if (now - lastWifiAttemptMs < WIFI_RETRY_INTERVAL_MS) {
    Serial.println("Skipping WiFi.begin() - backoff");
    return false;
  }
  lastWifiAttemptMs = now;

  Serial.println("Trying WiFi...");
  WiFi.mode(WIFI_STA);

  for (int i = 0; i < WIFI_COUNT; i++) {
    Serial.printf("Connect -> %s\n", ssids[i]);
    WiFi.disconnect(true, true);
    delay(200);
    WiFi.begin(ssids[i], passwords[i]);

    unsigned long start = millis();
    while (millis() - start < 10000) {
      if (WiFi.status() == WL_CONNECTED) break;
      delay(200);
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("Connected: ");
      Serial.println(ssids[i]);
      display.clearDisplay();
      display.setCursor(0,0);
      display.printf("WiFi OK\n%s\nIP:%s\n", ssids[i], WiFi.localIP().toString().c_str());
      display.display();
      return true;
    }
    Serial.printf("Failed: %s\n", ssids[i]);
  }
  Serial.println("All WiFi failed");
  return false;
}

// ---------------- SPIFFS queue helpers ----------------
bool initSPIFFS() {
  if (!SPIFFS.begin(true)) return false;
  if (!SPIFFS.exists(QUEUE_FILE)) {
    File f = SPIFFS.open(QUEUE_FILE, FILE_WRITE);
    if (f) f.close();
  }
  return true;
}

bool enqueueSample(const String &line) {
  int c = queueCount();
  if (c >= MAX_QUEUE) {
    // drop oldest
    File f = SPIFFS.open(QUEUE_FILE, FILE_READ);
    if (!f) return false;
    std::vector<String> lines;
    while (f.available()) {
      String ln = f.readStringUntil('\n');
      if (ln.length()) lines.push_back(ln);
    }
    f.close();
    if (lines.size()) lines.erase(lines.begin());
    lines.push_back(line);
    File w = SPIFFS.open(QUEUE_FILE, FILE_WRITE);
    if (!w) return false;
    for (auto &s : lines) w.println(s);
    w.close();
    return true;
  } else {
    File f = SPIFFS.open(QUEUE_FILE, FILE_APPEND);
    if (!f) return false;
    f.println(line);
    f.close();
    return true;
  }
}

int queueCount() {
  File f = SPIFFS.open(QUEUE_FILE, FILE_READ);
  if (!f) return 0;
  int cnt = 0;
  while (f.available()) {
    String ln = f.readStringUntil('\n');
    if (ln.length()) cnt++;
  }
  f.close();
  return cnt;
}

bool flushQueue() {
  File f = SPIFFS.open(QUEUE_FILE, FILE_READ);
  if (!f) return false;
  std::vector<String> lines;
  while (f.available()) {
    String ln = f.readStringUntil('\n');
    if (ln.length()) lines.push_back(ln);
  }
  f.close();

  if (lines.empty()) return true;

  size_t idx = 0;
  for (; idx < lines.size(); idx++) {
    int code = sendJSON(lines[idx]);
    if (!(code >= 200 && code < 300)) break;
  }

  File w = SPIFFS.open(QUEUE_FILE, FILE_WRITE);
  if (!w) return false;
  for (size_t i = idx; i < lines.size(); i++) w.println(lines[i]);
  w.close();

  return (idx == lines.size());
}

// ---------------- HTTP POST ----------------
int sendJSON(const String &jsonPayload) {
  WiFiClientSecure client;
  client.setInsecure(); // trust all certs (ok for student demo)
  HTTPClient http;
  http.begin(client, CLOUD_URL);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST((uint8_t*)jsonPayload.c_str(), jsonPayload.length());
  String resp = "";
  if (code > 0) resp = http.getString();
  Serial.printf("HTTP %d -> %s\n", code, resp.c_str());
  http.end();
  return code;
}

// ---------------- PMS7003 parser ----------------
bool readPMS(int &pm25, int &pm10) {
  pm25 = -1; pm10 = -1;
  // Need at least header (2) + length (2) + payload 24 + checksum 2 = 30
  if (PMS.available() < 32) return false;

  // find header 0x42 0x4d
  while (PMS.available() >= 32) {
    int h1 = PMS.read();
    if (h1 != 0x42) continue;
    int h2 = PMS.read();
    if (h2 != 0x4d) continue;
    uint8_t frame[30];
    if (PMS.readBytes(frame, 30) == 30) {
      int checksum = 0x42 + 0x4d;
      for (int i = 0; i < 28; i++) checksum += frame[i];
      int frameChk = (frame[28] << 8) | frame[29];
      if (checksum == frameChk) {
        pm10 = (frame[6] << 8) | frame[7];
        pm25 = (frame[8] << 8) | frame[9];
        return true;
      } else {
        Serial.println("PMS checksum fail");
        return false;
      }
    } else {
      return false;
    }
  }
  return false;
}

// ---------------- MH-Z19 read ----------------
int readMHZ19() {
  // request CO2 (read command)
  uint8_t cmd[9] = {0xFF,0x01,0x86,0,0,0,0,0,0x79};
  MHZ.write(cmd, 9);
  delay(120);
  if (MHZ.available() >= 9) {
    uint8_t resp[9];
    MHZ.readBytes(resp, 9);
    if (resp[0] == 0xFF && resp[1] == 0x86) {
      int co2 = resp[2] * 256 + resp[3];
      return co2;
    }
  }
  return -1;
}

// ---------------- Time helper ----------------
String getISOTime() {
  time_t now;
  time(&now);
  if (now < 10000) return "";
  struct tm timeinfo;
  localtime_r(&now, &timeinfo);
  char buffer[40];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}
