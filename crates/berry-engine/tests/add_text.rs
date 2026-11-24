//! New text on a page (`shape_text`, `add_text`): Latin in both builds, Hindi and Arabic with
//! the shaper, fonts registered from the editor's WOFF files.

use berry_engine::fallback::FontRequest;
use berry_engine::{Engine, Error, PageText};
use lopdf::{dictionary, Document, Object, Stream};

const DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor");

fn read(name: &str) -> Vec<u8> {
    std::fs::read(format!("{DIR}/{name}")).unwrap()
}

/// One 612×792 page with this content and a Helvetica F1.
fn page(content: &str) -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let f1 = doc.add_object(
        dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding" },
    );
    let contents = doc.add_object(Stream::new(dictionary! {}, content.as_bytes().to_vec()));
    let page = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id, "Contents" => contents,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary! { "Font" => dictionary! { "F1" => f1 } },
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

/// The editor's fonts: Noto Sans (Latin), and with `scripts` Devanagari and Naskh Arabic, all
/// as the WOFF files the web app ships.
fn engine(pdf: Vec<u8>, scripts: bool) -> Engine {
    let mut e = Engine::open(pdf, None).unwrap();
    assert!(e.add_font("Noto Sans", false, false, read("webfonts/NotoSans-Regular.woff")));
    if scripts {
        assert!(e.add_font("Noto Sans Devanagari", false, false, read("webfonts/NotoSansDevanagari-Regular.woff")));
        assert!(e.add_font("Noto Naskh Arabic", false, false, read("webfonts/NotoNaskhArabic-Regular.woff")));
    }
    e
}

fn sans() -> FontRequest {
    FontRequest { families: vec!["Noto Sans".into()], bold: false, italic: false }
}

const BLACK: [u8; 3] = [0, 0, 0];

/// Saves, reopens and returns page 1.
fn reopen(e: &mut Engine) -> PageText {
    let (out, report) = e.save().unwrap();
    assert!(report.original_preserved);
    Engine::open(out, None).unwrap().page_text(0).unwrap()
}

fn line<'a>(p: &'a PageText, text: &str) -> &'a berry_engine::layout::Line {
    p.lines
        .iter()
        .find(|l| l.text == text)
        .unwrap_or_else(|| panic!("no line {text:?} in {:#?}", p.lines.iter().map(|l| &l.text).collect::<Vec<_>>()))
}

#[test]
fn woff_fonts_register_and_bad_ones_are_refused() {
    let mut e = Engine::open(page(""), None).unwrap();
    let woff = read("webfonts/NotoSans-Regular.woff");
    assert!(!e.add_font("Broken", false, false, woff[..woff.len() / 2].to_vec()));
    let mut bad = woff.clone();
    bad[48..52].copy_from_slice(&u32::MAX.to_be_bytes()); // first table's offset
    assert!(!e.add_font("Broken", false, false, bad));
    assert!(e.add_font("Noto Sans", false, false, woff));
    // Web font slices of one family are all kept.
    assert!(e.add_font("Noto Sans", false, false, read("webfonts/NotoSansDevanagari-Regular.woff")));
    assert_eq!(
        e.shape_text("नमस्ते", &sans(), 10.0).map(|s| s.runs[0].family.clone()).ok().as_deref(),
        cfg!(feature = "shaping").then_some("Noto Sans")
    );
    let s = e.shape_text("Hello", &sans(), 10.0).unwrap();
    assert_eq!(s.runs.len(), 1);
    assert_eq!(s.runs[0].family, "Noto Sans");
    assert_eq!(s.runs[0].glyphs.len(), 5);
}

