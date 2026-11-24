"""Builds the forms fixtures (spec F16 AC-230 to AC-247). Synthetic content only.

Needs reportlab (BSD), pikepdf (MPL-2.0) and pypdfium2 (Apache-2.0/BSD-3), all permissive.
The outputs are committed, so CI does not run this.

    python3 apps/web/tests/fixtures/forms/generate.py
"""
import io, os
import pikepdf
import pypdfium2 as pdfium
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = A4
pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))


def label_line(c, x, y, label, length, how="line"):
    c.setFont("Helvetica", 12)
    c.drawString(x, y, label)
    lx = x + c.stringWidth(label, "Helvetica", 12) + 6
    if how == "line":
        c.setLineWidth(0.75)
        c.line(lx, y - 2, lx + length, y - 2)
    elif how == "underscores":
        c.drawString(lx, y, "_" * int(length / c.stringWidth("_", "Helvetica", 12)))
    elif how == "dots":
        c.drawString(lx, y, "." * int(length / c.stringWidth(".", "Helvetica", 12)))
    return lx


def detect_mix():
    c = canvas.Canvas(os.path.join(HERE, "detect-mix.pdf"), pagesize=A4, invariant=1, pageCompression=0)
    # ---- page 1: every kind of blank ----
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(W / 2, H - 70, "Membership Form")
    y = H - 120
    label_line(c, 72, y, "Full name:", 300, "line"); y -= 34
    label_line(c, 72, y, "Address:", 300, "underscores"); y -= 34
    label_line(c, 72, y, "City", 300, "dots"); y -= 34
    label_line(c, 72, y, "Date of birth:", 160, "line"); y -= 40
    # comb: PIN code, 6 joined boxes
    c.setFont("Helvetica", 12)
    c.drawString(72, y, "PIN code")
    c.setLineWidth(0.75)
    bx = 140
    for i in range(6):
        c.rect(bx + i * 18, y - 5, 18, 20, stroke=1, fill=0)
    y -= 44
    # multiline box
    c.drawString(72, y, "Comments")
    c.rect(72, y - 78, 400, 66, stroke=1, fill=0)
    y -= 110
    # radio group: circles
    c.drawString(72, y, "Member type?")
    ox = 72
    y -= 24
    for opt in ("Student", "Staff", "Guest"):
        c.circle(ox + 6, y + 4, 6, stroke=1, fill=0)
        c.drawString(ox + 18, y, opt)
        ox += 110
    y -= 34
    # checkbox glyph and drawn square
    c.setFont("DejaVu", 14)
    c.drawString(72, y, "☐")
    c.setFont("Helvetica", 12)
    c.drawString(92, y, "I accept the rules")
    c.rect(260, y - 2, 12, 12, stroke=1, fill=0)
    c.drawString(278, y, "Email me news")
    y -= 90
    # signature line with the label under it, and a date line beside it
    c.line(72, y, 272, y)
    c.drawString(72, y - 14, "Signature")
    c.line(340, y, 480, y)
    c.drawString(340, y - 14, "Date")
    c.showPage()

    # ---- page 2: things that are not blanks ----
    c.setLineWidth(1)
    c.rect(24, 24, W - 48, H - 48, stroke=1, fill=0)  # page border
    c.setFont("Helvetica-Bold", 18)
    c.drawString(72, H - 80, "Rules of the club")
    c.line(72, H - 90, W - 72, H - 90)  # separator across the text column
    c.setFont("Helvetica", 12)
    y = H - 120
    for line in [
        "Members must sign in at the front desk before each visit.",
        "Guests are welcome on weekends when a member comes with them.",
        "The club closes at nine in the evening on weekdays.",
    ]:
        c.drawString(72, y, line)
        y -= 16
    # underlined words
    c.drawString(72, y, "Read the")
    ux = 72 + c.stringWidth("Read the ", "Helvetica", 12)
    word = "membership handbook"
    c.drawString(ux, y, word)
    c.setLineWidth(0.6)
    c.line(ux, y - 2, ux + c.stringWidth(word, "Helvetica", 12), y - 2)
    c.drawString(ux + c.stringWidth(word + " ", "Helvetica", 12), y, "before your first visit.")
    y -= 40
    # a table whose cells all hold text
    cols = [72, 222, 372, 522]
    rows = ["Day", "Opens", "Closes"], ["Monday", "6 am", "9 pm"], ["Saturday", "8 am", "6 pm"]
    c.setLineWidth(0.75)
    for r, cells in enumerate(rows):
        top = y - r * 24
        for ci, text in enumerate(cells):
            c.rect(cols[ci], top - 24, cols[ci + 1] - cols[ci], 24, stroke=1, fill=0)
            c.drawString(cols[ci] + 6, top - 17, text)
    c.showPage()

    # ---- page 3: a page that already has a field ----
    c.setFont("Helvetica", 12)
    label_line(c, 72, H - 120, "Phone:", 220, "line")
    label_line(c, 72, H - 160, "Mobile:", 220, "line")
    lx = 72 + c.stringWidth("Phone:", "Helvetica", 12) + 6
    c.acroForm.textfield(name="phone", x=lx, y=H - 122, width=220, height=16, borderWidth=0, fillColor=None, forceBorder=False)
    c.showPage()
    c.save()


