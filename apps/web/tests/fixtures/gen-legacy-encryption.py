"""Generates encrypted fixtures with a second PDF stack (qpdf via pikepdf), so
decryption is not only tested against files made by @cantoo/pdf-lib.

Dev-time only, not a project dependency. pikepdf is MPL-2.0 and qpdf is Apache-2.0.
    python3 -m venv /tmp/pk && /tmp/pk/bin/pip install pikepdf
    /tmp/pk/bin/python tests/fixtures/gen-legacy-encryption.py   # from apps/web

Writes (3 pages each, "Page 1".."Page 3", user password "test", owner "owner"):
    rc4-128.pdf   RC4, 128-bit key (R3)
    aes-128.pdf   AES, 128-bit key (R4)
"""
from pathlib import Path

import pikepdf

HERE = Path(__file__).resolve().parent


def three_pages() -> pikepdf.Pdf:
    pdf = pikepdf.new()
    font = pdf.make_indirect(
        pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica)
    )
    for i in range(1, 4):
        content = f"BT /F1 36 Tf 72 760 Td (Page {i}) Tj ET 24 794 24 24 re f".encode()
        page = pikepdf.Dictionary(
            Type=pikepdf.Name.Page,
            MediaBox=[0, 0, 595, 842],
            Resources=pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font)),
            Contents=pdf.make_stream(content),
        )
        pdf.pages.append(pikepdf.Page(page))
    return pdf


for name, enc in {
    "rc4-128.pdf": pikepdf.Encryption(user="test", owner="owner", R=3, aes=False, metadata=False),
    "aes-128.pdf": pikepdf.Encryption(user="test", owner="owner", R=4, aes=True),
}.items():
    pdf = three_pages()
    # Fixed /ID so reruns differ only where the cipher needs randomness.
    pdf.save(HERE / name, encryption=enc, static_id=True, deterministic_id=False)
    print(name, (HERE / name).stat().st_size, "bytes")
