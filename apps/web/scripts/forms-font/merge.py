"""Builds public/fonts/forms/noto-sans-forms.woff: Noto Sans Regular (SIL OFL 1.1) for form fields.

A form field has one font (its DA), so a value such as "Zoë Šťastná ₹ 5,000" needs one font that
covers Latin, Latin Extended, Greek, Cyrillic and Vietnamese together. The @fontsource slices
cover one range each; this merges them. The output is committed. Run it again only when
@fontsource/noto-sans changes:

    python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools==4.55.0   # MIT
    /tmp/ft/bin/python scripts/forms-font/merge.py

The editor embeds a subset of it into the downloaded PDF, only for fields whose text Helvetica
(WinAnsi) cannot show.
"""
import json
import os
import shutil
import tempfile
from fontTools.merge import Merger, Options
from fontTools.ttLib import TTFont

here = os.path.dirname(os.path.abspath(__file__))
web = os.path.dirname(os.path.dirname(here))
src = os.path.join(web, "node_modules", "@fontsource", "noto-sans")
out = os.path.join(web, "public", "fonts", "forms")
SLICES = ["latin", "latin-ext", "greek", "greek-ext", "cyrillic", "cyrillic-ext", "vietnamese"]

with tempfile.TemporaryDirectory() as tmp:
    paths = []
    for name in SLICES:
        font = TTFont(os.path.join(src, "files", f"noto-sans-{name}-400-normal.woff"))
        font.flavor = None
        path = os.path.join(tmp, f"{name}.ttf")
        font.save(path)
        paths.append(path)
    merged = Merger(options=Options(drop_tables=["vhea", "vmtx"])).merge(paths)
    merged["name"].setName("Noto Sans Forms", 1, 3, 1, 0x409)
    merged.flavor = "woff"
    os.makedirs(out, exist_ok=True)
    merged.save(os.path.join(out, "noto-sans-forms.woff"))
    # The characters it really has, as ranges, for the editor's "won't print" check (lib/forms/coverage).
    cps = sorted(merged.getBestCmap())
    ranges = []
    for cp in cps:
        if ranges and cp == ranges[-1][1] + 1:
            ranges[-1][1] = cp
        else:
            ranges.append([cp, cp])
    with open(os.path.join(out, "noto-sans-forms.json"), "w") as fh:
        json.dump({"ranges": ranges}, fh, separators=(",", ":"))
shutil.copyfile(os.path.join(src, "LICENSE"), os.path.join(out, "OFL-noto-sans-forms.txt"))
print("wrote", os.path.join(out, "noto-sans-forms.woff"))
