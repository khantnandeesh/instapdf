//! Edits on LaTeX-style and Word/Chrome-style subsets that used to be rolled back by the
//! engine's own check ("verify"), and the reason codes for edits that must be refused.
//!
//! Fixtures: `tests/parity/editor/latex-type1.pdf`, `latex-type1c.pdf` (gen_latex.py) and
//! `cid-bold-run.pdf` (gen_cid.mjs).

use berry_engine::{Engine, Error, PageText};
use lopdf::{dictionary, Document, Object, Stream};

const DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor");
const LATEX: [&str; 2] = ["latex-type1.pdf", "latex-type1c.pdf"];

fn read(name: &str) -> Vec<u8> {
    std::fs::read(format!("{DIR}/{name}")).unwrap()
}

fn texts(p: &PageText) -> Vec<String> {
    p.lines.iter().map(|l| l.text.clone()).collect()
}

fn line_id(p: &PageText, starts: &str) -> usize {
    p.lines.iter().position(|l| l.text.starts_with(starts)).unwrap_or_else(|| panic!("no line {starts:?} in {:?}", texts(p)))
}

/// Appends `tail` to the line starting with `starts`, saves, and checks the saved file reads it.
fn append(file: &str, page: usize, starts: &str, tail: &str) {
    let mut e = Engine::open(read(file), None).unwrap();
    let before = e.page_text(page).unwrap();
    let id = line_id(&before, starts);
    let want = format!("{}{tail}", before.lines[id].text);
    let r = e.replace_line(page, id, &want).unwrap_or_else(|err| panic!("{file} p{page} {starts:?} + {tail:?}: {err:?}"));
    assert!(texts(&r.page).contains(&want), "{file}: {:?}", texts(&r.page));
    let (bytes, _) = e.save().unwrap();
    let mut again = Engine::open(bytes, None).unwrap();
    assert!(texts(&again.page_text(page).unwrap()).contains(&want));
}

/// TeX fonts have no space glyph: a space typed before new text is a gap (a TJ kern). The check
/// used to expect the first new glyph right at the old text's end and rolled the edit back.
#[test]
fn space_then_word_at_line_end_in_tex_fonts() {
    for f in LATEX {
        append(f, 0, "The e", " more");
        append(f, 0, "The e", " and fit");
        append(f, 0, "Left column", " here");
        append(f, 0, "Right column", " here");
        append(f, 0, "A footnote", " Next");
        append(f, 0, "caf", " again");
    }
}

/// Tf 1 with the font size in Tm (as several TeX drivers write it).
#[test]
fn size_in_text_matrix() {
    for f in LATEX {
        append(f, 0, "Results don", " here");
    }
}

/// A line whose last run is in another subset (bold) without a space glyph.
#[test]
fn mixed_fonts_line_ending_in_bold_subset() {
    for f in LATEX {
        append(f, 0, "Normal", " normal");
    }
    append("cid-bold-run.pdf", 0, "Mixed Bold", " Bold");
}

#[test]
fn rotated_page_and_rotated_text() {
    for f in LATEX {
        append(f, 1, "Upright", " here");
        append(f, 1, "Rotated", " here");
    }
}

/// A bold TeX heading subset keeps "fi" as a ligature only (no plain "f"). Typing "fi" uses the
/// ligature instead of failing with missing glyphs.
#[test]
fn typed_fi_uses_the_ligature_the_subset_has() {
    let mut e = Engine::open(read("latex-type1c.pdf"), None).unwrap();
    let p = e.page_text(2).unwrap();
    let id = line_id(&p, "De");
    let heading = p.lines[id].clone();
    assert_eq!(heading.text, "De\u{FB01}nitions and \u{FB01}elds");
    let r = e.replace_line(2, id, "Definitions and fields").unwrap();
    assert!(r.substitutions.is_empty());
    assert_eq!(r.page.lines[id].text, heading.text);
    let r = e.replace_line(2, id, "Definitions and fields fine").unwrap();
    assert!(r.substitutions.is_empty(), "{:?}", r.substitutions);
    assert_eq!(r.page.lines[id].text, "De\u{FB01}nitions and \u{FB01}elds \u{FB01}ne");
}