#[test]
fn latin_line_lands_where_asked_and_reads_back() {
    let mut e = engine(page("BT /F1 12 Tf 72 700 Td (Existing line) Tj ET"), false);
    let shaped = e.shape_text("Invoice No. 42, paid", &sans(), 14.0).unwrap();
    assert_eq!(shaped.direction, "ltr");
    assert!(shaped.width > 100.0 && shaped.width < 200.0, "{}", shaped.width);
    assert!(shaped.ascent > 10.0 && shaped.descent < 0.0);
    let total: f64 = shaped.runs.iter().map(|r| r.width).sum();
    assert!((total - shaped.width).abs() < 1e-9);

    let r = e.add_text(0, "Invoice No. 42, paid", &sans(), 14.0, 100.0, 500.0, 0.0, [200, 0, 0]).unwrap();
    assert!(r.substitutions.is_empty());
    let c = &r.changed[0];
    assert!(c.x0 < 100.0 && c.x1 > 100.0 + shaped.width - 1.0 && c.y0 < 500.0 && c.y1 > 510.0, "{c:?}");
    let after = reopen(&mut e);
    let old = line(&after, "Existing line");
    assert!((old.origin.0 - 72.0).abs() < 1e-6);
    let new = line(&after, "Invoice No. 42, paid");
    assert!((new.origin.0 - 100.0).abs() < 0.01 && (new.origin.1 - 500.0).abs() < 0.01, "{:?}", new.origin);
    assert!((new.size - 14.0).abs() < 1e-6);
    assert!((new.bbox.x1 - new.bbox.x0 - shaped.width).abs() < 0.5, "{:?} vs {}", new.bbox, shaped.width);
    assert_eq!(new.runs[0].color, [200, 0, 0]);
}

#[test]
fn page_state_left_open_does_not_move_new_text() {
    // A scale and a fill colour left set by the page's own content (no q … Q).
    let mut e = engine(page("2 0 0 2 0 0 cm 0 0 1 rg BT /F1 12 Tf 10 300 Td (Scaled) Tj ET"), false);
    e.add_text(0, "Plain", &sans(), 12.0, 72.0, 72.0, 0.0, BLACK).unwrap();
    let after = reopen(&mut e);
    let new = line(&after, "Plain");
    assert!((new.origin.0 - 72.0).abs() < 0.01 && (new.origin.1 - 72.0).abs() < 0.01);
    assert!((new.size - 12.0).abs() < 1e-6);
    assert_eq!(new.runs[0].color, BLACK);
    assert!((line(&after, "Scaled").size - 24.0).abs() < 1e-6);
}

#[test]
fn rotated_line() {
    let mut e = engine(page(""), false);
    e.add_text(0, "Up the side", &sans(), 10.0, 300.0, 100.0, 90.0, BLACK).unwrap();
    let after = reopen(&mut e);
    let l = line(&after, "Up the side");
    assert!((l.angle - 90.0).abs() < 1e-6, "{}", l.angle);
    assert!((l.origin.0 - 300.0).abs() < 0.01 && (l.origin.1 - 100.0).abs() < 0.01);
}

#[test]
fn bad_input_changes_nothing() {
    let mut e = engine(page(""), false);
    assert!(matches!(e.add_text(3, "x", &sans(), 10.0, 0.0, 0.0, 0.0, BLACK), Err(Error::BadPage)));
    assert!(matches!(e.add_text(0, "x", &sans(), f64::NAN, 0.0, 0.0, 0.0, BLACK), Err(Error::Unsupported { .. })));
    for text in ["two\nlines", "a\u{1C}b", "a\u{85}b", "a\u{2029}b"] {
        assert!(matches!(e.add_text(0, text, &sans(), 10.0, 0.0, 0.0, 0.0, BLACK), Err(Error::Unsupported { .. })), "{text:?}");
    }
    assert!(e.add_text(0, "\u{200B}\u{FEFF}", &sans(), 10.0, 0.0, 0.0, 0.0, BLACK).unwrap().changed.is_empty());
    assert!(e.add_text(0, "   ", &sans(), 10.0, 0.0, 0.0, 0.0, BLACK).unwrap().changed.is_empty());
    match e.add_text(0, "Price ₹ 5", &sans(), 10.0, 0.0, 0.0, 0.0, BLACK) {
        Err(Error::MissingGlyphs { chars, request }) => {
            assert_eq!(chars, "₹");
            assert_eq!(request.families[0], "Noto Sans");
        }
        other => panic!("{other:?}"),
    }
    let (_, report) = e.save().unwrap();
    assert!(report.pages_edited.is_empty());
    assert_eq!(report.objects_written, 0);
}

