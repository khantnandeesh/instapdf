//! Hindi (Devanagari) and Arabic: reading and editing on real producer output (AC-200 to AC-215).

use berry_engine::{Engine, Error, PageText};

const DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor");

const HINDI: [&str; 3] = [
    "कुल राशि का भुगतान समय पर किया गया।",
    "प्रधानमंत्री ने आज स्वास्थ्य क्षेत्र के लिए ₹ 5,000 करोड़ की योजना की घोषणा की।",
    "हिंदी में पूर्ण विराम और अर्धविराम का प्रयोग।",
];
const ARABIC: [&str; 4] = [
    "مرحبا بالعالم، هذا نص تجريبي.",
    "المبلغ الإجمالي 2500 ريال للفاتورة رقم 77.",
    "اتفاقية الخدمة PDF بين المزود والعميل.",
    "قال مُحَمَّدٌ: السلام عليكم «تجربة».",
];
const FIXTURES: [&str; 3] = ["scripts-chrome.pdf", "scripts-libreoffice.pdf", "scripts-plain.pdf"];

fn read(name: &str) -> Vec<u8> {
    std::fs::read(format!("{DIR}/{name}")).unwrap()
}

fn open(name: &str, fonts: bool) -> Engine {
    let mut e = Engine::open(read(name), None).unwrap();
    if fonts {
        assert!(e.add_font("Noto Sans Devanagari", false, false, read("fonts/NotoSansDevanagari-Regular.ttf")));
        assert!(e.add_font("Noto Naskh Arabic", false, false, read("fonts/NotoNaskhArabic-Regular.ttf")));
    }
    e
}

fn texts(p: &PageText) -> Vec<String> {
    p.lines.iter().map(|l| l.text.clone()).collect()
}

fn line_of(p: &PageText, text: &str) -> usize {
    p.lines.iter().position(|l| l.text == text).unwrap_or_else(|| panic!("no line {text:?} in {:#?}", texts(p)))
}

/// Replaces `find` with `replace` in the line that reads `line`, saves, reopens, and returns
/// the reopened page text.
fn edit(e: &mut Engine, line: &str, find: &str, replace: &str) -> Result<PageText, Error> {
    let p = e.page_text(0).unwrap();
    let id = line_of(&p, line);
    let chars: Vec<char> = line.chars().collect();
    let f: Vec<char> = find.chars().collect();
    let start = (0..=chars.len() - f.len()).find(|&i| chars[i..i + f.len()] == f[..]).expect("find in line");
    e.replace_range(0, id, start, start + f.len(), replace)?;
    let (out, _) = e.save().unwrap();
    Ok(Engine::open(out, None).unwrap().page_text(0).unwrap())
}

fn shapes_ok(after: &PageText, expected: &str) {
    assert!(texts(after).iter().any(|t| t == expected), "{expected:?} not in {:#?}", texts(after));
}

#[test]
fn ac200_201_202_reading() {
    for f in FIXTURES {
        let mut e = open(f, false);
        let p = e.page_text(0).unwrap();
        let plain = f == "scripts-plain.pdf";
        for t in HINDI.iter().chain(ARABIC.iter()) {
            // The Word-style file has no Latin text.
            if plain && t.contains("PDF") {
                continue;
            }
            let l = &p.lines[line_of(&p, t)];
            let rtl = ARABIC.contains(t);
            assert_eq!(l.direction, if rtl { "rtl" } else { "ltr" }, "{f}: {t}");
            assert!(!l.text.contains('\u{FFFD}'));
        }
        assert_eq!(p.lines.len(), if plain { 6 } else { 8 }, "{f}: {:#?}", texts(&p));
        if !plain {
            line_of(&p, "Invoice 2041 — total due on Friday");
        }
    }
}

#[test]
fn ac203_hindi_word_replace() {
    for f in FIXTURES {
        let mut e = open(f, true);
        let after = edit(&mut e, HINDI[0], "कुल", "संपूर्ण").unwrap_or_else(|err| panic!("{f}: {err:?}"));
        shapes_ok(&after, "संपूर्ण राशि का भुगतान समय पर किया गया।");
        // Untouched lines still read the same.
        for t in &HINDI[1..] {
            shapes_ok(&after, t);
        }
    }
}

#[test]
fn ac211_insert_inside_word() {
    for f in FIXTURES {
        let mut e = open(f, true);
        let after = edit(&mut e, HINDI[0], "भुगतान", "भुगतानों").unwrap_or_else(|err| panic!("{f}: {err:?}"));
        shapes_ok(&after, "कुल राशि का भुगतानों समय पर किया गया।");
    }
}

#[test]
fn hindi_append_word() {
    for f in FIXTURES {
        let mut e = open(f, true);
        let after = edit(&mut e, HINDI[0], "गया।", "गया। धन्यवाद").unwrap_or_else(|err| panic!("{f}: {err:?}"));
        shapes_ok(&after, "कुल राशि का भुगतान समय पर किया गया। धन्यवाद");
    }
}

#[test]
fn ac208_reuse_page_words() {
    // "का" and "की" are on the page: swapping them needs no new font.
    for f in FIXTURES {
        let mut e = open(f, false);
        let p = e.page_text(0).unwrap();
        let id = line_of(&p, HINDI[2]);
        let r = e.replace_line(0, id, "हिंदी में पूर्ण विराम और अर्धविराम की प्रयोग।").unwrap_or_else(|err| panic!("{f}: {err:?}"));
        assert!(r.substitutions.is_empty(), "{f}: {:?}", r.substitutions);
        shapes_ok(&r.page, "हिंदी में पूर्ण विराम और अर्धविराम की प्रयोग।");
    }
}

