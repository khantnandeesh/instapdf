"""Word-style complex-script PDF: shaped glyphs in visual order, per-glyph ToUnicode, no ActualText.
Full fonts embedded (GSUB/GPOS kept). uharfbuzz (Apache-2.0) + pikepdf (MPL-2.0), test-only."""
import sys, uharfbuzz as hb, pikepdf
from fontTools.ttLib import TTFont
from pikepdf import Name, Dictionary, Array, String

FONTS = sys.argv[1]
OUT = sys.argv[2]
W, H = 595.28, 841.89
lines = [
    ("deva", 14, "कुल राशि का भुगतान समय पर किया गया।"),
    ("deva", 14, "प्रधानमंत्री ने आज स्वास्थ्य क्षेत्र के लिए ₹ 5,000 करोड़ की योजना की घोषणा की।"),
    ("deva", 14, "हिंदी में पूर्ण विराम और अर्धविराम का प्रयोग।"),
    ("arab", 15, "مرحبا بالعالم، هذا نص تجريبي."),
    ("arab", 15, "المبلغ الإجمالي 2500 ريال للفاتورة رقم 77."),
]
faces = {"deva": f"{FONTS}/NotoSansDevanagari-Regular.ttf", "arab": f"{FONTS}/NotoNaskhArabic-Regular.ttf"}
pdf = pikepdf.new()
fontobjs, tounis, widths = {}, {}, {}
for key, path in faces.items():
    data = open(path, "rb").read()
    tt = TTFont(path)
    upem = tt["head"].unitsPerEm
    face = hb.Face(data); font = hb.Font(face)
    rev = {}
    for cp, gn in tt.getBestCmap().items():
        rev.setdefault(tt.getGlyphID(gn), chr(cp))
    fontobjs[key] = dict(data=data, tt=tt, upem=upem, font=font, rev=rev, used={}, tu={})

def shape(key, text, rtl):
    f = fontobjs[key]
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(f["font"], buf, {})
    return buf.glyph_infos, buf.glyph_positions

def bidi_runs(text):
    """Minimal UBA for an RTL paragraph: returns [(level, logical_run_text)] in visual order."""
    import unicodedata as ud
    t = []
    for ch in text:
        b = ud.bidirectional(ch)
        if b in ("R", "AL"): t.append("R")
        elif b == "L": t.append("L")
        elif b in ("EN", "AN"): t.append("N1")
        elif b == "NSM": t.append(t[-1] if t else "R")
        else: t.append("ON")
    lv = [None] * len(t)
    for i, x in enumerate(t):
        if x == "R": lv[i] = 1
        elif x in ("L", "N1"): lv[i] = 2
    for i in range(len(t)):
        if lv[i] is None:
            j = i
            while j < len(t) and lv[j] is None: j += 1
            prev = t[i - 1] if i > 0 else "R"
            nxt = t[j] if j < len(t) else "R"
            side = lambda x: "R" if x in ("R", "N1") else "L"
            # EN/AN count as R for neutrals (N1)
            lvl = 2 if (side(prev) == "L" and side(nxt) == "L") else 1
            for k in range(i, j): lv[k] = lvl
    runs = []
    for ch, l in zip(text, lv):
        if runs and runs[-1][0] == l: runs[-1][1] += ch
        else: runs.append([l, ch])
    # visual order: reverse sequences at level>=2, then all (level>=1)
    order = list(range(len(runs)))
    for k in (2, 1):
        i = 0
        while i < len(order):
            if runs[order[i]][0] >= k:
                j = i
                while j < len(order) and runs[order[j]][0] >= k: j += 1
                order[i:j] = order[i:j][::-1]; i = j
            else: i += 1
    return [("rtl" if runs[o][0] == 1 else "ltr", runs[o][1]) for o in order]

