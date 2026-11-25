# a small OpenType/CFF font of our own (boxes for A-Z, a-z, 0-9) for the OTF upload check
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
chars = [chr(c) for c in list(range(65, 91)) + list(range(97, 123)) + list(range(48, 58))]
names = [".notdef", "space"] + ["g%04X" % ord(c) for c in chars]
fb = FontBuilder(1000, isTTF=False); fb.setupGlyphOrder(names); fb.setupCharacterMap({32: "space", **{ord(c): "g%04X" % ord(c) for c in chars}})
cs = {}
for i, n in enumerate(names):
    pen = T2CharStringPen(600, None)
    if n != "space":
        h = 700 if (n == ".notdef" or n[1:3] == "00" and int(n[1:], 16) < 97) else 500; w = 100 + (i * 37) % 300
        pen.moveTo((50, 0)); pen.lineTo((50, h)); pen.lineTo((50 + w, h)); pen.lineTo((50 + w, 0)); pen.closePath()
    cs[n] = pen.getCharString()
fb.setupCFF("EvalBoxes-Regular", {"FullName": "Eval Boxes"}, cs, {}); fb.setupHorizontalMetrics({n: (600, 50) for n in names}); fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({"familyName": "Eval Boxes", "styleName": "Regular"}); fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, fsType=0); fb.setupPost(); fb.save(sys.argv[1])
