# S.E.R.A — Safe Exploration & Return Assistant
# Written with AI assistance (Claude), reviewed by team VAA.
# prep_logo.py: takes the parts of our real logo (img/sera-logo.jpg) without its black background,
# so the logo itself is not changed:
#   img/sera-word.png  the "SERA" letters of the logo, white on transparent (used as a CSS mask)
#   img/mark.png       the logo planet without the letters, round, on transparent (header icon, browser tab)
#
# Usage:  python tools/prep_logo.py      (needs Pillow)

import math
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, '..', 'img')
logo = Image.open(os.path.join(IMG, 'sera-logo.jpg')).convert('RGB')
W, H = logo.size
px = logo.load()

# 1. The planet disc, measured on the 1254 px logo: lit limb at x 132 (left), y 52 (top),
#    1022 (bottom); the right limb is in shadow, so the circle is fitted to those three.
cx, cy, rad = 620.0, 538.0, 488.0
print('planet centre %.0f,%.0f radius %.0f' % (cx, cy, rad))

# 2. The word: white letters on the orange planet. Orange has little blue, the letters a lot.
box = (int(cx - rad * 0.75), int(cy - rad * 0.18), int(cx + rad * 0.75), int(cy + rad * 0.18))
crop = logo.crop(box)
cw, ch = crop.size
cp = crop.load()
word = Image.new('RGBA', (cw, ch), (255, 255, 255, 0))
wp = word.load()
for y in range(ch):
    for x in range(cw):
        r, g, b = cp[x, y]
        a = max(0.0, min(1.0, (b - 70) / 150.0))     # planet blue is under ~70
        wp[x, y] = (255, 255, 255, int(a * 255))
word = word.crop(word.getchannel("A").point(lambda v: 255 if v > 90 else 0).getbbox())
word.save(os.path.join(IMG, 'sera-word.png'), optimize=True)
print('img/sera-word.png', word.size)

# 3. The mark: the planet disc with a soft transparent edge, 128 px.
S = 256
side = int(rad * 2)
disc = logo.crop((int(cx - rad), int(cy - rad), int(cx - rad) + side, int(cy - rad) + side)).resize((S, S), Image.LANCZOS)

# The icon is the planet only: the SERA letters (white, so much more blue than the surface)
# are filled in from the surface around them, step by step from the edges inwards.
from PIL import ImageFilter
dp = disc.load()
band = range(int(S * 0.38), int(S * 0.62))
mask = Image.new('L', (S, S), 0)
mp = mask.load()
for y in band:
    for x in range(S):
        if dp[x, y][2] > 75:
            mp[x, y] = 255
mask = mask.filter(ImageFilter.MaxFilter(7))           # also the soft glow around the letters
mp = mask.load()
hole = set((x, y) for y in band for x in range(S) if mp[x, y])
while hole:
    filled = {}
    for (x, y) in hole:
        acc, n = [0, 0, 0], 0
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            q = (x + dx, y + dy)
            if q not in hole and 0 <= q[0] < S and 0 <= q[1] < S:
                p = dp[q]; acc[0] += p[0]; acc[1] += p[1]; acc[2] += p[2]; n += 1
        if n:
            filled[(x, y)] = tuple(v // n for v in acc)
    for q, v in filled.items():
        dp[q] = v
    hole -= set(filled)
disc = disc.convert("RGBA")
dp = disc.load()
for y in range(S):
    for x in range(S):
        d = math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2)
        a = max(0.0, min(1.0, (1.0 - d) * S / 2))   # 1 px anti-aliased edge
        r, g, b, _ = dp[x, y]
        dp[x, y] = (r, g, b, int(a * 255))
disc.resize((128, 128), Image.LANCZOS).save(os.path.join(IMG, 'mark.png'), optimize=True)
print('img/mark.png from the logo planet')
