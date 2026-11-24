import json, sys
from PIL import Image
import numpy as np
pref = sys.argv[1]; R = int(sys.argv[2]) if len(sys.argv) > 2 else 1
res = json.load(open(f"out/a298/{pref}-res.json"))
def ink(im): return np.asarray(im.convert("L")) < 150
def dil(a, r):
    o = a.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            o |= np.roll(np.roll(a, dy, 0), dx, 1)
    return o
for r in res:
    if "err" in r: continue
    i = r["i"]; base = f"out/a298/{pref}{i}"; L, C = r["line"], r["clip"]
    x0 = int((L["x"] - C["x"]) * 2) + 8; y0 = int((L["y"] - C["y"]) * 2) + 6
    x1 = int((L["x"] - C["x"] + L["width"]) * 2) - 8; y1 = int((L["y"] - C["y"] + L["height"]) * 2) - 6
    b = ink(Image.open(base + "-before.png").crop((x0, y0, x1, y1)))
    out = []
    for f in ("f0", "f1", "open"):
        a = ink(Image.open(base + f"-{f}.png").crop((x0, y0, x1, y1)))
        miss = (b & ~dil(a, R)).sum(); extra = (a & ~dil(b, R)).sum(); n = b.sum()
        # best horizontal shift of whole line
        out.append(f"{f} off-by>{R}px {100*(miss+extra)/max(n,1):.1f}%")
    # right-end drift: last ink column
    a = ink(Image.open(base + "-open.png").crop((x0, y0, x1, y1)))
    cb, ca = np.where(b.any(0))[0], np.where(a.any(0))[0]
    print(i, r["file"][:18], repr(r["text"][:22]), r["info"]["face"], "|", " ; ".join(out), "| first/last ink col before", cb[0], cb[-1], "open", ca[0], ca[-1])