def form_basic():
    path = os.path.join(HERE, "form-basic.pdf")
    c = canvas.Canvas(path, pagesize=A4, invariant=1, pageCompression=0)
    f = c.acroForm
    c.setFont("Helvetica", 12)
    y = H - 90
    c.drawString(72, y, "Name"); f.textfield(name="name", tooltip="Your name", x=160, y=y - 4, width=240, height=18, value="", maxlen=40, borderWidth=1); y -= 36
    c.drawString(72, y, "Notes"); f.textfield(name="notes", x=160, y=y - 40, width=240, height=54, value="", fieldFlags="multiline", borderWidth=1); y -= 72
    c.drawString(72, y, "PIN"); f.textfield(name="pin", x=160, y=y - 4, width=120, height=18, maxlen=6, fieldFlags="comb", borderWidth=1); y -= 36
    c.drawString(72, y, "Agree"); f.checkbox(name="agree", x=160, y=y - 4, size=14, buttonStyle="check", borderWidth=1); y -= 36
    c.drawString(72, y, "Size")
    for i, v in enumerate(("small", "medium", "large")):
        f.radio(name="size", value=v, x=160 + i * 60, y=y - 4, size=14, selected=(v == "medium"), borderWidth=1)
    y -= 36
    c.drawString(72, y, "Colour"); f.choice(name="colour", x=160, y=y - 4, width=120, height=18, options=["Red", "Green", "Blue"], value="Green", borderWidth=1); y -= 36
    c.drawString(72, y, "Days"); f.listbox(name="days", x=160, y=y - 50, width=120, height=56, options=["Mon", "Tue", "Wed", "Thu"], value=["Tue"], fieldFlags="multiSelect", borderWidth=1); y -= 80
    c.drawString(72, y, "Code"); f.textfield(name="code", x=160, y=y - 4, width=120, height=18, value="A-17", fieldFlags="readOnly", borderWidth=1); y -= 36
    c.drawString(72, y, "Email"); f.textfield(name="email", x=160, y=y - 4, width=240, height=18, value="", fieldFlags="required", borderWidth=1); y -= 36
    c.drawString(72, y, "Street"); street_y = y - 4; y -= 36
    c.drawString(72, y, "Town"); town_y = y - 4; y -= 36
    c.drawString(72, y, "Signature"); sig_y = y - 4
    c.showPage()
    c.save()

    # Hierarchical field (address.street, address.town) and a signature field, which reportlab cannot make.
    with pikepdf.open(path, allow_overwriting_input=True) as pdf:
        page = pdf.pages[0]
        acro = pdf.Root.AcroForm
        da = pikepdf.String("/Helv 0 Tf 0 g")
        parent = pdf.make_indirect(pikepdf.Dictionary(T=pikepdf.String("address"), FT=pikepdf.Name.Tx, Kids=pikepdf.Array()))
        for name, yy, bw in (("street", street_y, 2), ("town", town_y, 1)):
            kid = pdf.make_indirect(pikepdf.Dictionary(
                Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Widget, T=pikepdf.String(name), Parent=parent,
                Rect=[160, yy, 400, yy + 18], F=4, DA=da, P=page.obj, MK=pikepdf.Dictionary(BC=[0, 0, 0]), Border=[0, 0, bw]))
            parent.Kids.append(kid)
            page.obj.Annots.append(kid)
        acro.Fields.append(parent)
        sig = pdf.make_indirect(pikepdf.Dictionary(
            Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Widget, FT=pikepdf.Name.Sig, T=pikepdf.String("signature"),
            Rect=[160, sig_y, 400, sig_y + 36], F=4, P=page.obj))
        page.obj.Annots.append(sig)
        acro.Fields.append(sig)
        if "/Helv" not in acro.get("/DR", pikepdf.Dictionary()).get("/Font", pikepdf.Dictionary()):
            pass
        pdf.save(path, deterministic_id=True)