#[test]
fn ac205_arabic_word_replace_keeps_right_edge() {
    for f in FIXTURES {
        let mut e = open(f, true);
        let before = e.page_text(0).unwrap();
        let right = before.lines[line_of(&before, ARABIC[0])].bbox.x1;
        let after = edit(&mut e, ARABIC[0], "بالعالم،", "بالجميع،").unwrap_or_else(|err| panic!("{f}: {err:?}"));
        let expected = "مرحبا بالجميع، هذا نص تجريبي.";
        shapes_ok(&after, expected);
        let l = &after.lines[line_of(&after, expected)];
        assert_eq!(l.direction, "rtl");
        assert!((l.bbox.x1 - right).abs() < 0.5, "{f}: right edge moved {right} → {}", l.bbox.x1);
    }
}

#[test]
fn arabic_append_word() {
    for f in FIXTURES {
        let mut e = open(f, true);
        let after = edit(&mut e, ARABIC[0], "تجريبي.", "تجريبي. شكرا").unwrap_or_else(|err| panic!("{f}: {err:?}"));
        shapes_ok(&after, "مرحبا بالعالم، هذا نص تجريبي. شكرا");
    }
}

#[test]
fn ac206_number_in_arabic_line() {
    for f in FIXTURES {
        let mut e = open(f, true);
        let after = edit(&mut e, ARABIC[1], "2500", "3750").unwrap_or_else(|err| panic!("{f}: {err:?}"));
        shapes_ok(&after, "المبلغ الإجمالي 3750 ريال للفاتورة رقم 77.");
    }
}

#[test]
fn ac210_missing_glyphs_names_script_family() {
    let mut e = open("scripts-chrome.pdf", false);
    match edit(&mut e, HINDI[0], "कुल", "ज्ञानौषधि") {
        Err(Error::MissingGlyphs { request, .. }) => {
            let norm = berry_engine::fallback::normalize;
            assert_eq!(norm(&request.families[0]), norm("Noto Sans Devanagari"), "{:?}", request.families);
            assert!(request.families.iter().any(|f| f == "Noto Serif Devanagari"), "{:?}", request.families);
        }
        other => panic!("expected missing glyphs, got {other:?}"),
    }
}

#[test]
fn ac214_latin_line_unchanged_path() {
    for f in &FIXTURES[..2] {
        let mut e = open(f, false);
        let after = edit(&mut e, "Invoice 2041 — total due on Friday", "Friday", "Monday");
        match after {
            Ok(p) => shapes_ok(&p, "Invoice 2041 — total due on Monday"),
            // A subset without the letters is fine, as long as it says so.
            Err(Error::MissingGlyphs { .. }) => {}
            Err(err) => panic!("{f}: {err:?}"),
        }
    }
}

#[test]
fn ac209_embedded_font_shapes_when_it_can() {
    // The Word-style file embeds full fonts with their layout tables: no stand-in is needed.
    let mut e = open("scripts-plain.pdf", false);
    let p = e.page_text(0).unwrap();
    let id = line_of(&p, HINDI[0]);
    let r = e.replace_range(0, id, 0, "कुल".chars().count(), "संपूर्ण").unwrap();
    assert!(r.substitutions.is_empty(), "{:?}", r.substitutions);
    shapes_ok(&r.page, "संपूर्ण राशि का भुगतान समय पर किया गया।");
    // An Arabic word whose glyphs the embedded font's own Unicode map already covers.
    let p = e.page_text(0).unwrap();
    let id = line_of(&p, ARABIC[3]);
    let start = ARABIC[3].chars().count() - "عليكم «تجربة».".chars().count();
    let r = e.replace_range(0, id, start, start + "عليكم".chars().count(), "عليكما").unwrap();
    assert!(r.substitutions.is_empty(), "{:?}", r.substitutions);
    shapes_ok(&r.page, "قال مُحَمَّدٌ: السلام عليكما «تجربة».");
}

#[test]
fn ac207_rest_of_page_unchanged() {
    // The engine's own check compares every untouched glyph; here, the lines around an edit
    // keep their exact boxes.
    for f in FIXTURES {
        let mut e = open(f, true);
        let before = e.page_text(0).unwrap();
        let after = edit(&mut e, HINDI[0], "कुल", "संपूर्ण").unwrap();
        for t in HINDI[1..].iter().chain(ARABIC.iter()) {
            let (Some(a), Some(b)) = (before.lines.iter().find(|l| l.text == *t), after.lines.iter().find(|l| l.text == *t))
            else {
                continue;
            };
            assert!((a.bbox.x0 - b.bbox.x0).abs() < 1e-6 && (a.bbox.y1 - b.bbox.y1).abs() < 1e-6, "{f}: {t} moved");
        }
    }
}

#[test]
fn ac212_legacy_hindi_font_is_read_only() {
    use lopdf::{dictionary, Document, Object, Stream};
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let font = doc.add_object(
        dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "ABCDEF+KrutiDev010", "Encoding" => "WinAnsiEncoding" },
    );
    let content = doc.add_object(Stream::new(dictionary! {}, b"BT /F1 14 Tf 72 700 Td (dqy jkf'k) Tj ET".to_vec()));
    let page = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id, "Contents" => content,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary! { "Font" => dictionary! { "F1" => font } },
    });
    doc.objects
        .insert(pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Count" => 1, "Kids" => vec![page.into()] }));
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    let mut bytes = Vec::new();
    doc.save_to(&mut bytes).unwrap();
    let mut e = Engine::open(bytes, None).unwrap();
    let p = e.page_text(0).unwrap();
    assert_eq!(p.lines[0].read_only_reason, Some("legacy-font-encoding"));
    assert!(!p.lines[0].editable);
    assert!(matches!(e.replace_line(0, 0, "x"), Err(Error::ReadOnly { reason }) if reason == "legacy-font-encoding"));
}
