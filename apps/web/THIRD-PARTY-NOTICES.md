# Third-party notices

Components added for Merge (F3). Licenses verified in the installed packages.

| Component | Version | License | Where it runs |
|---|---|---|---|
| UTIF.js (`utif`) | 3.1.0 | MIT (Copyright (c) 2017 Photopea) | TIFF decoding, in workers only (thumbnails and merge); loaded lazily |
| pako (dependency of UTIF.js) | 1.0.11 | MIT AND Zlib | with UTIF.js |
| `@cantoo/fontkit` | 2.0.12 | MIT | processing worker, only when footer or contents text needs a non-WinAnsi glyph |
| brotli, dfa, restructure, base64-js (dependencies of fontkit) | 1.3.3, 1.2.0, 3.0.2, 1.5.1 | MIT | with fontkit |
| fflate (dependency of fontkit) | 0.8.3 | MIT (Copyright (c) 2026 Arjun Barrett) | with fontkit |
| Noto Sans (`@fontsource/noto-sans`, build-time only) | 5.3.0 | SIL Open Font License 1.1; Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic) | `/fonts/noto/`, license in `OFL-noto-sans.txt` |
| Noto Sans Hebrew (`@fontsource/noto-sans-hebrew`) | 5.3.0 | SIL OFL 1.1; Copyright 2024 The Noto Project Authors (https://github.com/notofonts/hebrew) | `OFL-noto-sans-hebrew.txt` |
| Noto Sans Thai (`@fontsource/noto-sans-thai`) | 5.3.0 | SIL OFL 1.1; Copyright 2022 The Noto Project Authors (https://github.com/notofonts/thai) | `OFL-noto-sans-thai.txt` |
| Noto Sans JP (`@fontsource/noto-sans-jp`) | 5.3.1 | SIL OFL 1.1; Copyright Google Inc. | `OFL-noto-sans-jp.txt` |
| Noto Sans KR (`@fontsource/noto-sans-kr`) | 5.3.1 | SIL OFL 1.1; Copyright Google Inc. | `OFL-noto-sans-kr.txt` |
| Noto Sans SC (`@fontsource/noto-sans-sc`) | 5.3.1 | SIL OFL 1.1; Copyright Google Inc. | `OFL-noto-sans-sc.txt` |

The font slices are copied unmodified to `public/fonts/noto/` at build time and fetched by the processing worker only when needed; the PDF output embeds subsets of them, as the OFL permits. Each family's license file is served next to its fonts (`/fonts/noto/OFL-<family>.txt`). The full OFL text follows.

---

Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic) NotoSans-Italic[wdth,wght].ttf: Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
