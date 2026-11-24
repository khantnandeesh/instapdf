//! Edge cases of surgical text replacement on hand-built content streams.

use berry_engine::{Engine, Error, PageText};
use lopdf::{dictionary, Document, Object, Stream};

/// Builds a PDF. Each inner slice is one page's content streams. Fonts: F1 Helvetica, F2 Times.
fn build(pages: &[&[&str]]) -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let f1 = doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding" });
    let f2 = doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Times-Roman", "Encoding" => "WinAnsiEncoding" });
    let resources = doc.add_object(dictionary! { "Font" => dictionary! { "F1" => f1, "F2" => f2 } });
    let mut kids = Vec::new();
    for streams in pages {
        let ids: Vec<Object> = streams
            .iter()
            .map(|s| Object::Reference(doc.add_object(Stream::new(dictionary! {}, s.as_bytes().to_vec()))))
            .collect();
        let page = doc.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages_id, "Contents" => Object::Array(ids),
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()], "Resources" => resources,
        });
        kids.push(Object::Reference(page));
    }
    doc.objects.insert(pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Count" => kids.len() as i64, "Kids" => kids }));
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
}

fn texts(p: &PageText) -> Vec<String> {
    p.lines.iter().map(|l| l.text.clone()).collect()
}

fn line<'a>(p: &'a PageText, containing: &str) -> &'a berry_engine::layout::Line {
    p.lines.iter().find(|l| l.text.contains(containing)).unwrap_or_else(|| panic!("no line with {containing:?} in {:?}", texts(p)))
}

fn word_x(p: &PageText, word: &str) -> f64 {
    p.lines.iter().flat_map(|l| l.words.iter()).find(|w| w.text == word).unwrap_or_else(|| panic!("no word {word:?}")).bbox.x0
}

/// Opens, replaces `find` with `replace` on page 0, saves, reopens. Returns (before, after).
fn edit(pdf: &[u8], find: &str, replace: &str) -> (PageText, PageText, Vec<u8>) {
    let mut e = Engine::open(pdf.to_vec(), None).unwrap();
    let before = e.page_text(0).unwrap();
    let m = e.find(0, find, true).unwrap();
    let m = m.first().unwrap_or_else(|| panic!("{find:?} not found in {:?}", texts(&before)));
    e.replace_range(0, m.line, m.start, m.end, replace).unwrap();
    let (out, report) = e.save().unwrap();
    assert!(report.original_preserved);
    assert_eq!(&out[..pdf.len()], pdf, "the original bytes stay an untouched prefix");
    let after = Engine::open(out.clone(), None).unwrap().page_text(0).unwrap();
    (before, after, out)
}

#[test]
fn tj_array_edit_keeps_neighbours_in_place() {
    // AC-11c: a word inside a kerned TJ array changes; the words before it must not move at
    // all, and the words after it move together by exactly the change in width.
    let pdf = build(&[&["BT /F1 12 Tf 72 700 Td [(The qu) -20 (ick brown) 15 ( fox jumps)] TJ ET\nBT /F1 12 Tf 72 680 Td (Second line) Tj ET"]]);
    let (before, after, _) = edit(&pdf, "brown", "purple");
    assert_eq!(texts(&after), ["The quick purple fox jumps", "Second line"]);
    assert_eq!(word_x(&before, "quick"), word_x(&after, "quick"));
    let shift = word_x(&after, "fox") - word_x(&before, "fox");
    assert!((shift - (word_x(&after, "jumps") - word_x(&before, "jumps"))).abs() < 1e-6);
    // Helvetica at 12 pt: "purple" is 33.348 pt wide and "brown" 32.676 pt. The 15-unit kern
    // (0.18 pt) belonged to the removed "n", so the tail starts right after the new word.
    assert!((shift - (0.672 + 0.18)).abs() < 0.005, "shift was {shift}");
    assert_eq!(line(&before, "Second").bbox, line(&after, "Second").bbox);
}

