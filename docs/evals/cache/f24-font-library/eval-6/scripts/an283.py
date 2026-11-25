import sys, pikepdf, pypdfium2 as pdfium, ctypes, json
import pypdfium2.raw as raw
def lines(p):
    doc = pdfium.PdfDocument(p); tp = doc[0].get_textpage(); n = tp.count_chars(); out = {}
    for i in range(n):
        ch = chr(raw.FPDFText_GetUnicode(tp, i))
        if ch in "\r\n": continue
        l, r, b, t = (ctypes.c_double() for _ in range(4)); raw.FPDFText_GetCharBox(tp, i, ctypes.byref(l), ctypes.byref(r), ctypes.byref(b), ctypes.byref(t))
        ox, oy = ctypes.c_double(), ctypes.c_double(); raw.FPDFText_GetCharOrigin(tp, i, ctypes.byref(ox), ctypes.byref(oy))
        buf = ctypes.create_string_buffer(256); fl = ctypes.c_int(); raw.FPDFText_GetFontInfo(tp, i, buf, 256, ctypes.byref(fl))
        k = round(oy.value); out.setdefault(k, []).append((ox.value, ch, buf.value.decode("latin1"), l.value, r.value))
    return out
src, outp = sys.argv[1], sys.argv[2]
A, B = lines(src), lines(outp)
pdf = pikepdf.open(outp); print("syntax problems:", pdf.check_pdf_syntax() if hasattr(pdf, "check_pdf_syntax") else pdf.check())
for k, d in pdf.pages[0].Resources.Font.items():
    desc = d.DescendantFonts[0].get("/FontDescriptor") if d.get("/Subtype") == "/Type0" else d.get("/FontDescriptor")
    emb = [ff + ":" + str(len(desc[ff].read_bytes())) for ff in ("/FontFile", "/FontFile2", "/FontFile3") if desc is not None and ff in desc]
    print("  font", k, d.get("/BaseFont"), d.get("/Subtype"), emb)
for y in sorted(A, reverse=True):
    a = sorted(A[y]); b = sorted(B.get(y, []))
    def seg(cs):  # split main / END at x>=495
        m = [c for c in cs if c[0] < 495]; e = [c for c in cs if c[0] >= 495]; return m, e
    am, ae = seg(a); bm, be = seg(b)
    f = lambda cs: ("".join(c[1] for c in cs), round(cs[0][0], 2), round(max(c[4] for c in cs if c[1] != " "), 2)) if cs else None
    fonts = sorted(set(c[2] for c in bm))
    ta, tb = f(am), f(bm)
    # advance from origin of first char to origin of END-independent: last char origin
    la = am[-1][0] - am[0][0] if am else 0; lb = bm[-1][0] - bm[0][0] if bm else 0
    print(y, repr(ta[0][:22]), "->", repr(tb[0][-12:]) if tb else None, "| x0", ta[1], tb and tb[1], "| inkR", ta[2], tb and tb[2], "| lastOrigin d", round(lb - la, 3), "| END x", ae and round(ae[0][0], 2), be and round(be[0][0], 2), "| fonts", fonts)
