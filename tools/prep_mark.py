# S.E.R.A — Safe Exploration & Return Assistant
# Written with AI assistance (Claude), reviewed by team VAA.
# prep_mark.py: the small round Mars icon of the header and the browser tab (img/mark.png),
# drawn from our globe texture (NASA Viking colour x MOLA/HRSC relief, img/mars-2k.jpg)
# as a sphere seen from above Gale Crater, with a transparent background.
#
# Usage:  python tools/prep_mark.py      (needs Pillow)

import math
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
tex = Image.open(os.path.join(HERE, '..', 'img', 'mars-2k.jpg')).convert('RGB')
TW, TH = tex.size
tp = tex.load()

N = 256                      # drawn at 256 px, saved at 128 px (smooth edge)
LAT0, LON0 = math.radians(5), math.radians(110)
out = Image.new('RGBA', (N, N), (0, 0, 0, 0))
op = out.load()
for j in range(N):
    for i in range(N):
        x = (i + 0.5) / N * 2 - 1
        y = 1 - (j + 0.5) / N * 2
        r2 = x * x + y * y
        if r2 > 1:
            continue
        z = math.sqrt(1 - r2)
        # inverse orthographic projection
        c = math.asin(min(1, math.sqrt(r2)))
        if r2 == 0:
            lat, lon = LAT0, LON0
        else:
            rho = math.sqrt(r2)
            lat = math.asin(math.cos(c) * math.sin(LAT0) + y * math.sin(c) * math.cos(LAT0) / rho)
            lon = LON0 + math.atan2(x * math.sin(c), rho * math.cos(LAT0) * math.cos(c) - y * math.sin(LAT0) * math.sin(c))
        u = ((math.degrees(lon) + 180) % 360) / 360 * (TW - 1)
        v = (90 - math.degrees(lat)) / 180 * (TH - 1)
        rr, gg, bb = tp[int(u), int(v)]
        shade = 0.55 + 0.45 * (0.6 * z + 0.4 * max(0, -x * 0.5 + y * 0.5 + z * 0.7))   # light from the upper left
        op[i, j] = (min(255, int(rr * shade)), min(255, int(gg * shade)), min(255, int(bb * shade)), 255)
out = out.resize((128, 128), Image.LANCZOS)
out.save(os.path.join(HERE, '..', 'img', 'mark.png'), optimize=True)
print('img/mark.png', os.path.getsize(os.path.join(HERE, '..', 'img', 'mark.png')), 'bytes')
