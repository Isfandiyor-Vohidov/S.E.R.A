# S.E.R.A — Safe Exploration & Return Assistant
# Written with AI assistance (Claude), reviewed by team VAA.
# prep_globe.py: builds the texture of the 3D Mars globe from NASA Mars Trek tiles:
# Viking MDIM 2.1 colour mosaic (USGS) times the MOLA + HRSC shaded relief (NASA/GSFC, ESA/DLR/FU Berlin),
# so the globe shows real colour and real relief in one small image.
# Writes img/mars-2k.jpg (fast first load) and img/mars-4k.jpg (sharper, loaded after).
#
# Usage:  python tools/prep_globe.py      (needs Pillow)

import io
import os
import urllib.request
from PIL import Image, ImageChops, ImageEnhance

TREK = 'https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{y}/{x}.jpg'
COLOR = 'Mars_Viking_MDIM21_ClrMosaic_global_232m'
SHADE = 'Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'img')


def mosaic(layer, z):
    cols, rows = 2 ** (z + 1), 2 ** z          # equirectangular grid: column 0 starts at 180 W
    img = Image.new('RGB', (cols * 256, rows * 256))
    for y in range(rows):
        for x in range(cols):
            url = TREK.format(layer=layer, z=z, y=y, x=x)
            with urllib.request.urlopen(url, timeout=60) as r:
                tile = Image.open(io.BytesIO(r.read())).convert('RGB')
            img.paste(tile, (x * 256, y * 256))
    return img


def tone(img):
    # A little more colour and contrast; the Viking mosaic alone looks pale on screen.
    img = ImageEnhance.Color(img).enhance(1.35)
    return ImageEnhance.Contrast(img).enhance(1.12)


def build(z, name):
    color = mosaic(COLOR, z)
    shade = mosaic(SHADE, z).convert('L')
    # Relief: colour * (0.45 + 0.75 * shade), so slopes facing away from the sun get darker.
    light = shade.point(lambda v: int(min(255, 0.45 * 255 + 0.75 * v)))
    out = ImageChops.multiply(color, Image.merge('RGB', (light, light, light)))
    out = out.point(lambda v: min(255, int(v * 1.25)))
    out = tone(out)
    path = os.path.join(OUT, name)
    out.save(path, 'JPEG', quality=78, optimize=True, progressive=True)
    print(name, out.size, round(os.path.getsize(path) / 1024), 'kB')


build(2, 'mars-2k.jpg')
build(3, 'mars-4k.jpg')
