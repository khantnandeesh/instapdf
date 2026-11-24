//! New glyphs a page font draws but its ToUnicode maps wrong or not at all (digits typed into an
//! Arabic line whose subset never used them). Readers that go by the glyphs (PDFium, pdf.js,
//! copy and paste) must read the edit as typed with no ActualText: the engine draws such glyphs
//! through a sibling font (same program, its own ToUnicode for just those glyphs) at the line's
//! logical end, and never changes the font's own ToUnicode, which other text may share. pdfium
//! and pdf.js read-back of the saved files is checked in apps/web (mixed-direction.test.ts).
#![cfg(feature = "shaping")]

use berry_engine::{Engine, Error, PageText};
use lopdf::{Document, Object, ObjectId};

const DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor");

fn read(name: &str) -> Vec<u8> {
    std::fs::read(format!("{DIR}/{name}")).unwrap()
}

fn texts(p: &PageText) -> Vec<String> {
    p.lines.iter().map(|l| l.text.clone()).collect()
}

fn line_id(p: &PageText, starts: &str) -> usize {
    p.lines.iter().position(|l| l.text.starts_with(starts)).unwrap_or_else(|| panic!("no line {starts:?} in {:?}", texts(p)))
}

/// The Arabic font of scripts-plain.pdf: its dictionary id and its ToUnicode stream id.
fn arabic_font(doc: &Document) -> (ObjectId, ObjectId) {
    let page = *doc.get_pages().get(&1).unwrap();
    let fonts = doc.get_page_fonts(page).unwrap();
    let (_, font) = fonts.iter().find(|(name, _)| name.as_slice() == b"Farab").expect("Farab");
    let font_id = doc
        .get_page_resources(page)
        .unwrap()
        .0
        .and_then(|r| r.get(b"Font").ok()?.as_dict().ok()?.get(b"Farab").ok()?.as_reference().ok())
        .expect("Farab is a reference");
    let tu = font.get(b"ToUnicode").unwrap().as_reference().unwrap();
    (font_id, tu)
}

fn stream_text(doc: &Document, id: ObjectId) -> String {
    let s = doc.get_object(id).unwrap().as_stream().unwrap();
    String::from_utf8(s.get_plain_content().unwrap()).unwrap()
}

/// scripts-plain.pdf with its Arabic ToUnicode's `from` entry replaced by `to` (empty: removed).
fn plain_with_to_unicode(from: &str, to: &str) -> Vec<u8> {
    let mut doc = Document::load_mem(&read("scripts-plain.pdf")).unwrap();
    let (_, tu) = arabic_font(&doc);
    let text = stream_text(&doc, tu);
    assert!(text.contains(from), "{text}");
    let mut text = text.replace(from, to);
    if to.is_empty() {
        // One entry fewer in its bfchar block.
        let at = text.find(" beginbfchar").unwrap();
        let start = text[..at].rfind('\n').map_or(0, |i| i + 1);
        let n: usize = text[start..at].trim().parse().unwrap();
        text.replace_range(start..at, &(n - 1).to_string());
    }
    doc.objects.insert(tu, Object::Stream(lopdf::Stream::new(lopdf::Dictionary::new(), text.into_bytes())));
    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
}

fn engine(bytes: Vec<u8>) -> Engine {
    let mut e = Engine::open(bytes, None).unwrap();
    assert!(e.add_font("Noto Naskh Arabic", false, false, read("fonts/NotoNaskhArabic-Regular.ttf")));
    e
}

/// Appends `tail` to the line starting with `starts`, saves, and returns the saved document.
fn append(bytes: Vec<u8>, starts: &str, tail: &str) -> Document {
    let mut e = engine(bytes);
    let p = e.page_text(0).unwrap();
    let id = line_id(&p, starts);
    let want = format!("{}{tail}", p.lines[id].text);
    let r = e.replace_line(0, id, &want).unwrap_or_else(|err| panic!("{tail:?}: {err:?}"));
    assert!(texts(&r.page).contains(&want), "{:?}", texts(&r.page));
    let out = e.save().unwrap().0;
    assert!(texts(&engine(out.clone()).page_text(0).unwrap()).contains(&want));
    assert!(!out.windows(11).any(|w| w == b"/ActualText"), "{tail:?} leans on ActualText");
    Document::load_mem(&out).unwrap()
}

