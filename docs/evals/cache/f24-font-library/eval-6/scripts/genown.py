# AC-294/295 fixtures made from the system's DejaVu Sans (Bitstream Vera licence): wrong type, fake, broken, empty, fsType 2 and 4, WOFF, WOFF2, and an OTF if the system has one
import sys, shutil, glob
from fontTools.ttLib import TTFont
d = sys.argv[1]; src = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
open(d + "/notes.txt", "w").write("not a font\n"); open(d + "/own-fake.ttf", "w").write("this is text, not a font\n" * 40); open(d + "/own-empty.otf", "wb").close()
open(d + "/own-broken.ttf", "wb").write(open(src, "rb").read()[:20000])
for name, fs in (("own-restricted.ttf", 2), ("own-preview-print.ttf", 4)):
    t = TTFont(src); t["OS/2"].fsType = fs; t.save(d + "/" + name)
t = TTFont(src); t.flavor = "woff"; t.save(d + "/own-dejavu.woff")
try:
    t = TTFont(src); t.flavor = "woff2"; t.save(d + "/own-dejavu.woff2")
except Exception as e: print("no woff2:", e)
otf = [p for p in glob.glob("/usr/share/fonts/**/*.otf", recursive=True)]
print("system otf:", otf[:3])
if otf: shutil.copy(otf[0], d + "/own-inter.otf")
