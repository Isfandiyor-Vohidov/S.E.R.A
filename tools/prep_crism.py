# S.E.R.A — Safe Exploration & Return Assistant
# Written with AI assistance (Claude), reviewed by team VAA.
# prep_crism.py: mineral signals in our EVA zone from MRO CRISM (NASA/JHU-APL).
# Source: CRISM Map-projected Targeted Reduced Data Records (MTRDR, Seelos et al.), found with
# the PDS Geosciences Node ODE REST API. We use the standard browse products of each observation:
#   HYD = SINDEX2 (polyhydrated sulfate), BD2100_2 (monohydrated sulfate), BD1900_2 (bound water)
#   PHY = D2300 (Fe/Mg clay), D2200 (Al clay / hydrated silica), BD1900R2 (bound water)
# The browse images are stretched for display, so the values are relative signal strength, not
# abundance. All observations over the zone are averaged on a 10 m grid.
# Writes data/crism.js (signal classes and the strongest spots) and img/crism-zone.png (map layer).
#
# Usage:  python tools/prep_crism.py      (needs Pillow)

import io
import json
import math
import os
import re
import urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
R_MARS = 3396190.0
ODE = ('https://oderest.rsl.wustl.edu/live2/?query=product&target=mars&ihid=MRO&iid=CRISM&pt=MTRDR'
       '&westernlon={w}&easternlon={e}&minlat={s}&maxlat={n}&results=fp&output=JSON&limit=50')

# Zone frame from data/terrain.js
src = open(os.path.join(ROOT, 'data', 'terrain.js'), encoding='utf-8').read()
num = lambda k: float(re.search(k + r':\s*(-?[\d.]+)', src).group(1))
N, W, CELL = num('north'), num('west'), num('cellDeg')
ROWS, COLS = int(num('rows')), int(num('cols'))
S, E = N - ROWS * CELL, W + COLS * CELL

G = 200                       # output grid: 200 x 200 cells of 10 m
gdeg = (E - W) / G

# Signal classes: (id, product, band index, name, short name for a science point, colour)
CLASSES = [
    ('sulfate_poly', 'hyd', 0, 'Polyhydrated sulfate', 'Sulfates', (217, 166, 242)),
    ('sulfate_mono', 'hyd', 1, 'Monohydrated sulfate (kieserite-like)', 'Mono-sulfates', (245, 214, 140)),
    ('clay_femg', 'phy', 0, 'Fe/Mg clay (smectite)', 'Clays', (111, 195, 240)),
    ('clay_al', 'phy', 1, 'Al clay or hydrated silica', 'Al-clays / silica', (150, 230, 220)),
]


def get(url, binary=False):
    with urllib.request.urlopen(url, timeout=90) as r:
        data = r.read()
    return data if binary else data.decode('utf-8', 'replace')


def products():
    url = ODE.format(w=W, e=E, s=S, n=N)
    res = json.loads(get(url))['ODEResults']['Products']['Product']
    res = res if isinstance(res, list) else [res]
    out = []
    for p in res:
        files = p['Product_files']['Product_file']
        files = files if isinstance(files, list) else [files]
        by = {f['FileName'].lower(): f['URL'] for f in files}
        item = {'id': p['pdsid'].split('_')[0].upper()}
        for kind in ('hyd', 'phy'):
            png = [u for n, u in by.items() if n.endswith('_br' + kind + 'j_mtr3.png')]
            hdr = [u for n, u in by.items() if n.endswith('_br' + kind + 'j_mtr3.hdr')]
            if png and hdr:
                item[kind] = (png[0], hdr[0])
        if 'hyd' in item and 'phy' in item:
            out.append(item)
    return out


def load(png_url, hdr_url):
    h = get(hdr_url)
    mi = re.search(r'map info = \{([^}]*)\}', h).group(1).split(',')
    x0, y0, px = float(mi[3]), float(mi[4]), float(mi[5])
    img = Image.open(io.BytesIO(get(png_url, True))).convert('RGBA')
    return img, x0, y0, px


def sample(stack, img, x0, y0, px):
    w, h = img.size
    pix = img.load()
    for r in range(G):
        lat = N - (r + 0.5) * gdeg
        y = R_MARS * math.radians(lat)
        j = int((y0 - y) / px)
        if j < 0 or j >= h:
            continue
        for c in range(G):
            lon = W + (c + 0.5) * gdeg
            i = int((R_MARS * math.radians(lon) - x0) / px)
            if i < 0 or i >= w:
                continue
            v = pix[i, j]
            if v[3] == 0 or (v[0] == 0 and v[1] == 0 and v[2] == 0):
                continue
            k = r * G + c
            stack[k][0] += v[0]; stack[k][1] += v[1]; stack[k][2] += v[2]; stack[k][3] += 1