#[test]
fn missing_script_fonts_are_named() {
    let e = engine(page(""), false);
    for (text, family) in [("مرحبا", "Noto Naskh Arabic"), ("नमस्ते", "Noto Sans Devanagari")] {
        match e.shape_text(text, &sans(), 12.0) {
            Err(Error::MissingGlyphs { request, .. }) => {
                // The box's family, then the script's open families (sans first for a sans box).
                assert_eq!(request.families[0], "Noto Sans");
                assert!(request.families[1..3].iter().any(|f| f == family), "{:?}", request.families);
            }
            #[cfg(not(feature = "shaping"))]
            Err(Error::ReadOnly { reason }) => assert_eq!(reason, "needs-shaping"),
            other => panic!("{other:?}"),
        }
    }
}

#[cfg(not(feature = "shaping"))]
#[test]
fn default_build_leaves_complex_text_to_the_shaping_module() {
    let mut e = engine(page(""), true);
    for text in ["नमस्ते दुनिया", "مرحبا بالعالم"] {
        match e.add_text(0, text, &sans(), 12.0, 72.0, 72.0, 0.0, BLACK) {
            Err(Error::ReadOnly { reason }) => assert_eq!(reason, "needs-shaping"),
            other => panic!("{other:?}"),
        }
    }
}

#[cfg(feature = "shaping")]
mod shaping {
    use super::*;

    const HINDI: &str = "संपूर्ण राशि का भुगतान समय पर किया गया।";
    const ARABIC: &str = "مرحبا بالعالم، هذا نص تجريبي.";
    const VOWELLED: &str = "قال مُحَمَّدٌ: السلام عليكم «تجربة».";

    #[test]
    fn hindi_line_is_shaped_and_reads_back() {
        let mut e = engine(page(""), true);
        let s = e.shape_text(HINDI, &sans(), 16.0).unwrap();
        assert_eq!(s.direction, "ltr");
        assert!(s.runs.iter().all(|r| r.family == "Noto Sans Devanagari"), "{:?}", s.runs);
        let glyphs: usize = s.runs.iter().map(|r| r.glyphs.len()).sum();
        // Conjuncts (संपूर्ण's र्ण) and matras make fewer glyphs than characters.
        assert!(glyphs < HINDI.chars().count(), "{glyphs}");
        let len16 = HINDI.encode_utf16().count();
        assert!(s.runs.iter().all(|r| r.start < r.end && r.end <= len16));
        assert!(s.runs.iter().flat_map(|r| &r.glyphs).all(|g| g.cluster < len16));

        let r = e.add_text(0, HINDI, &sans(), 16.0, 72.0, 600.0, 0.0, BLACK).unwrap();
        assert_eq!(r.substitutions.len(), 1);
        assert_eq!(r.substitutions[0].substitute_font, "Noto Sans Devanagari");
        let after = reopen(&mut e);
        let l = line(&after, HINDI);
        assert_eq!(l.direction, "ltr");
        assert!((l.origin.0 - 72.0).abs() < 0.01);
    }

    #[test]
    fn arabic_line_is_shaped_right_to_left_and_reads_back() {
        let mut e = engine(page(""), true);
        let req = FontRequest { families: vec!["Noto Naskh Arabic".into()], bold: false, italic: false };
        let s = e.shape_text(ARABIC, &req, 18.0).unwrap();
        assert_eq!(s.direction, "rtl");
        assert!(s.runs.iter().all(|r| r.direction == "rtl"), "{:?}", s.runs);
        // The web font's Arabic slice has no full stop: Noto Sans draws it, at the left end.
        let families: Vec<&str> = s.runs.iter().map(|r| r.family.as_str()).collect();
        assert_eq!(families, ["Noto Sans", "Noto Naskh Arabic"]);
        assert_eq!((s.runs[0].start, s.runs[0].end), (28, 29));
        // Right alignment: the left end is the right edge minus the width.
        let right = 540.0;
        let r = e.add_text(0, ARABIC, &req, 18.0, right - s.width, 650.0, 0.0, BLACK).unwrap();
        assert_eq!(r.substitutions.len(), 1);
        assert_eq!((r.substitutions[0].chars.as_str(), r.substitutions[0].substitute_font.as_str()), (".", "Noto Sans"));
        let after = reopen(&mut e);
        let l = line(&after, ARABIC);
        assert_eq!(l.direction, "rtl");
        assert!((l.bbox.x1 - right).abs() < 1.0, "{:?}", l.bbox);
    }