#[test]
fn only_the_changed_operator_is_rewritten() {
    let content = "q 0.5 g 10 10 100 100 re f Q\nBT /F1 12 Tf 72 700 Td (Hello world) Tj ET\nq 1 0 0 RG 5 w 0 0 m 50 50 l S Q\nBT /F2 10 Tf 72 650 Td (Untouched) Tj ET";
    let pdf = build(&[&[content]]);
    let (_, _, out) = edit(&pdf, "world", "there");
    let doc = Document::load_mem(&out).unwrap();
    let page = *doc.get_pages().get(&1).unwrap();
    let new = String::from_utf8(doc.get_page_content(page)).unwrap();
    assert_eq!(new.trim_end(), content.replace("(Hello world) Tj", "(Hello there) Tj"));
}

#[test]
fn words_placed_one_by_one_keep_their_gaps() {
    // Justified text: each word has its own Td. The reference editor loses these gaps.
    let pdf = build(&[&["BT /F2 12 Tf 72 700 Td (This) Tj 30 0 Td (is) Tj 20 0 Td (made) Tj 40 0 Td (between) Tj 50 0 Td (them) Tj -140 -14 Td (next line here) Tj ET"]]);
    let (before, after, _) = edit(&pdf, "made", "signed");
    assert_eq!(texts(&after), ["This is signed between them", "next line here"]);
    let gap = |p: &PageText, a: &str, b: &str| {
        let l = line(p, a);
        let wa = l.words.iter().find(|w| w.text == a).unwrap();
        let wb = l.words.iter().find(|w| w.text == b).unwrap();
        wb.bbox.x0 - wa.bbox.x1
    };
    assert!((gap(&before, "made", "between") - gap(&after, "signed", "between")).abs() < 0.01);
    assert!((gap(&before, "between", "them") - gap(&after, "between", "them")).abs() < 0.01);
    assert_eq!(word_x(&before, "is"), word_x(&after, "is"));
    // The next line is positioned relative to this one and must not move.
    assert_eq!(line(&before, "next").bbox, line(&after, "next").bbox);
}

#[test]
fn quote_operators_are_split_correctly() {
    let pdf = build(&[&["BT /F1 12 Tf 14 TL 72 700 Td (First line) Tj (Second line) ' 2 1 (Third wide line) \" (Fourth line) ' ET"]]);
    let (before, after, _) = edit(&pdf, "Second", "2nd");
    assert_eq!(texts(&after)[1], "2nd line");
    for l in ["First", "Fourth"] {
        assert_eq!(line(&before, l).bbox, line(&after, l).bbox, "{l} moved");
    }
    assert_eq!(before.lines[2].bbox, after.lines[2].bbox);
    let (before, after, _) = edit(&pdf, "wide", "narrow");
    assert_eq!(before.lines[3].bbox, after.lines[3].bbox);
    assert_eq!(before.lines[2].bbox.x0, after.lines[2].bbox.x0);
    assert!(after.lines[2].bbox.x1 > before.lines[2].bbox.x1);
}

#[test]
fn text_after_the_edit_in_the_same_string_but_another_column_stays() {
    // One TJ draws two columns with a big jump. Editing the left one must not move the right.
    let pdf = build(&[&["BT /F1 10 Tf 72 700 Td [(Name) -9000 (Amount)] TJ ET"]]);
    let (before, after, _) = edit(&pdf, "Name", "Full name");
    assert_eq!(texts(&after), ["Full name", "Amount"]);
    assert!((word_x(&before, "Amount") - word_x(&after, "Amount")).abs() < 0.01);
}

#[test]
fn insert_delete_and_whole_line() {
    let pdf = build(&[&["BT /F1 12 Tf 72 700 Td (Total: 10) Tj ET BT /F1 12 Tf 72 680 Td (Keep) Tj ET"]]);
    let (_, after, _) = edit(&pdf, "10", "1000");
    assert_eq!(texts(&after)[0], "Total: 1000");
    let (_, after, _) = edit(&pdf, "Total: ", "");
    assert_eq!(texts(&after)[0], "10");
    let (before, after, _) = edit(&pdf, "Total: 10", "Sum = 99");
    assert_eq!(texts(&after), ["Sum = 99", "Keep"]);
    assert_eq!(before.lines[0].origin, after.lines[0].origin);
}

