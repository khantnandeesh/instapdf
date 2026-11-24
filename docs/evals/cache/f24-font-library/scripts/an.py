# analyse a PDF: fonts, text, per-char font for a search string, qpdf check
import sys, pikepdf, pypdfium2 as pdfium, ctypes
import pypdfium2.raw as raw
def fonts(path):
    pdf = pikepdf.open(path); out = []
    for i, pg in enumerate(pdf.pages):
        for k, v in (pg.get("/Resources", {}).get("/Font", {}) or {}).items():
            d = v
            desc = None
            if d.get("/Subtype") == "/Type0":
                df = d.DescendantFonts[0]; desc = df.get("/FontDescriptor"); sub = "Type0/" + str(df.get("/Subtype"))
            else:
                desc = d.get("/FontDescriptor"); sub = str(d.get("/Subtype"))
            emb = None
            if desc is not None:
                for ff in ("/FontFile", "/FontFile2", "/FontFile3"):
                    if ff in desc: emb = ff + ":" + str(len(desc[ff].read_bytes()))
            out.append((i + 1, k, str(d.get("/BaseFont")), sub, emb, "/ToUnicode" in d))
    problems = pdf.check_pdf_syntax() if hasattr(pdf, "check_pdf_syntax") else pdf.check()
    return out, problems
def chars(path, needle=None, page=0):
    doc = pdfium.PdfDocument(path); pg = doc[page]; tp = pg.get_textpage()
    text = tp.get_text_range()
    res = []
    if needle and needle in text:
        n = tp.count_chars(); 
        # map char index -> font name
        full = "".join(chr(raw.FPDFText_GetUnicode(tp, i)) for i in range(n))
        s = full.find(needle)
        for i in range(s, s + len(needle)):
            buf = ctypes.create_string_buffer(256); flags = ctypes.c_int()
            raw.FPDFText_GetFontInfo(tp, i, buf, 256, ctypes.byref(flags))
            l, r, b, t = ctypes.c_double(), ctypes.c_double(), ctypes.c_double(), ctypes.c_double()
            raw.FPDFText_GetCharBox(tp, i, ctypes.byref(l), ctypes.byref(r), ctypes.byref(b), ctypes.byref(t))
            res.append((full[i], buf.value.decode("latin1"), round(raw.FPDFText_GetFontSize(tp, i), 2), round(l.value, 2), round(r.value, 2), round(b.value,2)))
    return text, res
if __name__ == "__main__":
    p = sys.argv[1]; needle = sys.argv[2] if len(sys.argv) > 2 else None
    f, prob = fonts(p)
    import os
    print(p, os.path.getsize(p), "bytes; syntax problems:", prob)
    for x in f: print("  font", x)
    text, res = chars(p, needle)
    print(text)
    if res:
        runs = []
        for c in res:
            if runs and runs[-1][1] == c[1]: runs[-1][0] += c[0]; runs[-1][3] = c[4]
            else: runs.append([c[0], c[1], c[3], c[4], c[2]])
        for r in runs: print("  run", repr(r[0]), r[1], "x", r[2], "->", r[3], "size", r[4])
