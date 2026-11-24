import json, sys
from PIL import Image, ImageChops
import numpy as np
pref = sys.argv[1]
res = json.load(open(f"out/a298/{pref}-res.json"))
def ink(im): return np.asarray(im.convert("L")) < 140
for r in res:
    if "err" in r: print(r); continue
    i = r["i"]; base = f"out/a298/{pref}{i}"
    L, C = r["line"], r["clip"]
    x0 = int((L["x"] - C["x"]) * 2) + 8; y0 = int((L["y"] - C["y"]) * 2) + 6
    x1 = int((L["x"] - C["x"] + L["width"]) * 2) - 8; y1 = int((L["y"] - C["y"] + L["height"]) * 2) - 6
    out = []
    b = Image.open(base + "-before.png")
    for f in ("f0", "f1", "open"):
        a = Image.open(base + f"-{f}.png")
        ib, ia = ink(b.crop((x0, y0, x1, y1))), ink(a.crop((x0, y0, x1, y1)))
        x = np.logical_xor(ib, ia).sum(); n = ib.sum()
        # neighbours: everything outside the line rect expanded by 4 css px
        mb, ma = np.asarray(b.convert("L")).astype(int), np.asarray(a.convert("L")).astype(int)
        m = np.ones(mb.shape, bool); m[max(0, y0 - 14):y1 + 14, max(0, x0 - 16):x1 + 16] = False
        nb = ((np.abs(mb - ma) > 40) & m & (mb < 200)).sum()   # dark page pixels outside that changed
        out.append(f"{f}: xor {x}/{n} ink ({100*x/max(n,1):.1f}%) nbInkChanged {nb}")
    print(i, r["file"], repr(r["text"][:28]), r["info"]["face"], "|", " ; ".join(out))
