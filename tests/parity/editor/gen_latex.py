"""Builds LaTeX-style editor fixtures: Type 1 and Type1C subsets with an OT1-like Differences
encoding (ligatures at 11-15, quoteright, endash, dotlessi), TJ kerning, Tf 1 with the size in
Tm, a Ts-style footnote mark, a TOC line with dot leaders and a page number on the same
baseline, two columns, a zero-width combining accent, Tc/Tw/Tz, and a /Rotate 90 page.

Font: Bitstream Charter from the system's X11 Type 1 fonts (Bitstream's free licence permits
redistribution). Tools: fontTools (MIT), pikepdf (MPL-2.0). pdfTeX itself is not needed.
The outputs are committed; rerun only to change a fixture:

    python3 tests/parity/editor/gen_latex.py tests/parity/editor
"""
import io
import sys
from pathlib import Path

import pikepdf
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.t1Lib import T1Font
from fontTools.pens.basePen import NullPen


def gw(g):
    if not hasattr(g, "width"):
        g.draw(NullPen())
    return g.width

T1 = "/usr/share/fonts/X11/Type1/"
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

# OT1-like layout (as pdflatex writes for Computer Modern): ligatures at 11..15.
OT1 = {
    0x0B: "ff", 0x0C: "fi", 0x0D: "fl", 0x0E: "ffi", 0x0F: "ffl", 0x10: "dotlessi",
    0x13: "acute", 0x22: "quotedblright", 0x27: "quoteright", 0x2D: "hyphen",
    0x5C: "quotedblleft", 0x7F: "uni0308", 0x60: "quoteleft", 0x7B: "endash", 0x7C: "emdash",
}
for c in range(0x21, 0x7F):
    if c in OT1:
        continue
    ch = chr(c)
    names = {
        "!": "exclam", "#": "numbersign", "$": "dollar", "%": "percent", "&": "ampersand",
        "(": "parenleft", ")": "parenright", "*": "asterisk", "+": "plus", ",": "comma",
        ".": "period", "/": "slash", ":": "colon", ";": "semicolon", "=": "equal",
        "?": "question", "@": "at", "[": "bracketleft", "]": "bracketright",
        "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
        "6": "six", "7": "seven", "8": "eight", "9": "nine",
    }
    if ch.isalpha():
        OT1[c] = ch
    elif ch in names:
        OT1[c] = names[ch]


def load_t1(fname):
    f = T1Font(T1 + fname)
    f.parse()
    return f


def used_codes(content: bytes):
    """Codes used inside string literals of a content stream (simple parser)."""
    codes, i = set(), 0
    while i < len(content):
        if content[i] == 0x28:  # (
            depth, i = 1, i + 1
            while depth:
                c = content[i]
                if c == 0x5C:
                    nxt = content[i + 1]
                    if 0x30 <= nxt <= 0x37:
                        j = i + 1
                        while j < i + 4 and 0x30 <= content[j] <= 0x37:
                            j += 1
                        codes.add(int(content[i + 1:j], 8))
                        i = j
                        continue
                    codes.add({ord("n"): 10, ord("r"): 13}.get(nxt, nxt))
                    i += 2
                    continue
                if c == 0x28:
                    depth += 1
                elif c == 0x29:
                    depth -= 1
                    if not depth:
                        break
                codes.add(c)
                i += 1
        i += 1
    return codes


def ligature_outline(gs, parts, pen):
    x = 0
    for p in parts:
        g = gs[p]
        g.draw(TransformPen(pen, (1, 0, 0, 1, x, 0)))
        x += gw(g) - 30  # tighten like a real ligature
    return x + 30


