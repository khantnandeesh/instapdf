"""Independent shaping check for complex-script edits (test-only).

Runs `berry replace` on the Word-style fixture (full embedded fonts, Identity CIDs = glyph ids)
and compares the glyphs of every new word, read back from the output's content stream, with
HarfBuzz's (uharfbuzz) shaping of the same word in the same font: same glyph ids in the same
order. The engine shapes with rustybuzz, so this is a second, separate implementation.

Usage: python3 crates/oracle/check_shaping.py [--berry path]
"""
import argparse, os, subprocess, sys, tempfile

import pikepdf
import uharfbuzz as hb

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CORPUS = os.path.join(ROOT, "tests", "parity", "editor")
FONT = os.path.join(CORPUS, "fonts", "NotoSansDevanagari-Regular.ttf")
CASES = [("कुल", "संपूर्ण", ["संपूर्ण"]), ("भुगतान", "भुगतानों", ["भुगतानों"]), ("गया।", "गया। धन्यवाद", ["धन्यवाद"])]


def hb_gids(word):
    face = hb.Face(open(FONT, "rb").read())
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(word)
    buf.guess_segment_properties()
    hb.shape(font, buf, {})
    return [i.codepoint for i in buf.glyph_infos]


def span_gids(pdf_path):
    """ActualText text → glyph ids drawn inside that span, for spans with 2-byte strings."""
    out = {}
    with pikepdf.open(pdf_path) as pdf:
        ops = pikepdf.parse_content_stream(pdf.pages[0])
        cur = None
        for operands, op in ops:
            name = str(op)
            if name == "BDC" and len(operands) == 2 and isinstance(operands[1], pikepdf.Dictionary):
                at = operands[1].get("/ActualText")
                cur = (str(at), []) if at is not None else None
            elif name == "EMC" and cur:
                out.setdefault(cur[0], cur[1])
                cur = None
            elif cur and name in ("Tj", "TJ"):
                items = operands[0] if name == "TJ" else [operands[0]]
                for it in items:
                    if isinstance(it, pikepdf.String):
                        b = bytes(it)
                        cur[1].extend(int.from_bytes(b[i:i + 2], "big") for i in range(0, len(b) - 1, 2))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--berry", default=os.path.join(ROOT, "crates", "target", "debug", "berry"))
    args = ap.parse_args()
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        for find, replace, words in CASES:
            out = os.path.join(tmp, "out.pdf")
            src = os.path.join(CORPUS, "scripts-plain.pdf")
            cmd = [args.berry, "replace", src, out, "1", find, replace, "--fonts", os.path.join(CORPUS, "fonts")]
            p = subprocess.run(cmd, capture_output=True, text=True)
            if p.returncode:
                print(f"FAIL {replace}: {p.stderr.strip()}")
                failed += 1
                continue
            spans = span_gids(out)
            for w in words:
                want, got = hb_gids(w), spans.get(w)
                ok = got == want
                failed += not ok
                print(("ok   " if ok else "FAIL ") + f"{w}: harfbuzz {want}, engine {got}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
