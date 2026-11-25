# every font object of a PDF with its embedded program (hash, size); with two files, what the second adds or changes
import sys, pikepdf, hashlib, os
def fonts(p):
    pdf = pikepdf.open(p); out = {}; probs = pdf.check_pdf_syntax() if hasattr(pdf, "check_pdf_syntax") else pdf.check()
    for o in pdf.objects:
        try:
            if not isinstance(o, pikepdf.Dictionary) or o.get("/Type") != "/Font" or o.get("/Subtype") in ("/CIDFontType0", "/CIDFontType2"): continue
        except Exception: continue
        d = o; desc = d.DescendantFonts[0].get("/FontDescriptor") if d.get("/Subtype") == "/Type0" else d.get("/FontDescriptor")
        emb = None
        if desc is not None:
            for ff in ("/FontFile", "/FontFile2", "/FontFile3"):
                if ff in desc: b = desc[ff].read_bytes(); emb = (ff, len(b), hashlib.sha256(b).hexdigest()[:10])
        out.setdefault((str(d.get("/BaseFont")), str(d.get("/Subtype"))), []).append(emb)
    return out, probs, len(pdf.pages)
a, pa, na = fonts(sys.argv[1])
if len(sys.argv) == 2:
    print(os.path.basename(sys.argv[1]), os.path.getsize(sys.argv[1]), "B pages", na, "syntax", pa)
    for k, v in sorted(a.items()): print("  ", k, v)
else:
    b, pb, nb = fonts(sys.argv[2]); print(os.path.basename(sys.argv[2]), os.path.getsize(sys.argv[1]), "->", os.path.getsize(sys.argv[2]), "B; pages", na, nb, "; syntax", pb)
    for k in sorted(set(a) | set(b)):
        if a.get(k) != b.get(k): print("   changed/added:", k, "src", a.get(k), "out", b.get(k))
    untouched = [k for k in a if a.get(k) == b.get(k)]; print("   source fonts unchanged:", len(untouched), "of", len(a), "| source fonts with no program that gained one:", [k for k in a if all(e is None for e in a[k]) and k in b and any(e is not None for e in b[k])])
