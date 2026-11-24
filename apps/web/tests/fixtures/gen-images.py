"""Generates the raster fixtures for the Merge tests (spec F3 §7) with Pillow.

Dev-time only, not a project dependency (Pillow is HPND-licensed).
    python3 tests/fixtures/gen-images.py   # from apps/web

Writes: charlie.png (400x300), delta.jpg (300x400), fox.tiff (2 frames, 200x200),
and small probes for the header sniffing tests: tiny.gif, tiny.bmp, tiny.webp.
The 64-megapixel huge.png is built at test time (e2e/support), never committed.
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent


def card(size, color, label):
    img = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(img)
    draw.rectangle([8, 8, 40, 40], fill=(20, 20, 20))  # top-left marker shows orientation
    draw.text((50, 14), label, fill=(20, 20, 20))
    return img


card((400, 300), (120, 180, 240), "charlie").save(HERE / "charlie.png", optimize=True)
card((300, 400), (240, 190, 120), "delta").save(HERE / "delta.jpg", quality=80)
frames = [card((200, 200), (200, 120, 60), "fox 1"), card((200, 200), (60, 160, 90), "fox 2")]
frames[0].save(HERE / "fox.tiff", save_all=True, append_images=frames[1:], compression="tiff_deflate")
card((30, 20), (10, 200, 10), "").save(HERE / "tiny.gif")
card((30, 20), (10, 10, 200), "").save(HERE / "tiny.bmp")
card((30, 20), (200, 10, 10), "").save(HERE / "tiny.webp", lossless=True)
for name in ["charlie.png", "delta.jpg", "fox.tiff", "tiny.gif", "tiny.bmp", "tiny.webp"]:
    print(name, (HERE / name).stat().st_size, "bytes")
