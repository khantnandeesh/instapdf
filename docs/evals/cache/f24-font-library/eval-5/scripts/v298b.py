# Second measure for AC-298, on the line's own rows only (its box plus 2 CSS px above and below, so neighbouring lines don't dilute it):
# grey-weighted ink centroid shift (dy, dx) and the whole-device-pixel shift of the opened box that leaves the least difference from the page.
# Sets: v = v298 (10 lines x 2 sizes x 2 scales x 3 sessions), a d|p = the 39-line a298 run (scale 2).
import json, sys, numpy as np
from PIL import Image
def ink(p):
    A = np.asarray(Image.open(p).convert("RGB")).astype(int); g = 255.0 - A.mean(2); g[(A[:, :, 0] - A[:, :, 1]) > 50] = 0; g[g < 40] = 0; return g
def best(b, a, R):
    out = []
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            s = np.roll(np.roll(a, -dy, 0), -dx, 1); out.append((float(np.abs(b - s).sum()), abs(dy) + abs(dx), dy, dx))
    return min(out), [o for o in out if o[2] == 0 and o[3] == 0][0][0]
cy = lambda x: (x.sum(1) * np.arange(x.shape[0])).sum() / max(x.sum(), 1)
cx = lambda x: (x.sum(0) * np.arange(x.shape[1])).sum() / max(x.sum(), 1)
def one(bp, ap, L, C, d):
    x0 = int((L["x"] - C["x"] + 6) * d); x1 = int((L["x"] - C["x"] + L["width"] - 6) * d); y0 = max(0, int((L["y"] - C["y"] - 2) * d)); y1 = int((L["y"] - C["y"] + L["height"] + 2) * d)
    b = ink(bp)[y0:y1, x0:x1]; a = ink(ap)[y0:y1, x0:x1]; (x, _, dy, dx), xz = best(b, a, int(round(2 * d)))
    return (dy / d, dx / d, round((cy(a) - cy(b)) / d, 2), round((cx(a) - cx(b)) / d, 2), round(100 * xz / max(b.sum(), 1), 1), round(100 * x / max(b.sum(), 1), 1))
rows = []
if sys.argv[1] == "v":
    for r in json.load(open((sys.argv[2] if len(sys.argv) > 2 else "out/v298") + "/res.json")): rows.append(((("390" if r["phone"] else "1280") + " x%g" % r["dsf"]), r["text"][:24], one(r["base"] + "-before.png", r["base"] + "-open.png", r["line"], r["clip"], r["dsf"]) + (r["geo"]["face"],)))
else:
    p = sys.argv[2]
    for r in json.load(open(f"out/a298/{p}-res.json")):
        if "err" not in r: rows.append(((("390" if p == "p" else "1280") + " x2"), r["text"][:24], one(f"out/a298/{p}{r['i']}-before.png", f"out/a298/{p}{r['i']}-open.png", r["line"], r["clip"], 2) + (r["info"].get("face"),)))
seen = {}
for r in rows: seen.setdefault(r[:2], []).append(r[2])
bad = 0
for k, v in seen.items():
    same = all(x == v[0] for x in v); flag = any(abs(x[2]) > 0.5 or abs(x[0]) > 0.5 for x in v); bad += flag
    print(k[0], repr(k[1]).ljust(28), "centroid dy %5.2f dx %5.2f" % (v[0][2], v[0][3]), "| best whole-pixel shift dy %4.1f dx %4.1f" % (v[0][0], v[0][1]), "| grey difference %% as is %5.1f at best %5.1f" % (v[0][4], v[0][5]), v[0][6], "| sessions same" if same else "| SESSIONS DIFFER " + str([(x[0], x[2], x[6]) for x in v]), "<-- OFF" if flag else "")
print("lines", len(seen), "off by more than 0.5 css px vertically:", bad, "| largest |centroid dy|", max(abs(x[2]) for v in seen.values() for x in v))