#[test]
fn edit_spans_content_streams() {
    let pdf = build(&[&["BT /F1 12 Tf 72 700 Td (Alpha ) Tj", "(beta gamma) Tj ET", "BT /F1 12 Tf 72 680 Td (tail) Tj ET"]]);
    let (before, after, out) = edit(&pdf, "beta", "BETA!");
    assert_eq!(texts(&after), ["Alpha BETA! gamma", "tail"]);
    assert_eq!(word_x(&before, "Alpha"), word_x(&after, "Alpha"));
    // Only the second stream changed: the first and third are the same objects as before.
    let old = Document::load_mem(&pdf).unwrap();
    let new = Document::load_mem(&out).unwrap();
    let ids = |d: &Document| d.get_page_contents(*d.get_pages().get(&1).unwrap());
    assert_eq!(ids(&old), ids(&new));
    let body = |d: &Document, i: usize| d.get_object(ids(d)[i]).unwrap().as_stream().unwrap().get_plain_content().unwrap();
    assert_eq!(body(&old, 0), body(&new, 0));
    assert_eq!(body(&old, 2), body(&new, 2));
    assert_ne!(body(&old, 1), body(&new, 1));
}

#[test]
fn content_stream_shared_by_two_pages_is_copied_first() {
    let mut doc = Document::load_mem(&build(&[&["BT /F1 12 Tf 72 700 Td (Shared header) Tj ET"], &["BT /F1 12 Tf 72 700 Td (x) Tj ET"]])).unwrap();
    let pages: Vec<_> = doc.get_pages().into_values().collect();
    let first = doc.get_dictionary(pages[0]).unwrap().get(b"Contents").unwrap().clone();
    doc.get_dictionary_mut(pages[1]).unwrap().set("Contents", first);
    let mut pdf = Vec::new();
    doc.save_to(&mut pdf).unwrap();

    let mut e = Engine::open(pdf, None).unwrap();
    let m = e.find(0, "header", true).unwrap()[0].clone();
    e.replace_range(0, m.line, m.start, m.end, "footer").unwrap();
    let (out, _) = e.save().unwrap();
    let mut e = Engine::open(out, None).unwrap();
    assert_eq!(texts(&e.page_text(0).unwrap()), ["Shared footer"]);
    assert_eq!(texts(&e.page_text(1).unwrap()), ["Shared header"]);
}

#[test]
fn missing_glyph_without_a_font_changes_nothing() {
    let pdf = build(&[&["BT /F1 12 Tf 72 700 Td (Price 10) Tj ET"]]);
    let mut e = Engine::open(pdf.clone(), None).unwrap();
    let m = e.find(0, "10", true).unwrap()[0].clone();
    match e.replace_range(0, m.line, m.start, m.end, "₹10") {
        Err(Error::MissingGlyphs { chars, request }) => {
            assert_eq!(chars, "₹");
            assert_eq!(request.families[..2], ["Helvetica".to_string(), "Liberation Sans".to_string()]);
        }
        other => panic!("expected MissingGlyphs, got {:?}", other.map(|r| r.shift)),
    }
    let (out, report) = e.save().unwrap();
    assert_eq!(out, pdf, "a refused edit leaves the file byte-identical");
    assert_eq!(report.objects_written, 0);
}

#[test]
fn unchanged_text_is_a_no_op() {
    let pdf = build(&[&["BT /F1 12 Tf 72 700 Td (Same) Tj ET"]]);
    let mut e = Engine::open(pdf.clone(), None).unwrap();
    let r = e.replace_line(0, 0, "Same").unwrap();
    assert!(r.changed.is_empty());
    assert_eq!(e.save().unwrap().0, pdf);
}

#[test]
fn several_edits_then_one_save() {
    let pdf = build(&[&["BT /F1 12 Tf 72 700 Td (one two three) Tj 0 -14 Td (four five six) Tj ET"]]);
    let mut e = Engine::open(pdf, None).unwrap();
    for (find, replace) in [("two", "2"), ("five", "FIVE"), ("one", "uno"), ("six", "")] {
        let m = e.find(0, find, true).unwrap()[0].clone();
        e.replace_range(0, m.line, m.start, m.end, replace).unwrap();
    }
    let (out, report) = e.save().unwrap();
    assert_eq!(report.objects_written, 1);
    assert_eq!(texts(&Engine::open(out, None).unwrap().page_text(0).unwrap()), ["uno 2 three", "four FIVE "]);
}