/// The ToUnicode streams of fonts on page 1 other than `skip`, by font id.
fn other_to_unicode(doc: &Document, skip: ObjectId) -> Vec<(ObjectId, String)> {
    let page = *doc.get_pages().get(&1).unwrap();
    let (res, _) = doc.get_page_resources(page).unwrap();
    let fonts = res.unwrap().get(b"Font").unwrap().as_dict().unwrap();
    fonts
        .iter()
        .filter_map(|(_, f)| f.as_reference().ok())
        .filter(|id| *id != skip)
        .filter_map(|id| {
            let tu = doc.get_dictionary(id).ok()?.get(b"ToUnicode").ok()?.as_reference().ok()?;
            Some((id, stream_text(doc, tu)))
        })
        .collect()
}

/// "4" is in the subset but neither its ToUnicode nor its `/W` has it: the digits are drawn
/// through a sibling whose ToUnicode maps only the glyphs it draws, with the width of "4"
/// declared, and the original font is left as it was.
#[test]
fn unmapped_digit_at_line_end_uses_a_sibling() {
    let before = Document::load_mem(&read("scripts-plain.pdf")).unwrap();
    let (font, tu) = arabic_font(&before);
    let doc = append(read("scripts-plain.pdf"), "مرحبا", " 2024");
    assert_eq!(stream_text(&doc, tu), stream_text(&before, tu), "the font's own ToUnicode changed");
    let siblings = other_to_unicode(&doc, font);
    let sib: Vec<&(ObjectId, String)> = siblings.iter().filter(|(_, t)| t.contains("<0076>")).collect();
    assert_eq!(sib.len(), 1, "{siblings:?}");
    let (sib_id, sib_tu) = sib[0];
    let entries: Vec<&str> =
        sib_tu.lines().filter(|l| l.starts_with('<') && l.contains("> <") && *l != "<0000> <FFFF>").collect();
    assert_eq!(entries, ["<0072> <0030>", "<0074> <0032>", "<0076> <0034>"], "{sib_tu}");
    // Same program, a CIDFont copy that declares the width of "4".
    let fd = |id: ObjectId| {
        let d = doc.get_dictionary(id).unwrap();
        let cid = d.get(b"DescendantFonts").unwrap().as_array().unwrap()[0].as_reference().unwrap();
        doc.get_dictionary(cid).unwrap().clone()
    };
    let (orig_cid, sib_cid) = (fd(font), fd(*sib_id));
    assert_eq!(orig_cid.get(b"FontDescriptor").unwrap(), sib_cid.get(b"FontDescriptor").unwrap());
    let w = sib_cid.get(b"W").unwrap().as_array().unwrap();
    assert_eq!(w.len(), orig_cid.get(b"W").unwrap().as_array().unwrap().len() + 2);
    assert_eq!(w[w.len() - 2].as_i64().unwrap(), 0x76);
}

/// A code the ToUnicode lacks but `/W` declares also goes through a sibling: the font's own
/// ToUnicode is left byte for byte as it was, since another page or form may draw with it.
#[test]
fn unmapped_code_with_a_width_uses_a_sibling() {
    let bytes = plain_with_to_unicode("<0072> <0030>\n", "");
    let before = Document::load_mem(&bytes).unwrap();
    let (font, tu) = arabic_font(&before);
    let doc = append(bytes, "مرحبا", " 20");
    assert_eq!(stream_text(&doc, tu), stream_text(&before, tu), "the font's own ToUnicode changed");
    let siblings = other_to_unicode(&doc, font);
    assert!(siblings.iter().any(|(_, t)| t.contains("<0072> <0030>")), "{siblings:?}");
}