def scan_form():
    """Page 1 of detect-mix.pdf as a 150 dpi greyscale image, with no text layer."""
    src = pdfium.PdfDocument(os.path.join(HERE, "detect-mix.pdf"))
    img = src[0].render(scale=150 / 72, grayscale=True).to_pil()
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    from reportlab.lib.utils import ImageReader
    c = canvas.Canvas(os.path.join(HERE, "scan-form.pdf"), pagesize=A4, invariant=1)
    c.drawImage(ImageReader(buf), 0, 0, W, H)
    c.showPage()
    c.save()


def form_extra():
    """An editable dropdown, a push button, and a page whose crop box does not start at 0,0 (AC-230, AC-238)."""
    path = os.path.join(HERE, "form-extra.pdf")
    c = canvas.Canvas(path, pagesize=(700, 900), invariant=1, pageCompression=0)
    f = c.acroForm
    c.setFont("Helvetica", 12)
    c.drawString(122, 800, "City")
    f.choice(name="city", x=200, y=796, width=160, height=18, options=["Pune", "Delhi", "Chennai"], value="Pune", fieldFlags="combo edit", borderWidth=1)
    c.drawString(122, 760, "Reset the form")
    c.drawString(122, 720, "Crop box starts at 50, 60; this page is 595 x 820 as shown.")
    c.showPage()
    c.save()
    with pikepdf.open(path, allow_overwriting_input=True) as pdf:
        page = pdf.pages[0]
        page.obj.CropBox = [50, 60, 645, 880]
        ap = pdf.make_stream(b"0.85 g 0 0 90 20 re f 0 g BT /Helv 10 Tf 22 6 Td (Reset) Tj ET")
        ap.Type = pikepdf.Name.XObject
        ap.Subtype = pikepdf.Name.Form
        ap.BBox = [0, 0, 90, 20]
        ap.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(Helv=pdf.Root.AcroForm.DR.Font.Helv))
        btn = pdf.make_indirect(pikepdf.Dictionary(
            Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Widget, FT=pikepdf.Name.Btn, Ff=65536, T=pikepdf.String("reset"),
            Rect=[220, 754, 310, 774], F=4, P=page.obj, MK=pikepdf.Dictionary(CA=pikepdf.String("Reset")),
            AP=pikepdf.Dictionary(N=ap), A=pikepdf.Dictionary(S=pikepdf.Name.ResetForm)))
        page.obj.Annots.append(btn)
        pdf.Root.AcroForm.Fields.append(btn)
        pdf.save(path, deterministic_id=True)


if __name__ == "__main__":
    detect_mix()
    form_basic()
    scan_form()
    form_extra()
