"""Builds tests/data/hostile-cmap.ttf: a tiny TrueType font whose format-12 cmap has a group
running to U+FFFFFFFF, with the bracket glyph mapped only from U+1F600. Walking that cmap
codepoint by codepoint takes seconds; the engine must only do direct lookups.

Usage: python3 gen_hostile_cmap.py tests/data/hostile-cmap.ttf (needs fontTools, MIT)."""
import struct, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
fb = FontBuilder(1000, isTTF=True)
names = [".notdef", "paren", "alef", "beh"]
fb.setupGlyphOrder(names)
fb.setupCharacterMap({0x627: "alef", 0x628: "beh", 0x1F600: "paren"})
def box():
    p = TTGlyphPen(None); p.moveTo((50,0)); p.lineTo((50,700)); p.lineTo((450,700)); p.lineTo((450,0)); p.closePath(); return p.glyph()
fb.setupGlyf({n: box() for n in names})
fb.setupHorizontalMetrics({n: (500, 50) for n in names})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({"familyName": "Hostile", "styleName": "Regular"})
fb.setupOS2(); fb.setupPost()
fb.save(sys.argv[1])
data = bytearray(open(sys.argv[1], "rb").read())
num = struct.unpack(">H", data[4:6])[0]
for i in range(num):
    tag, _, off, ln = struct.unpack(">4sIII", data[12+16*i:28+16*i])
    if tag == b"cmap":
        n = struct.unpack(">H", data[off+2:off+4])[0]
        for j in range(n):
            pid, eid, so = struct.unpack(">HHI", data[off+4+8*j:off+12+8*j])
            st = off + so
            if struct.unpack(">H", data[st:st+2])[0] == 12:
                ng = struct.unpack(">I", data[st+12:st+16])[0]
                g = st + 16 + 12*(ng-1)
                data[g+4:g+8] = struct.pack(">I", 0xFFFFFFFF)
                print("patched format 12 subtable", pid, eid, "groups", ng)
open(sys.argv[1], "wb").write(data)