#[test]
fn scaled_and_rotated_text_matrix() {
    // Font size comes from the matrix (Tf 1), and the line runs uphill at 30 degrees.
    let pdf = build(&[&["BT /F1 1 Tf 10.3923 6 -6 10.3923 100 100 Tm (slanted text here) Tj ET BT /F1 12 Tf 72 700 Td (flat) Tj ET"]]);
    let (before, after, _) = edit(&pdf, "text", "words");
    assert_eq!(texts(&after).iter().filter(|t| *t == "slanted words here").count(), 1);
    let (b, a) = (line(&before, "slanted"), line(&after, "slanted"));
    assert_eq!(b.origin, a.origin);
    assert!((a.angle - 30.0).abs() < 0.01 && (a.size - 12.0).abs() < 0.01);
}

#[test]
fn chrome_justified_line_keeps_its_gaps() {
    // AC-11g on the real Chrome export: after "made" → "signed" the gap before the bold
    // "Provider" survives (the reference editor produces "theProvider").
    let pdf = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor/chrome-justified-mixed.pdf")).unwrap();
    let (before, after, _) = edit(&pdf, "made", "signed");
    let gap = |p: &PageText| {
        let l = line(p, "Provider");
        let i = l.words.iter().position(|w| w.text == "Provider").unwrap();
        l.words[i].bbox.x0 - l.words[i - 1].bbox.x1
    };
    assert!(line(&after, "Provider").text.contains("is signed between the Provider and the Client"));
    assert!(gap(&after) >= 0.5 * gap(&before), "gap {} vs {}", gap(&after), gap(&before));
    assert!((gap(&after) - gap(&before)).abs() < 0.05);
    // Every other line is exactly where it was.
    for l in &before.lines {
        if !l.text.contains("made") {
            let twin = after.lines.iter().find(|x| x.text == l.text).unwrap();
            assert_eq!(l.bbox, twin.bbox, "{:?} moved", l.text);
        }
    }
    // The ₹ sign comes from a Type 3 font and stays its own run in a serif line.
    let rupee = line(&after, "₹");
    assert_eq!(rupee.runs.len(), 3);
    assert!(after.fonts[rupee.runs[0].font].name.starts_with("LiberationSerif"));
    assert!(after.fonts[rupee.runs[2].font].name.starts_with("LiberationSerif"));
}

#[test]
fn shared_form_xobject_is_copied_for_one_page() {
    let pdf = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor/shared-xobject.pdf")).unwrap();
    let mut e = Engine::open(pdf, None).unwrap();
    let m = e.find(1, "Northwind", true).unwrap()[0].clone();
    e.replace_range(1, m.line, m.start, m.end, "Southwind").unwrap();
    let (out, _) = e.save().unwrap();
    let mut e = Engine::open(out, None).unwrap();
    assert_eq!(texts(&e.page_text(0).unwrap())[0], "Northwind Traders");
    assert_eq!(texts(&e.page_text(1).unwrap())[0], "Southwind Traders");
    assert_eq!(texts(&e.page_text(2).unwrap())[0], "Northwind Traders");
}

#[test]
fn subset_font_is_reused_when_it_has_the_glyphs() {
    // AC-10: "thirty" → "tithe" uses only letters the embedded subset already has.
    let pdf = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor/libreoffice-memo.pdf")).unwrap();
    let mut e = Engine::open(pdf, None).unwrap();
    let m = e.find(0, "thirty", true).unwrap()[0].clone();
    let r = e.replace_range(0, m.line, m.start, m.end, "tithe").unwrap();
    assert!(r.substitutions.is_empty());
    let l = line(&r.page, "tithe");
    assert_eq!(l.runs.len(), 1, "the edited line is still one run in one font");
    let (_, report) = e.save().unwrap();
    assert_eq!(report.objects_written, 1, "only the content stream is rewritten");
    // "Monday" needs an M the subset lacks: refused until a font is registered.
    let m = e.find(0, "Friday", true).unwrap()[0].clone();
    assert!(matches!(e.replace_range(0, m.line, m.start, m.end, "Monday"), Err(Error::MissingGlyphs { chars, .. }) if chars == "M"));
}