/// A code the ToUnicode maps to other text (an Arabic-Indic zero for the Latin zero glyph) keeps
/// that entry: the new digits go through a sibling.
#[test]
fn code_mapped_to_other_text_keeps_its_entry() {
    let bytes = plain_with_to_unicode("<0072> <0030>", "<0072> <0660>");
    let doc = append(bytes, "مرحبا", " 20");
    let (font, tu) = arabic_font(&doc);
    assert!(stream_text(&doc, tu).contains("<0072> <0660>"));
    let siblings = other_to_unicode(&doc, font);
    assert!(siblings.iter().any(|(_, t)| t.contains("<0072> <0030>")), "{siblings:?}");
}

/// In the middle of a right-to-left line a sibling's glyphs are a text item of their own, which
/// pdf.js reads out of order, so the edit is refused and the page is left as it was.
#[test]
fn sibling_inside_a_right_to_left_line_is_refused() {
    let mut e = engine(read("scripts-plain.pdf"));
    let p = e.page_text(0).unwrap();
    let id = line_id(&p, "المبلغ");
    let want = p.lines[id].text.replace("2500", "3750");
    let err = e.replace_line(0, id, &want).unwrap_err();
    assert!(matches!(err, Error::Verify { reason: "text-mismatch", .. }), "{err:?}");
    assert_eq!(texts(&e.page_text(0).unwrap()), texts(&p));
}

/// The siblings among page 1's fonts: fonts other than the Arabic one with the same descriptor.
fn siblings_of(doc: &Document) -> Vec<(ObjectId, String)> {
    let (font, _) = arabic_font(doc);
    let desc = |id: ObjectId| {
        let d = doc.get_dictionary(id).ok()?;
        let cid = d.get(b"DescendantFonts").ok()?.as_array().ok()?.first()?.as_reference().ok()?;
        doc.get_dictionary(cid).ok()?.get(b"FontDescriptor").ok().cloned()
    };
    let want = desc(font);
    other_to_unicode(doc, font).into_iter().filter(|(id, _)| desc(*id) == want).collect()
}

fn entries(cmap: &str) -> Vec<&str> {
    cmap.lines().filter(|l| l.starts_with('<') && l.contains("> <") && *l != "<0000> <FFFF>").collect()
}

/// Edits in a row on one engine: each must be kept and read as typed.
fn edits(bytes: Vec<u8>, steps: &[(&str, &str)]) -> (Engine, Vec<u8>) {
    let mut e = engine(bytes);
    for (starts, tail) in steps {
        let p = e.page_text(0).unwrap();
        let id = line_id(&p, starts);
        let want = format!("{}{tail}", p.lines[id].text);
        let r = e.replace_line(0, id, &want).unwrap_or_else(|err| panic!("{tail:?}: {err:?}"));
        assert!(texts(&r.page).contains(&want), "{:?}", texts(&r.page));
    }
    let out = e.save().unwrap().0;
    assert!(!out.windows(11).any(|w| w == b"/ActualText"));
    (e, out)
}

