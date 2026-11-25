import sys, pypdfium2 as pdfium, ctypes
import pypdfium2.raw as raw
doc = pdfium.PdfDocument(sys.argv[1]); tp = doc[0].get_textpage(); n = tp.count_chars(); needle = sys.argv[2]
full = "".join(chr(raw.FPDFText_GetUnicode(tp, i)) for i in range(n)); print("count of needle:", full.count(needle))
s = full.find(needle); e = full.find("\n", s); runs = []
for i in range(s, e if e > 0 else n):
    buf = ctypes.create_string_buffer(256); fl = ctypes.c_int(); raw.FPDFText_GetFontInfo(tp, i, buf, 256, ctypes.byref(fl)); sz = raw.FPDFText_GetFontSize(tp, i)
    l, r, b, t = (ctypes.c_double() for _ in range(4)); raw.FPDFText_GetCharBox(tp, i, ctypes.byref(l), ctypes.byref(r), ctypes.byref(b), ctypes.byref(t)); nm = buf.value.decode("latin1") + "@" + str(round(sz, 1))
    if runs and runs[-1][1] == nm: runs[-1][0] += full[i]; runs[-1][3] = round(r.value, 1)
    else: runs.append([full[i], nm, round(l.value, 1), round(r.value, 1), round(b.value, 1)])
for r in runs: print("  run", repr(r[0]), r[1], r[2], "->", r[3], "y", r[4])
