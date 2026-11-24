//! `preview_line`: how a complex-script line would look with new text, for the edit box. The
//! edit is made, read and rolled back, so the preview is exactly what the file then draws and
//! the document is left as it was.
#![cfg(feature = "shaping")]

use berry_engine::{Engine, Error, LinePreview, PageText};

const DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor");

fn read(name: &str) -> Vec<u8> {
    std::fs::read(format!("{DIR}/{name}")).unwrap()
}

fn engine(name: &str) -> Engine {
    let mut e = Engine::open(read(name), None).unwrap();
    for (family, file) in
        [("Noto Sans Devanagari", "NotoSansDevanagari-Regular.ttf"), ("Noto Naskh Arabic", "NotoNaskhArabic-Regular.ttf")]
    {
        assert!(e.add_font(family, false, false, read(&format!("fonts/{file}"))));
    }
    e
}

fn texts(p: &PageText) -> Vec<String> {
    p.lines.iter().map(|l| l.text.clone()).collect()
}

fn line_id(p: &PageText, starts: &str) -> usize {
    p.lines.iter().position(|l| l.text.starts_with(starts)).unwrap_or_else(|| panic!("no line {starts:?} in {:?}", texts(p)))
}

/// Glyphs as comparable tuples: outline, then place to 1/100 pt.
fn drawn(p: &LinePreview) -> Vec<(String, i64, i64, i64)> {
    let r = |v: f64| (v * 100.0).round() as i64;
    p.glyphs.iter().map(|g| (p.paths[g.path].clone(), r(g.x), r(g.y), r(g.size))).collect()
}

/// The preview of an edit is what the line draws once the edit is made, and the preview leaves
/// the document as it was.
#[test]
fn preview_matches_the_edit_and_changes_nothing() {
    for (file, starts, from, to) in [
        ("scripts-chrome.pdf", "कुल", "भुगतान", "भुगतान नया"),
        ("scripts-libreoffice.pdf", "कुल", "समय", "दिन"),
        ("scripts-plain.pdf", "مرحبا", "تجريبي.", "تجريبي جديد."),
        ("scripts-chrome.pdf", "مرحبا", "بالعالم،", "بالجميع،"),
    ] {
        let mut e = engine(file);
        let before = e.page_text(0).unwrap();
        let id = line_id(&before, starts);
        let want = before.lines[id].text.replacen(from, to, 1);
        let preview = e.preview_line(0, id, &want).unwrap_or_else(|err| panic!("{file} {to:?}: {err:?}"));
        assert!(!preview.glyphs.is_empty());
        assert!(preview.glyphs.iter().all(|g| !preview.paths[g.path].is_empty()));
        assert_eq!(texts(&e.page_text(0).unwrap()), texts(&before), "{file}: the preview changed the page");
        let saved = e.save().unwrap().0;
        assert_eq!(saved, read(file), "{file}: the preview changed the file");

        let after = e.replace_line(0, id, &want).unwrap();
        let id = line_id(&after.page, &want[..want.char_indices().nth(3).unwrap().0]);
        let now = e.preview_line(0, id, &want).unwrap();
        assert_eq!(drawn(&preview), drawn(&now), "{file} {to:?}: the preview differs from the edit");
    }
}

/// The unchanged line: its own glyphs, every one with an outline.
#[test]
fn unchanged_line_is_drawn_from_its_own_glyphs() {
    let mut e = engine("scripts-chrome.pdf");
    let p = e.page_text(0).unwrap();
    let id = line_id(&p, "प्रधानमंत्री");
    let preview = e.preview_line(0, id, &p.lines[id].text).unwrap();
    let words = p.lines[id].text.split_whitespace().count();
    assert!(preview.glyphs.len() > words * 2, "{} glyphs", preview.glyphs.len());
    let x0 = preview.glyphs.iter().map(|g| g.x).fold(f64::INFINITY, f64::min);
    assert!((x0 - p.lines[id].bbox.x0).abs() < 2.0, "starts at {x0}, line at {}", p.lines[id].bbox.x0);
}

/// An edit the engine refuses is refused by the preview with the same reason, and a line of a
/// simple script is not previewed (the box draws it with the document's own font).
#[test]
fn refused_edits_and_simple_lines() {
    let mut e = engine("scripts-plain.pdf");
    let p = e.page_text(0).unwrap();
    let id = line_id(&p, "مرحبا");
    let err = e.preview_line(0, id, &format!("{}!", p.lines[id].text)).unwrap_err();
    assert!(matches!(err, Error::Verify { reason: "text-mismatch", .. }), "{err:?}");
    assert_eq!(texts(&e.page_text(0).unwrap()), texts(&p));

    let mut e = engine("scripts-chrome.pdf");
    let p = e.page_text(0).unwrap();
    let id = line_id(&p, "Invoice");
    let err = e.preview_line(0, id, "Invoice 2042 — total due on Friday").unwrap_err();
    assert!(matches!(&err, Error::Unsupported { reason } if reason == "preview-simple-script"), "{err:?}");
    assert_eq!(texts(&e.page_text(0).unwrap()), texts(&p));
}
