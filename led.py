import sys
from rpi_ws281x import PixelStrip, Color

LED_COUNT = 16
LED_FREQ_HZ = 800000
LED_BRIGHTNESS = 150
LED_INVERT = False

strip = PixelStrip(LED_COUNT, 18, LED_FREQ_HZ, 10, LED_INVERT, LED_BRIGHTNESS, 0)
strip.begin()

def fill(r, g, b):
    for i in range(strip.numPixels()):
        strip.setPixelColor(i, Color(r, g, b))
    strip.show()

fill(0, 0, 0)

for line in sys.stdin:
    parts = line.strip().split()
    if not parts:
        continue
    if parts[0] == "on":
        r, g, b = (int(x) for x in parts[1:4]) if len(parts) >= 4 else (255, 255, 255)
        fill(r, g, b)
    elif parts[0] == "off":
        fill(0, 0, 0)
