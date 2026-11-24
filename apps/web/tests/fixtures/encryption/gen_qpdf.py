"""Encrypted fixtures written by qpdf (through pikepdf, MPL-2.0; qpdf is Apache-2.0), one per
standard security handler revision, for lib/editor/pdf-password.ts. Run:
    python3 gen_qpdf.py <out-dir>
Owner passwords use characters outside ASCII: "é" (Latin-1), and "€" (PDFDocEncoding 0xA0 for
R2-R4, UTF-8 for R5-R6). The user password is "op3n", or empty in the "-empty" files.
r4aes-latin1.pdf has the owner password "Owné-r" (Latin-1 only): pdf.js turns a password into
bytes by dropping each code unit's high byte, so it can open an R2-R4 file whose password has "€"
only with the PDFDocEncoding byte, and the e2e test uses this file instead."""
import sys

import pikepdf

out = sys.argv[1]
cases = {
    "r2": dict(R=2, aes=False, metadata=False),
    "r3": dict(R=3, aes=False, metadata=False),
    "r4rc4": dict(R=4, aes=False, metadata=False),
    "r4aes": dict(R=4, aes=True, metadata=True),
    "r4aes-nometa": dict(R=4, aes=True, metadata=False),
    "r5": dict(R=5, aes=True, metadata=True),
    "r6": dict(R=6, aes=True, metadata=True),
}
for name, c in cases.items():
    for user in ["op3n", ""]:
        pdf = pikepdf.new()
        pdf.add_blank_page(page_size=(200, 200))
        pdf.docinfo["/Producer"] = "BerryPDF fixtures"
        pdf.save(
            f"{out}/{name}{'-empty' if not user else ''}.pdf",
            encryption=pikepdf.Encryption(owner="Own€r-é", user=user, allow=pikepdf.Permissions(modify_other=False), **c),
            static_id=True,
        )

pdf = pikepdf.new()
pdf.add_blank_page(page_size=(200, 200))
pdf.save(f"{out}/r4aes-latin1.pdf", encryption=pikepdf.Encryption(owner="Owné-r", user="op3n", allow=pikepdf.Permissions(modify_other=False), R=4, aes=True), static_id=True)
