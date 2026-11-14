# S.E.R.A — Safe Exploration & Return Assistant
# Written with AI assistance (Claude), reviewed by team VAA.
# prep_logo.py: takes the parts of our real logo (img/sera-logo.jpg) without its black background,
# so the logo itself is not changed:
#   img/sera-word.png  the "SERA" letters of the logo, white on transparent (used as a CSS mask)
#   img/mark.png       the logo planet, round, on transparent (header icon and browser tab)
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
disc = disc.convert('RGBA')
dp = disc.load()
for y in range(S):
    for x in range(S):
        d = math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2)
        a = max(0.0, min(1.0, (1.0 - d) * S / 2))   # 1 px anti-aliased edge
        r, g, b, _ = dp[x, y]
        dp[x, y] = (r, g, b, int(a * 255))
disc.resize((128, 128), Image.LANCZOS).save(os.path.join(IMG, 'mark.png'), optimize=True)
print('img/mark.png from the logo planet')