    #[test]
    fn vowelled_arabic_and_mixed_scripts_read_back() {
        let mut e = engine(page("BT /F1 12 Tf 72 700 Td (Header) Tj ET"), true);
        let lines = [
            VOWELLED,
            "اتفاقية الخدمة PDF بين المزود والعميل.",
            "المبلغ الإجمالي 2500 ريال للفاتورة رقم 77.",
            "Total: कुल राशि 500 (paid)",
        ];
        for (i, text) in lines.iter().enumerate() {
            e.add_text(0, text, &sans(), 12.0, 72.0, 600.0 - 30.0 * i as f64, 0.0, BLACK)
                .unwrap_or_else(|err| panic!("{text}: {err:?}"));
        }
        let after = reopen(&mut e);
        line(&after, "Header");
        for text in lines {
            line(&after, text);
        }
        // Right-to-left words with numbers in a left-to-right line (invoices, phone numbers).
        let embedded = ["Price سعر 100", "Invoice فاتورة 2024 paid", "Call هاتف 555-1234 now", "Room غرفة 2"];
        for (i, text) in embedded.iter().enumerate() {
            e.add_text(0, text, &sans(), 12.0, 300.0, 600.0 - 30.0 * i as f64, 0.0, BLACK)
                .unwrap_or_else(|err| panic!("{text}: {err:?}"));
        }
        let after = reopen(&mut e);
        for text in embedded {
            line(&after, text);
        }
        // Runs cover disjoint ranges of the text.
        let s = e.shape_text("Price سعر 100", &sans(), 12.0).unwrap();
        let mut ranges: Vec<(usize, usize)> = s.runs.iter().map(|r| (r.start, r.end)).collect();
        ranges.sort_unstable();
        assert!(ranges.windows(2).all(|w| w[0].1 <= w[1].0), "{ranges:?}");
        assert_eq!(ranges.first().map(|r| r.0), Some(0));
        assert_eq!(ranges.last().map(|r| r.1), Some("Price سعر 100".encode_utf16().count()));
        let mixed = e.shape_text("Total: कुल राशि 500 (paid)", &sans(), 12.0).unwrap();
        let families: Vec<&str> = mixed.runs.iter().map(|r| r.family.as_str()).collect();
        assert_eq!(families, ["Noto Sans", "Noto Sans Devanagari", "Noto Sans"], "{:?}", mixed.runs);
    }

    #[test]
    fn added_text_can_be_edited_again() {
        let mut e = engine(page(""), true);
        e.add_text(0, ARABIC, &sans(), 14.0, 100.0, 400.0, 0.0, BLACK).unwrap();
        e.add_text(0, HINDI, &sans(), 14.0, 100.0, 300.0, 0.0, BLACK).unwrap();
        let p = e.page_text(0).unwrap();
        let hindi = p.lines.iter().position(|l| l.text == HINDI).unwrap();
        assert!(p.lines[hindi].editable);
        let r = e.replace_range(0, hindi, 0, 7, "कुल").unwrap();
        assert!(r.page.lines.iter().any(|l| l.text == "कुल राशि का भुगतान समय पर किया गया।"));
        let after = reopen(&mut e);
        line(&after, ARABIC);
        line(&after, "कुल राशि का भुगतान समय पर किया गया।");
    }

    #[test]
    fn added_on_a_real_producer_page_keeps_its_text() {
        let pdf = read("scripts-chrome.pdf");
        let before = Engine::open(pdf.clone(), None).unwrap().page_text(0).unwrap();
        let mut e = engine(pdf, true);
        e.add_text(0, ARABIC, &sans(), 12.0, 72.0, 60.0, 0.0, BLACK).unwrap();
        let after = reopen(&mut e);
        for l in &before.lines {
            assert!(after.lines.iter().any(|a| a.text == l.text && (a.origin.0 - l.origin.0).abs() < 1e-6), "{:?}", l.text);
        }
        line(&after, ARABIC);
    }
}
