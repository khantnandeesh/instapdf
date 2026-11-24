"""Builds reportlab-mono-subset.pdf: one line in a subset of Roboto Mono (Apache-2.0), embedded by
reportlab as a simple TrueType font under a made-up name. reportlab writes a wrong advance table
into fixed-pitch subsets (600 units in a 2048 em) while the PDF's /Widths are right (600/1000):
readers go by /Widths, and so must the editor when it shows or matches the font.

Run from the repo root: python3 tests/parity/editor/gen_mono_subset.py
Needs reportlab and fontTools (both BSD/MIT)."""
import glob, os, tempfile
from fontTools.ttLib import TTFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLFont

src = glob.glob("apps/web/public/fonts/lib/fonts/roboto-mono/latin-400-normal.*.woff")[0]
font = TTFont(src)
font.flavor = None
for rec in font["name"].names:
    if rec.nameID in (1, 4, 6, 16):
        rec.string = "FixtureMono"
ttf = os.path.join(tempfile.mkdtemp(), "FixtureMono.ttf")
font.save(ttf)
pdfmetrics.registerFont(RLFont("FixtureMono", ttf))
c = canvas.Canvas("tests/parity/editor/reportlab-mono-subset.pdf", pagesize=(595, 842), invariant=1)
c.setFont("FixtureMono", 12)
c.drawString(40, 780, "The quick brown fox jumps over the lazy dog 0123456789")
c.save()
