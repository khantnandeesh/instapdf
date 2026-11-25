# AC-283 fixtures: PDFs that only NAME the fonts (no font program). Widths declared = the twin's widths (the definition of metric-compatible).
import pikepdf, json
from fontTools.ttLib import TTFont
from pikepdf import Name, Dictionary, Array
W = "lib/woff/"
FONTS = [  # ps name, twin woff, flags(serif=2,fixed=1,italic=64,nonsymbolic=32), label
 ("ArialMT", "arimo_latin-400-normal", 32, "Arial"), ("Helvetica", "arimo_latin-400-normal", 32, "Helvetica"),
 ("TimesNewRomanPSMT", "tinos_latin-400-normal", 34, "Times New Roman"), ("Times-Roman", "tinos_latin-400-normal", 34, "Times"),
 ("CourierNewPSMT", "cousine_latin-400-normal", 35, "Courier New"), ("Courier", "cousine_latin-400-normal", 35, "Courier"),
 ("Calibri", "carlito_latin-400-normal", 32, "Calibri"), ("Cambria", "caladea_latin-400-normal", 34, "Cambria"),
 ("Georgia", "gelasio_latin-400-normal", 34, "Georgia"), ("SegoeUI", "selawik_latin-400-normal", 32, "Segoe UI"),
 ("Arial-BoldMT", "arimo_latin-700-normal", 32, "Arial Bold"), ("TimesNewRomanPS-ItalicMT", "tinos_latin-400-italic", 98, "Times New Roman Italic"),
 ("Calibri-Bold", "carlito_latin-700-normal", 32, "Calibri Bold"), ("SegoeUI-Bold", "selawik_latin-700-normal", 32, "Segoe UI Bold"),
]
import glob
def woff(k):
    g = glob.glob(W + k + ".*.woff"); return g[0]
def build(out, fonts, std14_plain=False):
    pdf = pikepdf.new(); res = Dictionary(Font=Dictionary()); ops = []; y = 790; truth = []
    for i, (ps, tw, flags, label) in enumerate(fonts):
        f = TTFont(woff(tw)); cmap = f.getBestCmap(); hm = f["hmtx"].metrics; upm = f["head"].unitsPerEm
        widths = [round(hm[cmap[c]][0] * 1000 / upm) if c in cmap else 0 for c in range(32, 127)]
        os2 = f["OS/2"]; hh = f["hhea"]
        if std14_plain and ps in ("Helvetica", "Times-Roman", "Courier"):
            fd = Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name("/" + ps), Encoding=Name.WinAnsiEncoding)
        else:
            desc = pdf.make_indirect(Dictionary(Type=Name.FontDescriptor, FontName=Name("/" + ps), Flags=flags, FontBBox=Array([-200, -250, 1200, 950]), ItalicAngle=(-12 if flags & 64 else 0), Ascent=round(hh.ascent * 1000 / upm), Descent=round(hh.descent * 1000 / upm), CapHeight=700, StemV=(140 if "Bold" in ps else 80)))
            fd = Dictionary(Type=Name.Font, Subtype=Name.TrueType, BaseFont=Name("/" + ps), FirstChar=32, LastChar=126, Widths=Array(widths), FontDescriptor=desc, Encoding=Name.WinAnsiEncoding)
        res.Font[f"/F{i}"] = pdf.make_indirect(fd)
        text = f"{label} invoice: total due 450 on time"
        tail = "END"
        w = sum(widths[ord(ch) - 32] for ch in text) * 14 / 1000
        ops.append(f"BT /F{i} 14 Tf 1 0 0 1 60 {y} Tm ({text}) Tj ET")
        ops.append(f"BT /F{i} 14 Tf 1 0 0 1 500 {y} Tm ({tail}) Tj ET")
        truth.append(dict(ps=ps, label=label, twin=tw, text=text, y=y, width_pt=round(w, 3)))
        y -= 40
    page = pdf.add_blank_page(page_size=(595, 842)); page.Resources = res; page.Contents = pdf.make_stream("\n".join(ops).encode())
    pdf.save(out); json.dump(truth, open(out[:-4] + ".truth.json", "w"), indent=1); print(out, len(fonts))
build("fx/ac283-named-only.pdf", FONTS)
build("fx/ac283-named-std14.pdf", [x for x in FONTS if x[0] in ("Helvetica", "Times-Roman", "Courier")], std14_plain=True)
