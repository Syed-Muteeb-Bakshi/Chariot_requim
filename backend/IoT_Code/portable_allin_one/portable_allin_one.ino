/* portable_fixed_wifi_ntp_bmp_guard.ino
   Final working version
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <SPIFFS.h>
#include <Wire.h>
#include <time.h>

#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_SSD1306.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>

// ------------------------------------------------------
// I2C Pins
// ------------------------------------------------------
#define I2C_SDA 21
#define I2C_SCL 22

// ------------------------------------------------------
// OLED Setup
// ------------------------------------------------------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire);

// ------------------------------------------------------
// BMP280
// ------------------------------------------------------
Adafruit_BMP280 bmp;
bool haveBMP = false;

// ------------------------------------------------------
// GPS (UART1)
// ------------------------------------------------------
HardwareSerial GPSSerial(1);
TinyGPSPlus gps;

// ------------------------------------------------------
// Analog sensors
// ------------------------------------------------------
const int MQ135_PIN = 34;
const int CH20_PIN  = 35;

// ------------------------------------------------------
// WiFi — ONLY HOTSPOT
// ------------------------------------------------------
const char* ssids[] = { "JioFiber-2.4 Syed" };
const char* passwords[] = { "Pa$$w0rd@123" };
const int WIFI_COUNT = 1;


// ------------------------------------------------------
// Cloud URL
// ------------------------------------------------------
const char* CLOUD_URL =
  "https://vento-backend-678919375946.us-east1.run.app/api/upload_sensor";

// ------------------------------------------------------
// NTP
// ------------------------------------------------------
const char* ntpServer = "pool.ntp.org";
const long gmtOffset = 19800; 
const int daylightOffset = 0;

// ------------------------------------------------------
// SPIFFS queue
// ------------------------------------------------------
const char* QUEUE_FILE = "/queue.txt";
const int MAX_QUEUE = 50;

// ------------------------------------------------------
// Timing
// ------------------------------------------------------
unsigned long lastSampleMs = 0;
const unsigned long SAMPLE_INTERVAL_MS = 30000UL;
unsigned long lastWifiAttemptMs = 0;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000UL;

// ------------------------------------------------------
// Forward declarations
// ------------------------------------------------------
bool initSPIFFS();
bool wifiConnect();
String getISOTime();
bool enqueueSample(const String &line);
bool flushQueue();
int queueCount();
int sendJSON(const String &jsonPayload);


// ------------------------------------------------------
// SETUP
// ------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n--- portable_fixed boot ---");

  Wire.begin(I2C_SDA, I2C_SCL);

  // OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("OLED not found");
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0,0);
    display.println("Vento Portable Boot...");
    display.display();
  }

  // BMP
  if (bmp.begin(0x76)) {
    haveBMP = true;
    Serial.println("BMP found @0x76");
  } else if (bmp.begin(0x77)) {
    haveBMP = true;
    Serial.println("BMP found @0x77");
  } else {
    haveBMP = false;
    Serial.println("BMP NOT found");
  }

  // GPS UART
  GPSSerial.begin(9600, SERIAL_8N1, 14, 27);
  Serial.println("GPS uart started");

  // SPIFFS
  if (!initSPIFFS()) Serial.println("SPIFFS init fail");

  // NTP
  configTime(gmtOffset, daylightOffset, ntpServer);

  // WiFi connect
  wifiConnect();

  lastSampleMs = millis() - 5000;
}


// ------------------------------------------------------
// LOOP
// ------------------------------------------------------
void loop() {

  // GPS feed
  while (GPSSerial.available()) gps.encode(GPSSerial.read());

  // Flush queue if WiFi is up
  if (WiFi.status() == WL_CONNECTED) {
    flushQueue();
  } else {
    // Retry WiFi every 10 seconds
    if (millis() - lastWifiAttemptMs > WIFI_RETRY_INTERVAL_MS) {
      wifiConnect();
    }
  }

  // Sample every interval
  if (millis() - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = millis();

    // Read BMP
    float temperature = NAN;
    float pressure = NAN;
    if (haveBMP) {
      temperature = bmp.readTemperature();
      pressure = bmp.readPressure() / 100.0F;
      if (isnan(temperature) || isnan(pressure)) {
        Serial.println("BMP invalid");
        temperature = NAN;
        pressure = NAN;
      } else {
        Serial.printf("BMP T:%.2f  P:%.2f\n", temperature, pressure);
      }
    }

    // Analog sensors
    int rawMQ = analogRead(MQ135_PIN);
    int rawCH = analogRead(CH20_PIN);

    // GPS
    bool haveGPS = gps.location.isValid();
    double lat=0, lon=0;
    if (haveGPS) { lat = gps.location.lat(); lon = gps.location.lng(); }

    String iso = getISOTime();

    // Build JSON
    StaticJsonDocument<300> doc;
    doc["device_id"] = "PORTABLE-01";
    doc["device_type"] = "portable";
    doc["city"] = "Hyderabad";
    if (iso.length()) doc["timestamp"] = iso;
    if (!isnan(temperature)) doc["temp"] = temperature;
    if (!isnan(pressure)) doc["pressure"] = pressure;
    doc["mq135"] = rawMQ;
    doc["ch20"]  = rawCH;

    if (haveGPS) {
      JsonObject g = doc.createNestedObject("gps");
      g["lat"] = lat;
      g["lon"] = lon;
    }

    String payload;  
    serializeJson(doc, payload);

    Serial.println("Payload:");
    Serial.println(payload);

    // Upload or queue
    if (WiFi.status() == WL_CONNECTED) {
      int code = sendJSON(payload);

      if (code >=200 && code <300) {
        Serial.printf("Uploaded OK (%d)\n", code);

        // OLED
        display.clearDisplay();
        display.setCursor(0,0);
        if (!isnan(temperature))
          display.printf("T:%.1fC P:%.0fhPa\n", temperature, pressure);
        else
          display.println("T:-- P:--");
        display.printf("MQ:%d VOC:%d\n", rawMQ, rawCH);
        if (haveGPS) display.printf("GPS:%.4f\n", lat);
        else display.println("GPS:NoFix");
        display.display();

      } else {
        Serial.printf("Upload failed, queued\n");
        enqueueSample(payload);
      }

    } else {
      Serial.println("No WiFi -> queued");
      enqueueSample(payload);
    }
  }

  delay(10);
}


// ------------------------------------------------------
// WiFi Connect — FIXED VERSION
// ------------------------------------------------------
bool wifiConnect() {
  if (WiFi.status() == WL_CONNECTED) return true;

  unsigned long now = millis();
  if (now - lastWifiAttemptMs < WIFI_RETRY_INTERVAL_MS) {
    Serial.println("Skipping begin() due to backoff");
    return false;
  }
  lastWifiAttemptMs = now;

  Serial.println("Trying WiFi networks...");
  WiFi.mode(WIFI_STA);

  for (int i=0; i<WIFI_COUNT; i++) {
    Serial.printf("Connect -> %s\n", ssids[i]);

    WiFi.disconnect(true, true);
    delay(200);

    WiFi.begin(ssids[i], passwords[i]);   // <-- FIXED LINE

    unsigned long start = millis();
    while (millis() - start < 8000) {
      if (WiFi.status() == WL_CONNECTED)
        break;
      delay(200);
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("Connected: ");
      Serial.println(ssids[i]);

      display.clearDisplay();
      display.setCursor(0,0);
      display.printf("WiFi OK\n%s\nIP:%s\n",
        ssids[i], WiFi.localIP().toString().c_str());
      display.display();
      return true;
    }

    Serial.printf("Failed: %s\n", ssids[i]);
  }

  Serial.println("All WiFi failed");
  return false;
}


// ------------------------------------------------------
// SPIFFS Queue
// ------------------------------------------------------
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
    File f = SPIFFS.open(QUEUE_FILE, FILE_READ);
    if(!f) return false;
    std::vector<String> lines;
    while(f.available()){
      String ln=f.readStringUntil('\n');
      if(ln.length()) lines.push_back(ln);
    }
    f.close();
    if(lines.size()) lines.erase(lines.begin());
    lines.push_back(line);

    File w = SPIFFS.open(QUEUE_FILE, FILE_WRITE);
    for (auto &s: lines) w.println(s);
    w.close();
    return true;

  } else {
    File f = SPIFFS.open(QUEUE_FILE, FILE_APPEND);
    f.println(line);
    f.close();
    return true;
  }
}

int queueCount(){
  File f = SPIFFS.open(QUEUE_FILE, FILE_READ);
  int c=0;
  while(f.available()){
    String ln=f.readStringUntil('\n');
    if(ln.length()) c++;
  }
  f.close();
  return c;
}

bool flushQueue(){
  File f = SPIFFS.open(QUEUE_FILE, FILE_READ);
  if(!f) return false;

  std::vector<String> lines;
  while(f.available()){
    String ln=f.readStringUntil('\n');
    if(ln.length()) lines.push_back(ln);
  }
  f.close();

  if (lines.empty()) return true;

  size_t idx=0;
  for (; idx<lines.size(); idx++) {
    int code = sendJSON(lines[idx]);
    if (!(code>=200 && code<300)) break;
  }

  File w = SPIFFS.open(QUEUE_FILE, FILE_WRITE);
  for (size_t i = idx; i < lines.size(); i++)
    w.println(lines[i]);
  w.close();

  return idx==lines.size();
}


// ------------------------------------------------------
// Cloud Upload
// ------------------------------------------------------
int sendJSON(const String &jsonPayload){
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, CLOUD_URL);
  http.addHeader("Content-Type","application/json");

  int code = http.POST((uint8_t*)jsonPayload.c_str(), jsonPayload.length());
  String resp = "";
  if (code > 0) resp = http.getString();

  Serial.printf("HTTP %d -> %s\n", code, resp.c_str());
  http.end();
  return code;
}


// ------------------------------------------------------
// NTP Time
// ------------------------------------------------------
String getISOTime(){
  time_t now = time(nullptr);
  if (now < 10000) return "";
  struct tm t;
  localtime_r(&now, &t);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(buf);
}
