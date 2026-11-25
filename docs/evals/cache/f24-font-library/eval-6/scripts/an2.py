import sys, pikepdf, pypdfium2 as pdfium, ctypes, os
import pypdfium2.raw as raw
from PIL import Image
def analyse(p, needle=None, crop=None, png=None):
    pdf = pikepdf.open(p); probs = pdf.check_pdf_syntax() if hasattr(pdf,'check_pdf_syntax') else pdf.check()
    print("==", p, os.path.getsize(p), "B; syntax problems:", probs, "pages", len(pdf.pages))
    pg = pdf.pages[0]
    for k, d in (pg.Resources.get("/Font", {}) or {}).items():
        if d.get("/Subtype") == "/Type0": df = d.DescendantFonts[0]; desc = df.get("/FontDescriptor"); sub = "Type0"
        else: desc = d.get("/FontDescriptor"); sub = str(d.get("/Subtype"))
        emb = [ff + ":" + str(len(desc[ff].read_bytes())) for ff in ("/FontFile", "/FontFile2", "/FontFile3") if desc is not None and ff in desc]
        print("   font", k, d.get("/BaseFont"), sub, emb)
    doc = pdfium.PdfDocument(p); page = doc[0]; tp = page.get_textpage(); n = tp.count_chars()
    full = "".join(chr(raw.FPDFText_GetUnicode(tp, i)) for i in range(n))
    print("   text:", repr(tp.get_text_range()[:400]))
    if needle and needle in full:
        s = full.find(needle); runs = []
        for i in range(s, s + len(needle)):
            buf = ctypes.create_string_buffer(256); fl = ctypes.c_int(); raw.FPDFText_GetFontInfo(tp, i, buf, 256, ctypes.byref(fl))
            l, r, b, t = (ctypes.c_double() for _ in range(4)); raw.FPDFText_GetCharBox(tp, i, ctypes.byref(l), ctypes.byref(r), ctypes.byref(b), ctypes.byref(t))
            nm = buf.value.decode("latin1")
            if runs and runs[-1][1] == nm: runs[-1][0] += full[i]; runs[-1][3] = round(r.value, 1)
            else: runs.append([full[i], nm, round(l.value, 1), round(r.value, 1)])
        for r in runs: print("   run", repr(r[0]), r[1], r[2], "->", r[3])
    elif needle: print("   needle not found:", needle)
    if png:
        im = page.render(scale=2).to_pil()
        if crop: im = im.crop(crop)
        im.save(png)
if __name__ == "__main__":
    a = sys.argv[1:]; analyse(a[0], a[1] if len(a) > 1 else None, tuple(int(x) for x in a[2].split(",")) if len(a) > 2 and a[2] else None, a[3] if len(a) > 3 else None)