/// A second number typed at the end of the same line reads as typed (not "7 2024": numbers in
/// a right-to-left line are ordered right to left), and draws through the same sibling, whose
/// ToUnicode gains the new digit.
#[test]
fn second_number_at_line_end_reuses_the_sibling() {
    // "3": a digit the subset draws but neither maps nor gives a width (the sibling's CIDFont
    // gains it); "5": one it maps, drawn through the sibling with the rest of its word.
    for (second, line, added) in [
        (" 3", "مرحبا بالعالم، هذا نص تجريبي. 2024 3", Some("> <0033>")),
        ("5", "مرحبا بالعالم، هذا نص تجريبي. 20245", Some("> <0035>")),
        (" 2024", "مرحبا بالعالم، هذا نص تجريبي. 2024 2024", None),
    ] {
        let (_, out) = edits(read("scripts-plain.pdf"), &[("مرحبا", " 2024"), ("مرحبا", second)]);
        let doc = Document::load_mem(&out).unwrap();
        let sib = siblings_of(&doc);
        assert_eq!(sib.len(), 1, "{second:?}: {sib:?}");
        let got = entries(&sib[0].1);
        let first = ["<0072> <0030>", "<0074> <0032>", "<0076> <0034>"];
        assert!(first.iter().all(|e| got.contains(e)), "{second:?}: {got:?}");
        let new: Vec<&&str> = got.iter().filter(|e| !first.contains(e)).collect();
        match added {
            Some(text) => {
                assert!(new.len() == 1 && new[0].ends_with(text), "{second:?}: {got:?}");
                // The sibling's CIDFont declares the width of each digit it draws.
                let d = doc.get_dictionary(sib[0].0).unwrap();
                let cid = d.get(b"DescendantFonts").unwrap().as_array().unwrap()[0].as_reference().unwrap();
                let w = doc.get_dictionary(cid).unwrap().get(b"W").unwrap().as_array().unwrap().clone();
                let code = i64::from_str_radix(&new[0][1..5], 16).unwrap();
                let declared = |c: i64| w.windows(2).any(|p| p[0].as_i64().ok() == Some(c) && p[1].as_array().is_ok());
                assert!(declared(0x76) && (second != " 3" || declared(code)), "{second:?}: {w:?}");
            }
            None => assert!(new.is_empty() && got.len() == 3, "{second:?}: {got:?}"),
        }
        assert!(texts(&engine(out).page_text(0).unwrap()).contains(&line.to_string()));
    }
}

/// Digits typed on two lines go through one sibling, and a number after the "77." that ends a
/// line reads after it.
#[test]
fn digits_on_two_lines_share_one_sibling() {
    let (_, out) = edits(read("scripts-plain.pdf"), &[("مرحبا", " 2024"), ("المبلغ", " 4")]);
    let doc = Document::load_mem(&out).unwrap();
    assert_eq!(siblings_of(&doc).len(), 1);
    let p = engine(out).page_text(0).unwrap();
    assert!(texts(&p).contains(&"المبلغ الإجمالي 2500 ريال للفاتورة رقم 77. 4".to_string()), "{:?}", texts(&p));
}

/// In a file saved earlier, a sibling that already reads the new digits is used as it is; one
/// that lacks a digit is left as it was (it was not made in this session, so other text may
/// draw with it) and a new sibling is made.
#[test]
fn a_saved_sibling_is_reused_only_as_it_is() {
    let (_, saved) = edits(read("scripts-plain.pdf"), &[("مرحبا", " 2024")]);
    let before = siblings_of(&Document::load_mem(&saved).unwrap());
    let (_, out) = edits(saved.clone(), &[("المبلغ", " 2042")]);
    assert_eq!(siblings_of(&Document::load_mem(&out).unwrap()), before);

    let (_, out) = edits(saved, &[("المبلغ", " 3")]);
    let after = siblings_of(&Document::load_mem(&out).unwrap());
    assert_eq!(after.len(), 2, "{after:?}");
    assert!(after.contains(&before[0]), "the saved sibling changed");
}

/// A refused edit leaves the sibling it would have extended as it was.
#[test]
fn a_refused_edit_leaves_the_sibling_as_it_was() {
    let mut e = engine(read("scripts-plain.pdf"));
    let p = e.page_text(0).unwrap();
    let id = line_id(&p, "مرحبا");
    let want = format!("{} 2024", p.lines[id].text);
    e.replace_line(0, id, &want).unwrap();
    let saved = Document::load_mem(&e.save().unwrap().0).unwrap();
    let p = e.page_text(0).unwrap();
    let id = line_id(&p, "المبلغ");
    let err = e.replace_line(0, id, &p.lines[id].text.replace("2500", "3750")).unwrap_err();
    assert!(matches!(err, Error::Verify { reason: "text-mismatch", .. }), "{err:?}");
    assert_eq!(texts(&e.page_text(0).unwrap()), texts(&p));
    let out = Document::load_mem(&e.save().unwrap().0).unwrap();
    assert_eq!(siblings_of(&out), siblings_of(&saved));
}