content = []
y = H - 80
for key, size, text in lines:
    f = fontobjs[key]; upem = f["upem"]
    rtl = key == "arab"
    pieces = []  # visual-order list of (gid, xadv, xoff, yoff, cluster_text_chars_for_gid)
    runs = [("ltr", text)] if not rtl else bidi_runs(text)
    for kind, rt in runs:
        if rtl and kind == "ltr":
            buf = hb.Buffer(); buf.add_str(rt); buf.direction = "ltr"; buf.script = "Arab"; buf.language = "ar"
        elif rtl:
            buf = hb.Buffer(); buf.add_str(rt); buf.direction = "rtl"; buf.script = "Arab"; buf.language = "ar"
        else:
            buf = hb.Buffer(); buf.add_str(rt); buf.guess_segment_properties()
        hb.shape(f["font"], buf, {})
        infos, poss = buf.glyph_infos, buf.glyph_positions
        # per-cluster char assignment (Word-like)
        clusters = sorted(set(i.cluster for i in infos))
        def cl_text(c):
            nxt = [x for x in clusters if x > c]
            e = min(nxt) if nxt else len(rt)
            return rt[c:e]
        assign = {}
        for c in clusters:
            idx = [k for k, i in enumerate(infos) if i.cluster == c]
            chars = list(cl_text(c))
            for k in idx:
                ch = f["rev"].get(infos[k].codepoint)
                if ch in chars:
                    assign[k] = ch; chars.remove(ch)
            rest = [k for k in idx if k not in assign]
            if rest:
                first = rest[-1] if (kind == "rtl") else rest[0]
                assign[first] = "".join(chars)
                for k in rest:
                    if k != first: assign[k] = ""
            elif chars:
                assign[idx[0]] = assign[idx[0]] + "".join(chars)
        for k, (i, p) in enumerate(zip(infos, poss)):
            pieces.append((i.codepoint, p.x_advance, p.x_offset, p.y_offset, assign.get(k, "")))
    total = sum(p[1] for p in pieces) * size / upem
    x = W - 56 - total if rtl else 56
    tj = []
    rise = 0
    ops = [f"BT /F{key} {size} Tf 1 0 0 1 {x:.3f} {y:.3f} Tm".encode()]
    pending = 0.0
    for gid, adv, xo, yo, t in pieces:
        hm = f["tt"]["hmtx"][f["tt"].getGlyphName(gid)][0]
        f["used"][gid] = hm
        if t and gid not in f["tu"]:
            f["tu"][gid] = t
        if yo != rise:
            if tj:
                ops.append(b"[" + b" ".join(tj) + b"] TJ"); tj = []
            ops.append(f"{yo*size/upem:.3f} Ts".encode()); rise = yo
        k = -(xo) * 1000 / upem + pending
        if abs(k) > 1e-6: tj.append(f"{k:.2f}".encode())
        tj.append(b"<%04X>" % gid)
        pending = -(adv - xo - hm) * 1000 / upem
    if tj: ops.append(b"[" + b" ".join(tj) + b"] TJ")
    ops.append(b"0 Ts ET")
    content.append(b"\n".join(ops))
    y -= 32

for key, f in fontobjs.items():
    k = 1000 / f["upem"]
    ff = pikepdf.Stream(pdf, f["data"]); ff["/Length1"] = len(f["data"])
    tt = f["tt"]
    desc = pdf.make_indirect(Dictionary(Type=Name.FontDescriptor, FontName=Name("/" + tt["name"].getDebugName(6)), Flags=4,
        FontBBox=Array([tt["head"].xMin * k, tt["head"].yMin * k, tt["head"].xMax * k, tt["head"].yMax * k]), ItalicAngle=0,
        Ascent=tt["hhea"].ascent * k, Descent=tt["hhea"].descent * k, CapHeight=700, StemV=80, FontFile2=ff))
    w = Array()
    for gid in sorted(f["used"]):
        w.append(gid); w.append(Array([round(f["used"][gid] * k)]))
    cid = Dictionary(Type=Name.Font, Subtype=Name.CIDFontType2, BaseFont=Name("/" + tt["name"].getDebugName(6)),
        CIDSystemInfo=Dictionary(Registry=String("Adobe"), Ordering=String("Identity"), Supplement=0), FontDescriptor=desc, DW=1000, W=w,
        CIDToGIDMap=Name.Identity)
    cm = ["/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange"]
    items = [(g, t) for g, t in sorted(f["tu"].items()) if t]
    cm.append(f"{len(items)} beginbfchar")
    for g, t in items:
        cm.append("<%04X> <%s>" % (g, t.encode("utf-16-be").hex().upper()))
    cm.append("endbfchar endcmap CMapName currentdict /CMap defineresource pop end end")
    tu = pikepdf.Stream(pdf, "\n".join(cm).encode())
    t0 = pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type0, BaseFont=Name("/" + tt["name"].getDebugName(6)), Encoding=Name("/Identity-H"),
        DescendantFonts=Array([pdf.make_indirect(cid)]), ToUnicode=tu))
    fontobjs[key]["obj"] = t0

res = Dictionary(Font=Dictionary({("/F" + k): v["obj"] for k, v in fontobjs.items()}))
page = pikepdf.Page(Dictionary(Type=Name.Page, MediaBox=Array([0, 0, W, H]), Resources=res, Contents=pikepdf.Stream(pdf, b"\n".join(content))))
pdf.pages.append(page)
pdf.save(OUT, deterministic_id=True, compress_streams=True)