/// A word with a zero-width combining accent (a /Widths entry of 0) keeps the text after it in place.
#[test]
fn zero_width_combining_accent() {
    let mut e = Engine::open(read("latex-type1c.pdf"), None).unwrap();
    let p = e.page_text(2).unwrap();
    let id = line_id(&p, "The na");
    let r = e.replace_line(2, id, &p.lines[id].text.replace("reader", "header")).unwrap();
    assert!(r.page.lines[id].text.ends_with("header"));
    let id = line_id(&p, "Cooperation");
    e.replace_line(2, id, &p.lines[id].text.replace("and", "to")).unwrap();
}

/// A table-of-contents line grown into its page number (a separate line on the same baseline)
/// is refused with "overlap", and nothing changes.
#[test]
fn growing_into_the_page_number_is_refused() {
    for f in LATEX {
        let mut e = Engine::open(read(f), None).unwrap();
        let p = e.page_text(0).unwrap();
        let id = line_id(&p, "1.2");
        let err = e.replace_line(0, id, &format!("{} and more", p.lines[id].text)).unwrap_err();
        assert!(matches!(err, Error::Verify { reason: "overlap", .. }), "{f}: {err:?}");
        assert_eq!(texts(&e.page_text(0).unwrap()), texts(&p));
        // A short change still fits.
        e.replace_line(0, id, &p.lines[id].text.replace("Introduction", "Intro")).unwrap();
    }
}

fn helvetica_page(content: &str) -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let f1 = doc.add_object(
        dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding" },
    );
    let resources = doc.add_object(dictionary! { "Font" => dictionary! { "F1" => f1 } });
    let contents = doc.add_object(Stream::new(dictionary! {}, content.as_bytes().to_vec()));
    let page = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id, "Contents" => contents,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()], "Resources" => resources,
    });
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! { "Type" => "Pages", "Count" => 1, "Kids" => vec![Object::Reference(page)] }),
    );
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
}

/// An edit that would push the line past the page edge is refused with "overflow".
#[test]
fn running_past_the_page_edge_is_refused() {
    let bytes = helvetica_page("BT /F1 12 Tf 450 700 Td (Ends near the edge) Tj ET");
    let mut e = Engine::open(bytes, None).unwrap();
    let p = e.page_text(0).unwrap();
    let err = e.replace_line(0, 0, "Ends near the edge and keeps on going").unwrap_err();
    assert!(matches!(err, Error::Verify { reason: "overflow", .. }), "{err:?}");
    assert_eq!(texts(&e.page_text(0).unwrap()), texts(&p));
    e.replace_line(0, 0, "Ends near the edges").unwrap();
}

#[cfg(feature = "shaping")]
/// The `/ActualText` values in the first page's content, decompressed (the streams are
/// FlateDecode), as their raw string bytes.
fn actual_texts(bytes: &[u8]) -> Vec<Vec<u8>> {
    let doc = Document::load_mem(bytes).unwrap();
    let page = *doc.get_pages().get(&1).unwrap();
    let mut content = Vec::new();
    for id in doc.get_page_contents(page) {
        let stream = doc.get_object(id).unwrap().as_stream().unwrap();
        content.extend(stream.decompressed_content().unwrap_or_else(|_| stream.content.clone()));
        content.push(b'\n');
    }
    // Decompressed: the text operators are readable.
    assert!(content.windows(2).any(|w| w == b"BT"), "page content not decoded");
    let mut out = Vec::new();
    let mut at = 0;
    while let Some(k) = content[at..].windows(11).position(|w| w == b"/ActualText") {
        let mut i = at + k + 11;
        while content[i].is_ascii_whitespace() {
            i += 1;
        }
        let mut v = Vec::new();
        if content[i] == b'<' {
            let end = i + content[i..].iter().position(|&b| b == b'>').unwrap();
            let hex: Vec<u8> = content[i + 1..end].iter().copied().filter(|b| b.is_ascii_hexdigit()).collect();
            v = hex.chunks(2).map(|c| u8::from_str_radix(std::str::from_utf8(c).unwrap(), 16).unwrap_or(0)).collect();
            i = end;
        } else if content[i] == b'(' {
            let (mut depth, mut j) = (1, i + 1);
            loop {
                let c = content[j];
                if c == b'\\' {
                    v.push(content[j + 1]);
                    j += 2;
                    continue;
                }
                depth += (c == b'(') as i32 - (c == b')') as i32;
                if depth == 0 {
                    break;
                }
                v.push(c);
                j += 1;
            }
            i = j;
        }
        out.push(v);
        at = i;
    }
    out
}

