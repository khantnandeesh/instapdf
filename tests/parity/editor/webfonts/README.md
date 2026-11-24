# Web font test files

WOFF 1.0 files from the Fontsource npm packages, byte for byte as the web editor passes them to
`addFont`, renamed so the `berry` CLI reads the family from the file name. SIL Open Font
License 1.1 (licence texts next to them).

| File | Package and original name |
|---|---|
| `NotoSans-Regular.woff` | `@fontsource/noto-sans` 5.3.0, `noto-sans-latin-400-normal.woff` |
| `NotoSansDevanagari-Regular.woff` | `@fontsource/noto-sans` 5.3.0, `noto-sans-devanagari-400-normal.woff` |
| `NotoNaskhArabic-Regular.woff` | `@fontsource/noto-naskh-arabic` 5.3.0, `noto-naskh-arabic-arabic-400-normal.woff` |

The Arabic file is Fontsource's Arabic slice: it has no Latin full stop, so added Arabic text
ending in "." takes that one character from Noto Sans.
