"""Builds the synthetic editor corpus (docs/process/editor-micro-checks.md §1).

Needs reportlab, LibreOffice (soffice) and Node with Playwright's Chromium. The outputs are
committed, so CI does not run this; rerun it only to add or change a fixture.

    python3 tests/parity/editor/generate.py
"""
import os, subprocess, tempfile, textwrap
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = A4


def std14():
    c = canvas.Canvas(os.path.join(HERE, "std14-reportlab.pdf"), pagesize=A4, invariant=1, pageCompression=0)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(72, H - 90, "Quarterly review")
    c.setFont("Times-Roman", 12)
    y = H - 130
    for line in [
        "This page is a synthetic test paragraph with several lines of",
        "plain text. Each page of the report was checked twice before",
        "it went to the client on Friday afternoon.",
    ]:
        c.drawString(72, y, line)
        y -= 15
    c.setFont("Helvetica", 11)
    c.setFillColorRGB(0.1, 0.2, 0.6)
    c.drawString(72, y - 20, "Invoice 2041")
    c.setFillColorRGB(0, 0, 0)
    c.drawString(300, y - 20, "Amount due: 45,000")
    c.rect(72, y - 80, 200, 40, stroke=1, fill=0)
    c.setFont("Courier", 10)
    c.drawString(80, y - 62, "REF-7731-ZEBRA")
    c.showPage()
    c.save()


def shared_xobject():
    c = canvas.Canvas(os.path.join(HERE, "shared-xobject.pdf"), pagesize=A4, invariant=1, pageCompression=0)
    c.beginForm("letterhead")
    c.setFont("Helvetica-Bold", 14)
    c.drawString(72, H - 60, "Northwind Traders")
    c.setFont("Helvetica", 9)
    c.drawString(72, H - 74, "12 Harbour Road, Pune")
    c.line(72, H - 80, W - 72, H - 80)
    c.endForm()
    for n in (1, 2, 3):
        c.doForm("letterhead")
        c.setFont("Times-Roman", 12)
        c.drawString(72, H - 120, f"Body text of page {n}.")
        c.showPage()
    c.save()


def rotated():
    # A landscape page stored as a portrait MediaBox with /Rotate 90.
    c = canvas.Canvas(os.path.join(HERE, "rotated-90.pdf"), pagesize=A4, invariant=1, pageCompression=0)
    c.setPageRotation(90)
    c.setFont("Helvetica", 14)
    c.drawString(72, 500, "Landscape notice board")
    c.saveState()
    c.translate(300, 200)
    c.rotate(90)
    c.setFont("Times-Italic", 12)
    c.drawString(0, 0, "Sideways margin note")
    c.restoreState()
    c.showPage()
    c.save()


FODT = """<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
 <office:font-face-decls><style:font-face style:name="Carlito" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" svg:font-family="Carlito"/></office:font-face-decls>
 <office:styles>
  <style:default-style style:family="paragraph"><style:text-properties style:font-name="Carlito" fo:font-size="12pt"/></style:default-style>
  <style:style style:name="H" style:family="paragraph"><style:text-properties style:font-name="Carlito" fo:font-size="18pt" fo:font-weight="bold"/></style:style>
  <style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
 </office:styles>
 <office:body><office:text>
  <text:p text:style-name="H">Team memo</text:p>
  <text:p>The meeting moves to Friday at thirty minutes past nine.</text:p>
  <text:p>Please bring the <text:span text:style-name="B">signed</text:span> copies and the fee receipt.</text:p>
 </office:text></office:body>
</office:document>
"""


def libreoffice():
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "libreoffice-memo.fodt")
        open(src, "w").write(FODT)
        subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", HERE, src], check=True, capture_output=True)


HTML = """<!doctype html><meta charset="utf-8"><style>
@page { size: A4; margin: 25mm }
body { font: 12pt 'Liberation Serif', serif; color: #222 }
h1 { font: bold 22pt 'Caladea', serif; color: #7a1f3d }
p.j { text-align: justify; width: 150mm }
table { border-collapse: collapse; margin-top: 8mm } td { border: 0.5pt solid #555; padding: 2mm 4mm }
</style>
<h1>Service Agreement</h1>
<p class="j">This agreement is made between the <b>Provider</b> and the <i>Client</i> on the date shown below, and it stays in force until both sides have met every duty that the schedule lists for them in full.</p>
<p>Total amount due: ₹ 45,000 — including GST</p>
<table><tr><td>Item</td><td>Design</td></tr><tr><td>Fee</td><td>non-refundable</td></tr></table>
"""

NODE = """
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(process.argv[2]);
  await p.pdf({ path: process.argv[3], format: 'A4', printBackground: true });
  await b.close();
})();
"""


def chrome():
    with tempfile.TemporaryDirectory() as tmp:
        js = os.path.join(tmp, "print.js")
        open(js, "w").write(NODE)
        subprocess.run(["node", js, HTML, os.path.join(HERE, "chrome-justified-mixed.pdf")], check=True)


if __name__ == "__main__":
    std14()
    shared_xobject()
    rotated()
    libreoffice()
    chrome()
    print(sorted(f for f in os.listdir(HERE) if f.endswith(".pdf")))