/// Latin, digits and an en dash typed into a right-to-left line: readers rebuild their order from
/// the glyph positions with their own bidi rules. The edit is kept only when the line reads back
/// as typed without any ActualText help; otherwise it is refused ("text-mismatch") and the page is
/// left as it was (the editor offers "Replace with new text"). Extraction by pdfium and pdf.js of
/// the kept edits is checked in apps/web (mixed-direction.test.ts).
#[cfg(feature = "shaping")]
#[test]
fn mixed_direction_text_in_an_arabic_line() {
    for file in ["scripts-chrome.pdf", "scripts-libreoffice.pdf", "scripts-plain.pdf"] {
        for (starts, tail) in [
            ("المبلغ", "x"),
            ("المبلغ", " more"),
            ("مرحبا", " 1\u{2013}2"),
            ("مرحبا", " 2024"),
            ("مرحبا", " abc 12"),
            ("مرحبا", "!"),
            // Punctuation next to punctuation, and a left-to-right run of two words: PDFium
            // reorders them, so they are refused. An Arabic word is the kept control.
            ("مرحبا", "\u{60c} نعم"),
            ("مرحبا", ": نعم"),
            ("مرحبا", ", نعم"),
            ("مرحبا", " abc def"),
            ("مرحبا", " جديد"),
        ] {
            let mut e = Engine::open(read(file), None).unwrap();
            assert!(e.add_font("Noto Naskh Arabic", false, false, read("fonts/NotoNaskhArabic-Regular.ttf")));
            let sans = std::fs::read("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf").unwrap();
            assert!(e.add_font("Liberation Sans", false, false, sans));
            let p = e.page_text(0).unwrap();
            let id = line_id(&p, starts);
            let want = format!("{}{tail}", p.lines[id].text);
            let result = e.replace_line(0, id, &want);
            let must_refuse = ["!", "\u{60c} نعم", ": نعم", ", نعم", " abc def"].contains(&tail);
            assert!(!must_refuse || result.is_err(), "{file} {tail:?}: kept, but PDFium reorders it");
            assert!(tail != " جديد" || result.is_ok(), "{file} {tail:?}: the Arabic control was refused: {result:?}");
            match result {
                Ok(r) => {
                    assert!(texts(&r.page).contains(&want), "{file}: {:?}", texts(&r.page));
                    // No ActualText span covers the new text: the glyphs alone read as typed.
                    let out = e.save().unwrap().0;
                    // Every ActualText value left on the page was already in the file, where the
                    // file reads by its glyphs. Chrome's lines already lean on ActualText spans (no
                    // reader reads them by their glyphs) and are left out of the refusal.
                    let mut before = actual_texts(&read(file));
                    if !before.is_empty() {
                        continue;
                    }
                    for v in actual_texts(&out) {
                        let k = before.iter().position(|b| *b == v);
                        assert!(k.is_some(), "{file} {tail:?}: the edit leans on ActualText ({v:?})");
                        before.swap_remove(k.unwrap());
                    }
                }
                Err(err) => {
                    assert!(matches!(err, Error::Verify { reason: "text-mismatch", .. }), "{file} {tail:?}: {err:?}");
                    assert_eq!(texts(&e.page_text(0).unwrap()), texts(&p), "{file} {tail:?}: a refused edit changed the page");
                }
            }
        }
    }
}
