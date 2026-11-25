# Sixth evaluation: for every file saved in the AC-312 runs, which font object maps each typed letter (ToUnicode), whether that object carries a font program,
# and the edited line as PDFium reads it. Usage: python3 out312.py out/s312r-*.pdf
import sys, re, os, pikepdf, pypdfium2
WANT = "ř⸘Ω⸙नयाk"
for p in sys.argv[1:]:
    pdf = pikepdf.open(p); rows = []
    for o in pdf.objects:
        try:
            if not isinstance(o, pikepdf.Dictionary) or o.get("/Type") != "/Font" or "/ToUnicode" not in o: continue
        except Exception: continue
        cm = o.ToUnicode.read_bytes().decode("latin1"); got = []
        for m in re.finditer(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]{4,})>", cm):
            try: u = bytes.fromhex(m.group(2)).decode("utf-16-be")
            except Exception: continue
            if any(c in WANT for c in u): got.append(u)
        name = str(o.get("/BaseFont"))
        if not re.match(r"/BERRY", name): got = [g for g in got if g != "k"]  # the source fonts' own k is not of interest
        if not got: continue
        d = o.DescendantFonts[0].get("/FontDescriptor") if o.get("/Subtype") == "/Type0" else o.get("/FontDescriptor")
        prog = [k for k in ("/FontFile", "/FontFile2", "/FontFile3") if d is not None and k in d]
        rows.append(f"{name} {''.join(got)} {'program ' + str(len(d[prog[0]].read_bytes())) + ' B' if prog else 'NO PROGRAM'}")
    doc = pypdfium2.PdfDocument(p); t = doc[0].get_textpage().get_text_range(); line = [l for l in t.splitlines() if any(c in l for c in "ř⸘Ω⸙न")]
    print(os.path.basename(p), os.path.getsize(p), "B |", " ; ".join(sorted(rows)), "| line:", [l[-24:] for l in line][:2])
