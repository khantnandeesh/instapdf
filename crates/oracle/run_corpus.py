"""PDFium oracle for berry-engine (test-only; PDFium is never the edit engine).

For every case in tests/parity/editor/manifest.json this runs the `berry` CLI and then checks,
with PDFium (pypdfium2) and qpdf (pikepdf):

  1. every pixel outside the regions the engine reported as changed is identical at 2x;
  2. something inside those regions did change;
  3. PDFium's own text extraction reads the new text and no longer reads the old;
  4. other pages render identically;
  5. the output passes qpdf's structural check;
  6. the original file is a byte-for-byte prefix of the output.

Usage: python3 crates/oracle/run_corpus.py [--berry path] [--fonts dir] [--out dir] [--only id]
Exit status is non-zero when any check fails.
"""
import argparse, json, os, subprocess, sys

import pikepdf
import pypdfium2 as pdfium
from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CORPUS = os.path.join(ROOT, "tests", "parity", "editor")
SCALE = 2


def render(doc, index):
    return doc[index].render(scale=SCALE).to_pil().convert("RGB")


def to_pixels(rect, box, rotation):
    """Maps a page-space rect to a pixel box in PDFium's rendering of the rotated page."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    pts = []
    for x, y in ((rect["x0"], rect["y0"]), (rect["x1"], rect["y1"])):
        x, y = x - x0, y - y0
        if rotation == 0:
            p = (x, h - y)
        elif rotation == 90:
            p = (y, x)
        elif rotation == 180:
            p = (w - x, y)
        else:
            p = (h - y, w - x)
        pts.append(p)
    xs = sorted(p[0] * SCALE for p in pts)
    ys = sorted(p[1] * SCALE for p in pts)
    return (int(xs[0]) - 1, int(ys[0]) - 1, int(xs[1]) + 2, int(ys[1]) + 2)


def page_text(doc, index):
    tp = doc[index].get_textpage()
    return " ".join(tp.get_text_range().split())


def run_case(case, args):
    src = os.path.join(CORPUS, case["file"])
    out = os.path.join(args.out, case["id"] + ".pdf")
    cmd = [args.berry, "replace", src, out, "1", case["find"], case["replace"], "--fonts", args.fonts]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return [f"engine failed: {proc.stderr.strip()}"]
    report = json.loads(proc.stdout)
    edit = report["edits"][0]
    problems = []

    before, after = pdfium.PdfDocument(src), pdfium.PdfDocument(out)
    if len(before) != len(after):
        problems.append("page count changed")
    page = json.loads(subprocess.run([args.berry, "text", src, "1"], capture_output=True, text=True).stdout)[0]
    a, b = render(before, 0), render(after, 0)
    if a.size != b.size:
        problems.append("page size changed")
    else:
        mask = Image.new("L", a.size, 255)
        draw = ImageDraw.Draw(mask)
        boxes = [to_pixels(r, page["page_box"], page["rotation"]) for r in edit["changed"]]
        for bx in boxes:
            draw.rectangle(bx, fill=0)
        diff = ImageChops.difference(a, b).convert("L")
        outside = ImageChops.multiply(diff, mask).getbbox()
        if outside:
            problems.append(f"pixels changed outside the edited region at {outside}")
            ImageChops.difference(a, b).save(os.path.join(args.out, case["id"] + "-diff.png"))
        if not any(diff.crop(bx).getbbox() for bx in boxes):
            problems.append("nothing changed inside the edited region")
    for i in range(1, len(before)):
        if ImageChops.difference(render(before, i), render(after, i)).getbbox():
            problems.append(f"page {i + 1} changed")

    text = page_text(after, 0)
    for want in case.get("expect", []):
        if want not in text:
            problems.append(f"PDFium does not read {want!r}; it reads {text!r}")
    for gone in case.get("absent", []):
        if gone in text:
            problems.append(f"PDFium still reads {gone!r}")
    for keep in case.get("other_pages_keep", []):
        for i in range(1, len(after)):
            if keep not in page_text(after, i):
                problems.append(f"page {i + 1} lost {keep!r}")
    if bool(edit["substitutions"]) != case["substituted"]:
        problems.append(f"substituted={bool(edit['substitutions'])}, expected {case['substituted']}")

    with pikepdf.open(out) as pdf:
        issues = pdf.check_pdf_syntax() if hasattr(pdf, "check_pdf_syntax") else pdf.check()
        if issues:
            problems.append(f"qpdf: {issues}")
    original = open(src, "rb").read()
    if open(out, "rb").read(len(original)) != original:
        problems.append("original bytes are not a prefix of the output")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--berry", default=os.path.join(ROOT, "crates", "target", "debug", "berry"))
    ap.add_argument("--fonts", default="/usr/share/fonts/truetype")
    ap.add_argument("--out", default=os.path.join(ROOT, "crates", "target", "oracle"))
    ap.add_argument("--only")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    cases = json.load(open(os.path.join(CORPUS, "manifest.json"), encoding="utf-8"))["cases"]
    failed = 0
    for case in cases:
        if args.only and case["id"] != args.only:
            continue
        problems = run_case(case, args)
        print(("FAIL " if problems else "ok   ") + case["id"])
        for p in problems:
            print("       " + p)
        failed += bool(problems)
    print(f"{len(cases) - failed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
