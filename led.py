import sys
from rpi_ws281x import PixelStrip, Color

LED_COUNT = 16
LED_FREQ_HZ = 800000
LED_INVERT = False

strip = PixelStrip(LED_COUNT, 18, LED_FREQ_HZ, 10, LED_INVERT, 255, 0)
strip.begin()

state = {"r": 255, "g": 255, "b": 255, "bright": 150, "on": False}

def apply():
    f = state["bright"] / 255.0
    r = int(state["r"] * f)
    g = int(state["g"] * f)
    b = int(state["b"] * f)
    if not state["on"]:
        r = g = b = 0
    for i in range(strip.numPixels()):
        strip.setPixelColor(i, Color(r, g, b))
    strip.show()

apply()

for line in sys.stdin:
    parts = line.strip().split()
    if not parts:
        continue
    if parts[0] == "on":
        state["on"] = True
        if len(parts) >= 4:
            state["r"], state["g"], state["b"] = int(parts[1]), int(parts[2]), int(parts[3])
        apply()
    elif parts[0] == "off":
        state["on"] = False
        apply()
    elif parts[0] == "bright" and len(parts) >= 2:
        state["bright"] = int(parts[1])
        apply()
