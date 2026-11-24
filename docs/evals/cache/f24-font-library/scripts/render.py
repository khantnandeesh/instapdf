import sys, pypdfium2 as pdfium
src, dst = sys.argv[1], sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 2
crop = [int(x) for x in sys.argv[4].split(",")] if len(sys.argv) > 4 else None
im = pdfium.PdfDocument(src)[0].render(scale=scale).to_pil()
if crop: im = im.crop(crop)
im.save(dst); print(dst, im.size)