def main():
    prods = products()
    print('CRISM MTRDR observations over the zone:', len(prods))
    hyd = [[0, 0, 0, 0] for _ in range(G * G)]
    phy = [[0, 0, 0, 0] for _ in range(G * G)]
    used = []
    for p in prods:
        a = load(*p['hyd']); b = load(*p['phy'])
        before = sum(1 for s in hyd if s[3])
        sample(hyd, *a); sample(phy, *b)
        used.append(p['id'])
        print(' ', p['id'], 'covered cells now', sum(1 for s in hyd if s[3]), '(was', before, ')')

    def val(stack, k, band):
        s = stack[k]
        return s[band] / s[3] / 255.0 if s[3] else None

    covered = sum(1 for s in hyd if s[3]) / (G * G)
    grids = {}
    for cid, kind, band, *_ in CLASSES:
        st = hyd if kind == 'hyd' else phy
        grids[cid] = [val(st, k, band) for k in range(G * G)]

    # Smooth over 5 x 5 cells (50 m), so one bright pixel does not make a target.
    def smooth(g):
        out = [None] * (G * G)
        for r in range(G):
            for c in range(G):
                acc, n = 0.0, 0
                for dr in range(-2, 3):
                    for dc in range(-2, 3):
                        rr, cc = r + dr, c + dc
                        if 0 <= rr < G and 0 <= cc < G and g[rr * G + cc] is not None:
                            acc += g[rr * G + cc]; n += 1
                out[r * G + c] = acc / n if n >= 13 else None
        return out

    # Map layer: each cell coloured by its strongest class when the signal is clearly above
    # the zone's own typical level (top 10 % of that class).
    thresholds = {}
    smoothed = {}
    for cid, *_ in CLASSES:
        sm = smooth(grids[cid])
        smoothed[cid] = sm
        vals = sorted(v for v in sm if v is not None)
        median = vals[len(vals) // 2] if vals else 0
        # Top 10 % of the zone, and clearly above the typical level and above 0.15.
        thresholds[cid] = max(vals[int(len(vals) * 0.90)] if vals else 1, median + 0.1, 0.15)
    layer = Image.new('RGBA', (G, G), (0, 0, 0, 0))
    lp = layer.load()
    share = {cid: 0 for cid, *_ in CLASSES}
    for k in range(G * G):
        best, bestv = None, 0
        for cid, kind, band, name, short, col in CLASSES:
            v = smoothed[cid][k]
            if v is None or v < thresholds[cid]:
                continue
            excess = (v - thresholds[cid]) / max(1e-6, 1 - thresholds[cid]) + 0.01
            if excess > bestv:
                best, bestv = (cid, col), excess
        if best:
            share[best[0]] += 1
            lp[k % G, k // G] = best[1] + (int(110 + 120 * min(1, bestv * 3)),)
    layer = layer.resize((G * 2, G * 2), Image.NEAREST)
    layer.save(os.path.join(ROOT, 'img', 'crism-zone.png'), optimize=True)

    # Strongest spots: up to 2 per class, at least 300 m apart from any other spot.
    spots = []
    for cid, kind, band, name, short, col in CLASSES:
        sm = smoothed[cid]
        order = sorted((v, k) for k, v in enumerate(sm) if v is not None and v >= thresholds[cid])
        order.reverse()
        taken = 0
        for v, k in order:
            r, c = divmod(k, G)
            if min(r, c, G - 1 - r, G - 1 - c) < 8:      # not within 80 m of the zone edge
                continue
            lat = N - (r + 0.5) * gdeg; lon = W + (c + 0.5) * gdeg
            if any(math.hypot((lat - s['lat']) * 59274, (lon - s['lon']) * 59274 * math.cos(math.radians(lat))) < 300
                   for s in spots):
                continue
            spots.append({'cls': cid, 'lat': round(lat, 6), 'lon': round(lon, 6),
                          'signal': round(v, 2), 'typical': round(sorted(x for x in sm if x is not None)[len([x for x in sm if x is not None]) // 2], 2)})
            taken += 1
            if taken == 2:
                break

    classes = [{'id': c[0], 'name': c[3], 'short': c[4],
                'color': '#%02X%02X%02X' % c[5], 'band': ('HYD ' if c[1] == 'hyd' else 'PHY ') +
                (['SINDEX2', 'BD2100_2', 'BD1900_2'] if c[1] == 'hyd' else ['D2300', 'D2200', 'BD1900R2'])[c[2]],
                'share': round(share[c[0]] / (G * G), 3)} for c in CLASSES]
    out = ('// S.E.R.A — CRISM mineral signals in our EVA zone, generated by tools/prep_crism.py. Do not edit by hand.\n'
           '// Written with AI assistance (Claude), reviewed by team VAA.\n'
           '// Source: MRO CRISM MTRDR browse products (NASA/JHU-APL), PDS Geosciences Node (ODE).\n'
           '// Values are relative signal strength from stretched browse images (0..1), not abundance.\n'
           'window.SERA_CRISM = ' + json.dumps({
               'source': 'MRO CRISM MTRDR (NASA/JHU-APL), PDS Geosciences Node',
               'observations': used, 'coverage': round(covered, 3),
               'bounds': [[S, W], [N, E]], 'classes': classes, 'spots': spots}, indent=1) + ';\n')
    open(os.path.join(ROOT, 'data', 'crism.js'), 'w', encoding='utf-8').write(out)
    print('coverage', round(covered * 100, 1), '%; spots', len(spots))
    for c in classes:
        print(' ', c['id'], 'map share', c['share'])
    for s in spots:
        print(' ', s)


main()
