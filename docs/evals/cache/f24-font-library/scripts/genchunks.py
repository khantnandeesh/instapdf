import os, json
from fontTools.ttLib import TTFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLFont
os.makedirs("fx/chunks", exist_ok=True)
faces = sorted(os.listdir("lib/woff")); TEXT = "The quick brown fox jumps over the lazy dog 0123456789"
N = 16
for ci in range(0, len(faces), N):
    chunk = faces[ci:ci + N]; pdf = f"fx/chunks/c{ci // N}.pdf"; c = canvas.Canvas(pdf, pagesize=(595, 842)); y = 800; truth = []
    for j, w in enumerate(chunk):
        ps = f"EvalC{ci // N}N{j:02d}"; f = TTFont("lib/woff/" + w); f.flavor = None
        for rec in f["name"].names:
            if rec.nameID in (1, 4, 16): rec.string = ps
            if rec.nameID in (2, 17): rec.string = "Regular"
            if rec.nameID == 6: rec.string = ps
        # hide style hints too
        f["OS/2"].usWeightClass = 400; f["OS/2"].fsSelection = 0x40; f["head"].macStyle = 0; f["post"].italicAngle = 0
        t = f"fx/chunks/{ps}.ttf"; f.save(t)
        pdfmetrics.registerFont(RLFont(ps, t)); c.setFont(ps, 12); c.drawString(40, y, f"{j:02d} {TEXT}"); y -= 46; truth.append((ps, w[:-5]))
    c.save(); json.dump(truth, open(pdf[:-4] + ".truth.json", "w"))
print(len(faces), "faces in", (len(faces) + N - 1) // N, "PDFs")
