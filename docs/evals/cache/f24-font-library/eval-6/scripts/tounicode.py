# which font object of a PDF maps which of the given characters (from its ToUnicode map), and the page text around a marker
import sys, re, pikepdf
pdf = pikepdf.open(sys.argv[1]); want = sys.argv[2]
for o in pdf.objects:
    try:
        if not isinstance(o, pikepdf.Dictionary) or o.get("/Type") != "/Font" or "/ToUnicode" not in o: continue
    except Exception: continue
    cm = o.ToUnicode.read_bytes().decode("latin1"); got = []
    for m in re.finditer(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]{4,})>", cm):
        try: u = bytes.fromhex(m.group(2)).decode("utf-16-be")
        except Exception: continue
        if any(c in want for c in u): got.append(u + "@" + m.group(1))
    if got: print("  ", str(o.get("/BaseFont")), str(o.get("/Subtype")), got)
