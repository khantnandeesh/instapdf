import sys, os, json, shutil
sys.path.insert(0, "./pylib")
from fontTools.ttLib import TTFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLFont
os.makedirs("fx/ttf", exist_ok=True)
# --- own-font fixtures (DejaVu Sans: Bitstream Vera licence; Inter: OFL)
src = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
shutil.copy(src, "fx/own-dejavu.ttf")
for fl in ("woff", "woff2"):
    f = TTFont(src); f.flavor = fl; f.save(f"fx/own-dejavu.{fl}")
shutil.copy("/usr/share/fonts/opentype/inter/Inter-Regular.otf", "fx/own-inter.otf")
f = TTFont(src); f["OS/2"].fsType = 0x0002; 
for rec in f["name"].names:
    if rec.nameID in (1, 4, 16): rec.string = "Eval Restricted Sans"
    if rec.nameID == 6: rec.string = "EvalRestrictedSans"
f.save("fx/own-restricted.ttf")
f = TTFont(src); f["OS/2"].fsType = 0x0004; f.save("fx/own-preview-print.ttf")   # preview & print embedding: allowed to embed
open("fx/own-broken.ttf", "wb").write(open(src, "rb").read()[:3000])
open("fx/own-fake.ttf", "wb").write(b"this is not a font file at all\n" * 40)
open("fx/notes.txt", "w").write("plain text\n")
open("fx/own-empty.otf", "wb").write(b"")
# --- matcher fixtures
fams = json.load(open("lib/families.7224cafb.json"))
def to_ttf(woff, out, ps=None, fam=None):
    f = TTFont(woff); f.flavor = None
    if "glyf" not in f: return False
    if ps:
        for rec in f["name"].names:
            if rec.nameID in (1, 4, 16): rec.string = fam
            if rec.nameID == 6: rec.string = ps
            if rec.nameID in (3,): rec.string = ps + ";eval"
    f.save(out); return True
TEXT = "The quick brown fox jumps over the lazy dog 0123456789"
def make(pdf, faces, hide=True, per_page=18):
    TAG = "".join(w[0].upper() + w[1:4] for w in os.path.basename(pdf)[:-4].split("-"))
    c = canvas.Canvas(pdf, pagesize=(595, 842)); truth = []; y = 800; n = 0
    for k, woff in faces:
        ps = f"Eval{TAG}{len(truth):03d}" if hide else None
        ttf = f"fx/ttf/{os.path.basename(pdf)[:-4]}-{k}.ttf"
        if not to_ttf(woff, ttf, ps, ps): print("skip (not TrueType)", k); continue
        rl = ps or k
        try: pdfmetrics.registerFont(RLFont(rl, ttf))
        except Exception as e: print("skip", k, str(e)[:80]); continue
        c.setFont(rl, 12); c.drawString(40, y, f"{len(truth):03d} {TEXT}"); truth.append((rl, k)); y -= 42; n += 1
        if n % per_page == 0: c.showPage(); y = 800
    c.save(); json.dump(truth, open(pdf[:-4] + ".truth.json", "w")); print(pdf, len(truth))
reg = [(f["i"] + "_400-normal", f"lib/woff/{f['i']}_400-normal.woff") for f in fams if os.path.exists(f"lib/woff/{f['i']}_400-normal.woff")]
make("fx/match-regular.pdf", reg)
oth = [(n[:-5], "lib/woff/" + n) for n in sorted(os.listdir("lib/woff")) if "400-normal" not in n]
make("fx/match-bold-italic.pdf", oth)
# --- AC-281 / AC-282
def one(pdf, lines):
    c = canvas.Canvas(pdf, pagesize=(595, 842)); y = 780
    for rl, ttf, text, size in lines:
        U = "U%d" % (len(pdfmetrics.getRegisteredFontNames()) + 1) ; pdfmetrics.registerFont(RLFont(U, ttf)); c.setFont(U, size); c.drawString(60, y, text); y -= 60
    c.save(); print(pdf)
def named(woff, out, ps, fam):
    f = TTFont(woff); f.flavor = None
    for rec in f["name"].names:
        if rec.nameID in (1, 4, 16): rec.string = fam
        if rec.nameID == 6: rec.string = ps
    f.save(out)
named("lib/woff/lora_400-normal.woff", "fx/ttf/true-lora.ttf", "Lora-Regular", "Lora")
named("lib/woff/merriweather_400-normal.woff", "fx/ttf/true-merri.ttf", "Merriweather-Regular", "Merriweather")
named("lib/woff/montserrat_400-normal.woff", "fx/ttf/true-mont.ttf", "Montserrat-Regular", "Montserrat")
one("fx/ac281-library-family.pdf", [("Lora-Regular", "fx/ttf/true-lora.ttf", "Lora line: total due 450 on time", 16), ("Merriweather-Regular", "fx/ttf/true-merri.ttf", "Merriweather line: total due 450", 16), ("Montserrat-Regular", "fx/ttf/true-mont.ttf", "Montserrat line: total due 450", 16)])
named("lib/woff/roboto_400-normal.woff", "fx/ttf/fake-lora.ttf", "Lora-Regular", "Lora")
named("lib/woff/playfair-display_400-normal.woff", "fx/ttf/fake-roboto.ttf", "Roboto-Regular", "Roboto")
named("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "fx/ttf/fake-inter.ttf", "Inter-Regular", "Inter")
one("fx/ac282-name-lies.pdf", [("Lora-Regular", "fx/ttf/fake-lora.ttf", "Named Lora, drawn in Roboto: total due 450", 16), ("Roboto-Regular", "fx/ttf/fake-roboto.ttf", "Named Roboto, drawn in Playfair: total 450", 16), ("Inter-Regular", "fx/ttf/fake-inter.ttf", "Named Inter, drawn in DejaVu Serif: total 450", 16)])
