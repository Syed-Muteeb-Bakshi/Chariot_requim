#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("WiFi test starting...");
  WiFi.disconnect(true, true);
  delay(500);

  WiFi.mode(WIFI_STA);
  delay(500);

  WiFi.begin("Syed_ACT", "Act@654321");

  for (int i=0; i<20; i++) {
    Serial.print("Status: ");
    Serial.println(WiFi.status());
    delay(500);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("CONNECTED!");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Still not connected.");
  }
}

void loop() {}
