//! Fonts embedded in real PDFs match the font files they were made from (AC-281, AC-282).

use berry_engine::engine::Engine;
use berry_fontmatch::*;

const DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor");

fn file(name: &str) -> Vec<u8> {
    std::fs::read(format!("{DIR}/{name}")).unwrap_or_else(|e| panic!("{name}: {e}"))
}

/// Fingerprint of the document font whose name contains `name`.
fn embedded(pdf: &str, name: &str) -> (Fingerprint, bool) {
    embedded_chars(pdf, name, ALPHABET)
}

const HINDI: &str = "कखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह";

fn embedded_chars(pdf: &str, name: &str, chars: &str) -> (Fingerprint, bool) {
    let mut engine = Engine::open(file(pdf), None).unwrap();
    let info = engine.fonts().into_iter().find(|f| f.name.contains(name)).unwrap_or_else(|| panic!("no font {name} in {pdf}"));
    let program = engine.font_program(info.object.unwrap(), chars).unwrap();
    let glyphs: Vec<(char, u16, f32)> =
        program.glyphs.iter().map(|g| (char::from_u32(g.cp).unwrap(), g.gid, g.width as f32)).collect();
    let print =
        fingerprint_program(program.format, &program.bytes, &glyphs).unwrap_or_else(|| panic!("{name}: unreadable program"));
    (print, program.complete)
}

#[test]
fn a_subset_matches_the_family_it_was_cut_from() {
    // The subset holds the Hindi letters the page used and almost no Latin, so the comparison
    // runs on the script's own letters.
    let chars = format!("{ALPHABET}{HINDI}");
    let (font, serif) = (file("fonts/NotoSansDevanagari-Regular.ttf"), file("fonts/NotoNaskhArabic-Regular.ttf"));
    let library = fingerprint_chars(&OpenTypeSource::parse(&font).unwrap(), &chars);
    let other = fingerprint_chars(&OpenTypeSource::parse(&serif).unwrap(), &chars);
    let (subset, complete) = embedded_chars("scripts-chrome.pdf", "NotoSansDevanagari", &chars);
    assert!(!complete);
    let (same, shared) = glyph_distance(&subset.glyphs, &library.glyphs).unwrap();
    assert!(shared >= 5, "{shared} shared letters");
    assert!(same < 0.012, "same family: {same}");
    // A different design is told apart on the letters both have, even when a name would match.
    if let Some((different, _)) = glyph_distance(&subset.glyphs, &other.glyphs) {
        assert!(different > same + 0.02, "same {same}, different {different}");
    }
}

#[test]
fn a_fully_embedded_font_matches_exactly() {
    let library = fingerprint_bytes(&file("fonts/NotoNaskhArabic-Regular.ttf")).unwrap();
    let (print, complete) = embedded("scripts-plain.pdf", "NotoNaskhArabic");
    assert!(complete);
    let (d, _) = glyph_distance(&print.glyphs, &library.glyphs).unwrap();
    assert_eq!(d, 0.0);
    // The PDF rounds widths to whole units, so the width bytes may differ by one step.
    assert!(coarse_distance(&print.coarse, &library.coarse).unwrap() < 0.01);
}

#[test]
fn a_font_that_is_not_embedded_gives_widths_only() {
    let mut engine = Engine::open(file("std14-reportlab.pdf"), None).unwrap();
    let info = engine.fonts().into_iter().find(|f| f.name == "Helvetica").unwrap();
    let program = engine.font_program(info.object.unwrap(), ALPHABET).unwrap();
    assert_eq!(program.format, "none");
    assert!(program.bytes.is_empty());
    assert!(program.glyphs.len() >= 52);
    let widths: Vec<(char, f32)> = program.glyphs.iter().map(|g| (char::from_u32(g.cp).unwrap(), g.width as f32)).collect();
    let print = fingerprint_widths(&widths);
    assert_eq!(print.coarse[slot::X_HEIGHT], UNKNOWN);
    // Helvetica's "i" is 222 units wide.
    assert_eq!(print.coarse[slot::ADVANCES + 8], (222.0f32 / 1270.0 * 254.0).round() as u8);
    assert_eq!(print.coarse[slot::MONOSPACE], 0);
}

#[test]
fn an_unknown_object_is_a_bad_font() {
    let mut engine = Engine::open(file("std14-reportlab.pdf"), None).unwrap();
    assert!(engine.font_program(999_999, "a").is_err());
}
