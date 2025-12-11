#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("---- HARD WIFI RESET ----");

  // FULL RADIO RESET
  WiFi.disconnect(true, true);  // erase NVS WiFi configs
  delay(500);

  WiFi.mode(WIFI_OFF);  // turn WiFi chip off
  delay(1000);

  Serial.println("WiFi OFF");

  // Hard reboot WiFi chip
  WiFi.mode(WIFI_STA);
  delay(1000);

  Serial.println("WiFi ON in STA mode");

  // Test begin
  Serial.println("Starting test WiFi.begin(...)");

  WiFi.begin("Fweah!!", "OraOraOra");  // choose simplest network
}

void loop() {
  Serial.println(WiFi.status());
  delay(1000);
}
