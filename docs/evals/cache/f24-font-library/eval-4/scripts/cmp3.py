import json, sys
from PIL import Image
import numpy as np
pref = sys.argv[1]; R = 1
res = json.load(open(f"out/a298/{pref}-res.json"))
def ink(im):
    a = np.asarray(im.convert("RGB")).astype(int); mx = a.max(2); mn = a.min(2)
    return (mx < 150) | ((mx - mn < 60) & (a.mean(2) < 150))   # dark, not the berry outline (saturated red)
def dil(a, r):
    o = a.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1): o |= np.roll(np.roll(a, dy, 0), dx, 1)
    return o
for r in res:
    if "err" in r: continue
    i = r["i"]; base = f"out/a298/{pref}{i}"; L, C = r["line"], r["clip"]
    B = Image.open(base + "-before.png"); A = Image.open(base + "-open.png")
    x0 = int((L["x"] - C["x"]) * 2); y0 = int((L["y"] - C["y"]) * 2); x1 = int((L["x"] - C["x"] + L["width"]) * 2); y1 = int((L["y"] - C["y"] + L["height"]) * 2)
    fb, fa = ink(B), ink(A)
    b, a = fb[y0:y1, x0:x1], fa[y0:y1, x0:x1]
    n = b.sum(); miss = (b & ~dil(a, R)).sum(); extra = (a & ~dil(b, R)).sum(); x = np.logical_xor(a, b).sum()
    m = np.ones(fb.shape, bool); m[y0:y1, x0:x1] = False
    nb_lost = (fb & ~fa & m).sum(); nb_all = (fb & m).sum()
    cb, ca = np.where(b.any(0))[0], np.where(a.any(0))[0]
    f0 = ink(Image.open(base + "-f0.png"))[y0:y1, x0:x1]; f0x = np.logical_xor(f0, b).sum()
    print(f"{i:2d} {r['file'][:16]:16s} {r['text'][:22]!r:26s} {r['info'].get('face')!s:8s} xor {100*x/max(n,1):5.1f}% off>1px {100*(miss+extra)/max(n,1):5.1f}% | f0 xor {100*f0x/max(n,1):5.1f}% | neighbours' ink lost {nb_lost}/{nb_all} | ink cols {cb[0] if len(cb) else None}-{cb[-1] if len(cb) else None} -> {ca[0] if len(ca) else None}-{ca[-1] if len(ca) else None}")
