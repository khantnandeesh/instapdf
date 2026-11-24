# Third-party notices

Assets shipped to browsers by `apps/web` that carry their own license terms.
(npm code dependencies keep their license files in `node_modules`; this file covers bundled assets.
The build-time scan, `scripts/licenses.mjs`, also lists them on `/licenses` and in `public/third-party-notices.txt`.)

## Fredoka (font)

- Package: `@fontsource-variable/fredoka` 5.3.0 (pinned; file `files/fredoka-latin-wght-normal.woff2`, the variable weight axis 300–700, latin subset)
- Upstream: The Fredoka Project Authors (https://github.com/hafontia/Fredoka-One, via Google Fonts)
- Copyright 2016 The Fredoka Project Authors
- License: SIL Open Font License, Version 1.1 (OFL-1.1, as declared in the installed package's `package.json` and `LICENSE`), reproduced below
- Use: subset by Fontsource; served as distributed, self-hosted from our own origin by `next/font/local` in `src/app/layout.tsx`. The package ships only CSS and font files (no JavaScript), so the license scan treats it as a font.

```
Copyright 2016 The Fredoka Project Authors (https://github.com/hafontia/Fredoka-One)

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
```

## Phosphor Icons (icon paths)

- Package: `@phosphor-icons/core` 2.1.1 (pinned devDependency; Duotone SVGs under `assets/duotone/`)
- Upstream: https://github.com/phosphor-icons/core (Helena Zhang and Tobias Fried)
- License: MIT, reproduced below
- Use: `scripts/gen-tool-icons.mjs` copies the path data of the icons we use into `src/tools/tool-icons.tsx` and `src/components/ui/icons.tsx` (each file carries this notice), rendered as inline SVG on the server. Nothing from the package runs in the browser.

```
MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## BerryPDF design system artwork

- The berry mark, berry loader, blossom, leaf, vine, jam-drip, waves and gingham drawings in `src/components/berry/Berry.tsx` and `src/app/globals.css` come from the owner's BerryPDF design system (commissioned for this product).

## Merge (F3) components

Licenses verified in the installed packages. The npm packages are also covered by the build-time scan; the Noto fonts are copied to `public/fonts/noto/` by `scripts/copy-fonts.mjs`, and the scan lists each family from its `OFL-<family>.txt`.

| Component | Version | License | Where it runs |
|---|---|---|---|
| UTIF.js (`utif`) | 3.1.0 | MIT (Copyright (c) 2017 Photopea) | TIFF decoding, in workers only (thumbnails and merge); loaded lazily |
| pako (dependency of UTIF.js) | 1.0.11 | MIT AND Zlib | with UTIF.js |
| `@cantoo/fontkit` | 2.0.12 | MIT | processing worker, only when footer or contents text needs a non-WinAnsi glyph |
| brotli, dfa, restructure, base64-js (dependencies of fontkit) | 1.3.3, 1.2.0, 3.0.2, 1.5.1 | MIT | with fontkit |
| fflate (dependency of fontkit) | 0.8.3 | MIT (Copyright (c) 2026 Arjun Barrett) | with fontkit |
| Noto Sans (`@fontsource/noto-sans`, build-time only) | 5.3.0 | SIL OFL 1.1; Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic) | `/fonts/noto/`, license in `OFL-noto-sans.txt` |
| Noto Sans Hebrew (`@fontsource/noto-sans-hebrew`) | 5.3.0 | SIL OFL 1.1; Copyright 2024 The Noto Project Authors (https://github.com/notofonts/hebrew) | `OFL-noto-sans-hebrew.txt` |
| Noto Sans Thai (`@fontsource/noto-sans-thai`) | 5.3.0 | SIL OFL 1.1; Copyright 2022 The Noto Project Authors (https://github.com/notofonts/thai) | `OFL-noto-sans-thai.txt` |
| Noto Sans JP (`@fontsource/noto-sans-jp`) | 5.3.1 | SIL OFL 1.1; Copyright Google Inc. | `OFL-noto-sans-jp.txt` |
| Noto Sans KR (`@fontsource/noto-sans-kr`) | 5.3.1 | SIL OFL 1.1; Copyright Google Inc. | `OFL-noto-sans-kr.txt` |
| Noto Sans SC (`@fontsource/noto-sans-sc`) | 5.3.1 | SIL OFL 1.1; Copyright Google Inc. | `OFL-noto-sans-sc.txt` |

The font slices are copied unmodified and fetched by the processing worker only when needed; the PDF output embeds subsets of them, as the OFL permits. Each family's license file is served next to its fonts (`/fonts/noto/OFL-<family>.txt`); its terms are the SIL Open Font License 1.1 text reproduced under Fredoka above.