def build_cff(t1, names, psname):
    """CFF (Type1C) subset holding `names`; ff/ffi/ffl are composed from f and i/l."""
    gs = t1.getGlyphSet()
    order = [".notdef"] + sorted(set(names) - {".notdef"})
    charstrings, widths = {}, {}
    for n in order:
        pen = T2CharStringPen(0, None)
        if n in gs:
            gs[n].draw(pen)
            w = gw(gs[n])
        elif n == "uni0308":
            gs["dieresis"].draw(TransformPen(pen, (1, 0, 0, 1, -gw(gs["dieresis"]) * 0.8, 0)))
            w = 0
        elif n in ("ff", "ffi", "ffl"):
            w = ligature_outline(gs, ["f"] * n.count("f") + ([n[-1]] if n[-1] != "f" else []), pen)
        else:
            w = 500
        widths[n] = int(round(w))
        charstrings[n] = pen.getCharString()
    fb = FontBuilder(1000, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({})
    fb.setupCFF(psname, {"FullName": psname}, charstrings, {})
    buf = io.BytesIO()
    fb.font.save(buf)
    from fontTools.ttLib import TTFont

    tt = TTFont(io.BytesIO(buf.getvalue()))
    cff = tt["CFF "]
    out = io.BytesIO()
    cff.cff.compile(out, tt)
    return out.getvalue(), widths


def build_t1_subset(t1, names):
    """Type 1 program holding only `names` (as pdflatex subsets do)."""
    cs = t1.font["CharStrings"]
    for n in list(cs.keys()):
        if n not in names and n != ".notdef":
            del cs[n]
    data = t1.createData()
    # createData returns the cleartext + eexec parts concatenated (PFA-like binary). Lengths:
    marker = b"eexec"
    k = data.index(marker) + len(marker)
    while data[k:k + 1] in (b"\r", b"\n"):
        k += 1
    tail = data.rfind(b"cleartomark")
    zeros = data.rfind(b"0" * 64, 0, tail)
    body_end = zeros if zeros > 0 else tail
    return data, k, body_end - k, len(data) - body_end


def font_dict(pdf, kind, prog, enc_map, widths_by_name, psname, flags=4 + 2, tounicode=None, bold=False):
    codes = sorted(enc_map)
    first, last = codes[0], codes[-1]
    widths = [widths_by_name.get(enc_map.get(c), 0) if c in enc_map else 0 for c in range(first, last + 1)]
    diffs = []
    prev = None
    for c in codes:
        if prev is None or c != prev + 1:
            diffs.append(c)
        diffs.append(pikepdf.Name("/" + enc_map[c]))
        prev = c
    desc = pikepdf.Dictionary(
        Type=pikepdf.Name.FontDescriptor, FontName=pikepdf.Name("/" + psname), Flags=flags,
        FontBBox=[-100, -250, 1100, 900], ItalicAngle=0, Ascent=700, Descent=-200, CapHeight=680,
        StemV=120 if bold else 80, FontWeight=700 if bold else 400,
    )
    if kind == "type1":
        data, l1, l2, l3 = prog
        st = pikepdf.Stream(pdf, data)
        st.Length1, st.Length2, st.Length3 = l1, l2, l3
        desc.FontFile = pdf.make_indirect(st)
    else:
        st = pikepdf.Stream(pdf, prog)
        st.Subtype = pikepdf.Name.Type1C
        desc.FontFile3 = pdf.make_indirect(st)
    fd = pikepdf.Dictionary(
        Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name("/" + psname),
        FirstChar=first, LastChar=last, Widths=widths,
        Encoding=pikepdf.Dictionary(Type=pikepdf.Name.Encoding, Differences=diffs),
        FontDescriptor=pdf.make_indirect(desc),
    )
    if tounicode is not None:
        fd.ToUnicode = pdf.make_indirect(pikepdf.Stream(pdf, tounicode))
    return pdf.make_indirect(fd)


def tounicode_cmap(enc_map, only=None):
    from fontTools.agl import toUnicode

    lines = []
    for c, n in sorted(enc_map.items()):
        if only is not None and c not in only:
            continue
        u = toUnicode(n)
        if n == "ff":
            u = "ff"
        elif n == "ffi":
            u = "ffi"
        elif n == "ffl":
            u = "ffl"
        elif n == "fi":
            u = "fi"
        elif n == "fl":
            u = "fl"
        if not u:
            continue
        hexu = "".join(f"{ord(ch):04X}" for ch in u)
        lines.append(f"<{c:02X}> <{hexu}>")
    body = "\n".join(lines)
    return (
        "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n"
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n"
        "/CMapName /Adobe-Identity-UCS def /CMapType 2 def\n"
        "1 begincodespacerange <00> <FF> endcodespacerange\n"
        f"{len(lines)} beginbfchar\n{body}\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end\n"
    ).encode()


# Content in pdflatex style. \013 ff, \014 fi, \015 fl, \016 ffi, \017 ffl, \047 quoteright,
# \173 endash, \020 dotlessi, \023 acute.
PAGE = rb"""
BT
/F1 9.9626 Tf 72 720 Td [(The)-333(e\013ect)-334(of)-333(\014nite)-333(sti\013ness)-333(on)-333(the)-333(\015o)28(w)-334(is)-333(e\016cien)28(t.)]TJ
ET
BT
/F1 1 Tf 9.9626 0 0 9.9626 72 700 Tm [(Results)-333(don\047t)-333(matc)28(h)-333(the)-333(pro)-28(of)-333(\(see)-333(1\173)-333(3\).)]TJ
ET
BT
/F1 9.9626 Tf 72 680 Td [(Normal)-333]TJ /F2 9.9626 Tf [(b)-31(old)-333]TJ /F1 9.9626 Tf [(and)-333(normal)-333(again.)]TJ
ET
BT
/F1 9.9626 Tf 72 660 Td [(A)-333(fo)-28(otnote)-333(mark)]TJ /F1 6.9738 Tf 74.2 3.616 Td [(1)]TJ /F1 9.9626 Tf 3.97 -3.616 Td [(follo)28(ws.)]TJ
ET
BT
/F1 9.9626 Tf 72 640 Td [(1.2)-1000(In)28(tro)-28(duction)]TJ /F1 9.9626 Tf 88 0 Td [(.)-500(.)-500(.)-500(.)-500(.)-500(.)-500(.)-500(.)-500(.)-500(.)-500(.)]TJ 100 0 Td [(7)]TJ
ET
BT
/F1 9.9626 Tf 72 620 Td [(Left)-333(column)-333(text)]TJ 248 0 Td [(Righ)28(t)-333(column)-333(text)]TJ
ET
BT
/F1 9.9626 Tf 72 600 Td [(caf)]TJ 14.7 0 Td [(\023)]TJ -0.32 0 Td [(e)-333(na)-28(\020v)28(e)]TJ
ET
BT
/F3 10 Tf 72 580 Td 0.3 Tc 2.5 Tw (Spaced out words here) Tj
ET
BT
/F3 10 Tf 72 560 Td 105 Tz (Wide scaled line) Tj 100 Tz
ET
"""

P3 = rb"""
BT
/F2 1 Tf 14.3462 0 0 14.3462 72 720 Tm [(De\014nitions)-333(and)-333(\014elds)]TJ
ET
BT
/F1 1 Tf 9.9626 0 0 9.9626 72 690 Tm [(The)-333(na)-28(i\177v)28(e)-333(reader)]TJ
ET
BT
/F1 1 Tf 9.9626 0 0 9.9626 72 670 Tm [(Cooperation)-333(of)-333(Zoe\177)-333(and)-333(B\177o)]TJ
ET
"""

ROT = rb"""
BT
/F1 9.9626 Tf 0 1 -1 0 300 200 Tm [(Rotated)-333(\014gure)-333(caption)]TJ
ET
BT
/F1 9.9626 Tf 72 720 Td [(Upright)-333(text)-333(on)-333(a)-333(rotated)-333(page)]TJ
ET
"""


def make(kind, tounicode_mode, name):
    rom, bold = load_t1("c0648bt_.pfb"), load_t1("c0632bt_.pfb")
    page_src = PAGE
    if kind == "type1":
        page_src = PAGE.replace(rb"\013", b"ff").replace(rb"\016", b"ffi")
    content = page_src + ROT + (P3 if kind != "type1" else b"")
    used = used_codes(content)
    enc = {c: OT1[c] for c in used if c in OT1}
    used_bold = used_codes(rb"(b)-31(old)(De\014nitions)-333(and)-333(\014elds)")
    enc_b = {c: OT1[c] for c in used_bold if c in OT1}
    pdf = pikepdf.Pdf.new()
    if kind == "type1":
        names = set(enc.values()) - {"ff", "ffi", "ffl"}
        # Real CM has ff/ffi; Charter lacks them, so the Type 1 fixture uses fi/fl only.
        enc = {c: n for c, n in enc.items() if n not in ("ff", "ffi", "ffl")}
        gs = rom.getGlyphSet()
        widths = {n: int(round(gw(gs[n]))) for n in names if n in gs}
        prog = build_t1_subset(rom, names)
        gsb = bold.getGlyphSet()
        names_b = set(enc_b.values())
        widths_b = {n: int(round(gw(gsb[n]))) for n in names_b}
        prog_b = build_t1_subset(bold, names_b)
    else:
        prog, widths = build_cff(rom, set(enc.values()), "CharterBT-Roman")
        prog_b, widths_b = build_cff(bold, set(enc_b.values()), "CharterBT-Bold")
    tu = None
    if tounicode_mode == "full":
        tu = tounicode_cmap(enc)
    elif tounicode_mode == "partial":
        tu = tounicode_cmap(enc, only={c for c in enc if chr(c).isalpha()})
    f1 = font_dict(pdf, kind, prog, enc, widths, "ABCDEF+CharterBT-Roman", tounicode=tu)
    f2 = font_dict(pdf, kind, prog_b, enc_b, widths_b, "GHIJKL+CharterBT-Bold", flags=4 + 2 + (1 << 18), bold=True)
    # F3: a WinAnsi Type 1 subset with a space glyph (for Tc/Tw/Tz lines).
    text3 = "Spaced out words here Wide scaled line"
    win = {ord(ch): ("space" if ch == " " else ch) for ch in set(text3)}
    rom3 = load_t1("c0648bt_.pfb")
    gs3 = rom3.getGlyphSet()
    w3 = {n: int(round(gw(gs3[n]))) for n in win.values()}
    if kind == "type1":
        prog3 = build_t1_subset(rom3, set(win.values()))
    else:
        prog3, w3 = build_cff(rom3, set(win.values()), "CharterBT-Roman")
    f3 = font_dict(pdf, kind, prog3, win, w3, "MNOPQR+CharterBT-Roman", tounicode=tu and tounicode_cmap(win))
    res = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=f1, F2=f2, F3=f3))
    p1 = pikepdf.Dictionary(Type=pikepdf.Name.Page, MediaBox=[0, 0, 612, 792], Resources=res,
                            Contents=pdf.make_indirect(pikepdf.Stream(pdf, page_src)))
    p2 = pikepdf.Dictionary(Type=pikepdf.Name.Page, MediaBox=[0, 0, 612, 792], Resources=res, Rotate=90,
                            Contents=pdf.make_indirect(pikepdf.Stream(pdf, ROT)))
    pdf.pages.append(pikepdf.Page(p1))
    pdf.pages.append(pikepdf.Page(p2))
    if kind != "type1":
        p3 = pikepdf.Dictionary(Type=pikepdf.Name.Page, MediaBox=[0, 0, 612, 792], Resources=res,
                                Contents=pdf.make_indirect(pikepdf.Stream(pdf, P3)))
        pdf.pages.append(pikepdf.Page(p3))
    pdf.docinfo.Producer = "pdfTeX-like test fixture"
    pdf.save(OUT / name)


# Committed: a Type 1 subset with a partial ToUnicode (letters only), and a Type1C (CFF) subset
# with no ToUnicode at all, as pdfTeX and dvipdfmx write them.
make("type1", "partial", "latex-type1.pdf")
make("type1c", "none", "latex-type1c.pdf")
print("ok")
