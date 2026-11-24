//! Edits next to marked content (ActualText spans, tagged-PDF MCIDs, forms) and the time bounds
//! of reading deep marked content and hostile cmaps. Found in the review of the complex-script
//! work; each test pins one fix.

use berry_engine::{Engine, Error};
use lopdf::{dictionary, Dictionary, Document, Object, Stream};
use std::time::{Duration, Instant};

/// One page in Helvetica (`/F1`), with optional extra page resources.
fn build(content: &str, extra: impl FnOnce(&mut Document, &mut Dictionary)) -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let f1 = doc.add_object(
        dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding" },
    );
    let mut res = dictionary! { "Font" => dictionary! { "F1" => f1 } };
    extra(&mut doc, &mut res);
    let c = doc.add_object(Stream::new(dictionary! {}, content.as_bytes().to_vec()));
    let page = doc.add_object(dictionary! { "Type" => "Page", "Parent" => pages_id, "Contents" => c,
    "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()], "Resources" => res });
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

fn texts(e: &mut Engine) -> Vec<String> {
    e.page_text(0).unwrap().lines.into_iter().map(|l| l.text).collect()
}

/// Replaces the first match of `find` with `rep` (or the range `start..end` inside the match
/// when given), and returns the lines after the edit, after a save and reopen, and the saved
/// page content.
fn edit(pdf: Vec<u8>, find: &str, range: Option<(usize, usize)>, rep: &str) -> Result<(Vec<String>, Vec<String>, String), Error> {
    let mut e = Engine::open(pdf, None).unwrap();
    edit_engine(&mut e, find, range, rep)
}

fn edit_engine(
    e: &mut Engine,
    find: &str,
    range: Option<(usize, usize)>,
    rep: &str,
) -> Result<(Vec<String>, Vec<String>, String), Error> {
    let m = e.find(0, find, true).unwrap().into_iter().next().expect("text on the page");
    let (a, b) = range.map_or((m.start, m.end), |(a, b)| (m.start + a, m.start + b));
    let r = e.replace_range(0, m.line, a, b, rep)?;
    let after: Vec<String> = r.page.lines.into_iter().map(|l| l.text).collect();
    let (out, _) = e.save().unwrap();
    let mut e2 = Engine::open(out.clone(), None).unwrap();
    let reopened = texts(&mut e2);
    let doc = Document::load_mem(&out).unwrap();
    let content = String::from_utf8_lossy(&doc.get_page_content(doc.get_pages()[&1])).to_string();
    Ok((after, reopened, content))
}

const LIGATURE: &str = "BT /F1 12 Tf 72 700 Td (o) Tj /Span <</ActualText (ffi)>> BDC (X) Tj EMC (ce here) Tj ET";

#[test]
fn latin_edit_of_an_actualtext_span_removes_the_span() {
    let (after, reopened, content) = edit(build(LIGATURE, |_, _| {}), "ffi", None, "rif").unwrap();
    assert_eq!(after, ["orifce here"]);
    assert_eq!(reopened, ["orifce here"]);
    assert!(!content.contains("ActualText"), "{content}");
}

#[test]
fn latin_edit_inside_a_span_rewrites_the_whole_span() {
    // Only the first "f" is replaced: the span's other characters are drawn as themselves.
    let (after, reopened, content) = edit(build(LIGATURE, |_, _| {}), "ffi", Some((0, 1)), "x").unwrap();
    assert_eq!(after, ["oxfice here"]);
    assert_eq!(reopened, ["oxfice here"]);
    assert!(!content.contains("ActualText"), "{content}");
}

#[test]
fn latin_insert_at_the_end_of_a_span_is_not_swallowed_by_it() {
    let (after, reopened, _) = edit(build(LIGATURE, |_, _| {}), "ffi", Some((3, 3)), "Z").unwrap();
    assert_eq!(after, ["offiZce here"]);
    assert_eq!(reopened, ["offiZce here"]);
}

#[test]
fn nested_actualtext_spans_go_together() {
    let pdf = build(
        "BT /F1 12 Tf 72 700 Td (o) Tj /Span <</ActualText (ffi)>> BDC /Span <</ActualText (q)>> BDC (X) Tj EMC EMC (ce here) Tj ET",
        |_, _| {},
    );
    let (after, reopened, content) = edit(pdf, "ffi", None, "rif").unwrap();
    assert_eq!(after, ["orifce here"]);
    assert_eq!(reopened, ["orifce here"]);
    assert!(!content.contains("ActualText"), "{content}");
    assert_eq!(content.matches("BDC").count(), content.matches("EMC").count(), "{content}");
}

#[test]
fn a_span_keeps_its_mcid_when_its_actualtext_goes() {
    let pdf = build(
        "/P <</MCID 0>> BDC BT /F1 12 Tf 72 700 Td (Hello ) Tj /Span <</MCID 1 /ActualText (q)>> BDC (X) Tj EMC ( world) Tj ET EMC",
        |_, _| {},
    );
    let (after, reopened, content) = edit(pdf, "q", None, "abc").unwrap();
    assert_eq!(after, ["Hello abc world"]);
    assert_eq!(reopened, ["Hello abc world"]);
    assert!(content.contains("/Span <</MCID 1>> BDC"), "{content}");
    assert!(!content.contains("ActualText"), "{content}");
    assert_eq!(content.matches("BDC").count(), content.matches("EMC").count(), "{content}");
}

#[test]
fn a_named_span_with_an_mcid_is_left_alone() {
    let pdf = build("BT /F1 12 Tf 72 700 Td (Hello ) Tj /Span /MC0 BDC (X) Tj EMC ( world) Tj ET", |doc, res| {
        let props = doc.add_object(dictionary! { "MCID" => 1, "ActualText" => Object::string_literal("q") });
        res.set("Properties", dictionary! { "MC0" => props });
    });
    let mut e = Engine::open(pdf, None).unwrap();
    assert_eq!(texts(&mut e), ["Hello q world"]);
    let r = edit_engine(&mut e, "q", None, "abc");
    assert!(matches!(r, Err(Error::Unsupported { ref reason }) if reason == "actual-text-span"), "{r:?}");
    assert_eq!(texts(&mut e), ["Hello q world"]);
}

#[test]
fn deep_marked_content_reads_in_linear_time() {
    let n = 100_000;
    let mut s = "/A BMC ".repeat(n);
    s.push_str("BT /F1 1 Tf 72 700 Td (");
    s.push_str(&"a".repeat(n));
    s.push_str(") Tj ET");
    let mut e = Engine::open(build(&s, |_, _| {}), None).unwrap();
    let t = Instant::now();
    let _ = e.page_text(0);
    // Scanning the open marked content for every glyph took minutes here.
    assert!(t.elapsed() < Duration::from_secs(10), "{:?}", t.elapsed());
}

#[test]
fn a_hostile_cmap_does_not_slow_bracket_mirroring() {
    let font = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/data/hostile-cmap.ttf")).unwrap();
    let pdf = build("BT /F2 12 Tf 72 700 Td <0002000300010002> Tj ET", |doc, res| {
        let ff = doc.add_object(Stream::new(dictionary! {}, font));
        let cmap = "/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /X def 1 begincodespacerange <0000> <FFFF> endcodespacerange 3 beginbfchar <0001> <0028> <0002> <0627> <0003> <0628> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end";
        let tu = doc.add_object(Stream::new(dictionary! {}, cmap.as_bytes().to_vec()));
        let desc = doc.add_object(dictionary! { "Type" => "FontDescriptor", "FontName" => "Hostile", "Flags" => 4,
        "FontBBox" => vec![0.into(), 0.into(), 500.into(), 700.into()], "ItalicAngle" => 0, "Ascent" => 800,
        "Descent" => -200, "CapHeight" => 700, "StemV" => 80, "FontFile2" => ff });
        let cid = doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "CIDFontType2", "BaseFont" => "Hostile",
            "CIDSystemInfo" => dictionary! { "Registry" => Object::string_literal("Adobe"), "Ordering" => Object::string_literal("Identity"), "Supplement" => 0 },
            "FontDescriptor" => desc, "DW" => 500, "CIDToGIDMap" => "Identity" });
        let f2 = doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "Type0", "BaseFont" => "Hostile",
        "Encoding" => "Identity-H", "DescendantFonts" => vec![cid.into()], "ToUnicode" => tu });
        res.get_mut(b"Font").unwrap().as_dict_mut().unwrap().set("F2", f2);
    });
    let mut e = Engine::open(pdf, None).unwrap();
    let t = Instant::now();
    let p = e.page_text(0).unwrap();
    assert!(t.elapsed() < Duration::from_secs(2), "{:?}", t.elapsed());
    assert_eq!(p.lines.len(), 1);
    assert_eq!(p.lines[0].direction, "rtl");
}

#[test]
fn property_keywords_survive_a_rewrite() {
    let pdf = build(
        "BT /F1 12 Tf 72 700 Td (o) Tj /Span <</MCID 4 /Foo true /Arr [1 null 2] /ActualText (ffi)>> BDC (X) Tj EMC (ce) Tj ET",
        |_, _| {},
    );
    // The writer cannot reproduce true/null, so the span stays and the edit is refused.
    let r = edit(pdf, "ffi", None, "rif");
    assert!(matches!(r, Err(Error::Unsupported { ref reason }) if reason == "actual-text-span"), "{r:?}");
}

#[test]
fn empty_actualtext_reads_as_nothing() {
    let pdf = build("BT /F1 12 Tf 72 700 Td (exam) Tj /Span <</ActualText <FEFF>>> BDC (-) Tj EMC ( more) Tj ET", |_, _| {});
    let mut e = Engine::open(pdf.clone(), None).unwrap();
    assert_eq!(texts(&mut e), ["exam more"]);
    let (after, reopened, _) = edit(pdf, "more", None, "less").unwrap();
    assert_eq!(after, ["exam less"]);
    assert_eq!(reopened, ["exam less"]);
}

#[test]
fn a_span_inside_a_form_inside_a_span_is_caught_by_the_read_back() {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let helv = doc.add_object(
        dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding" },
    );
    let form = doc.add_object(Stream::new(
        dictionary! { "Type" => "XObject", "Subtype" => "Form", "BBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary! { "Font" => dictionary! { "FH" => helv } } },
        b"BT /FH 12 Tf 72 700 Td /Span <</ActualText (zz)>> BDC (X) Tj EMC ET".to_vec(),
    ));
    let c = doc.add_object(Stream::new(dictionary! {}, b"/Span <</ActualText (ffi)>> BDC /Fm Do EMC".to_vec()));
    let page = doc.add_object(dictionary! { "Type" => "Page", "Parent" => pages_id, "Contents" => c,
    "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
    "Resources" => dictionary! { "XObject" => dictionary! { "Fm" => form } } });
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! { "Type" => "Pages", "Count" => 1, "Kids" => vec![Object::Reference(page)] }),
    );
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    let mut pdf = Vec::new();
    doc.save_to(&mut pdf).unwrap();
    let mut e = Engine::open(pdf, None).unwrap();
    assert_eq!(texts(&mut e), ["ffi"]);
    // The inner span would keep the new text reading "zz": refused, never silently wrong.
    let r = edit_engine(&mut e, "ffi", None, "abc");
    assert!(r.is_err(), "{r:?}");
    assert_eq!(texts(&mut e), ["ffi"]);
}

#[test]
fn one_huge_glyph_does_not_slow_mark_grouping() {
    let mut s = String::from("BT /F1 1000000 Tf 10 10 Td (A) Tj ET BT /F1 10 Tf ");
    for r in 0..200 {
        s.push_str(&format!("1 0 0 1 20 {} Tm (", 20 + (r % 700)));
        s.push_str(&"a\\001".repeat(100));
        s.push_str(") Tj ");
    }
    s.push_str("ET");
    let mut e = Engine::open(build(&s, |_, _| {}), None).unwrap();
    let t = Instant::now();
    let _ = e.page_text(0);
    // 20,000 marks scanned the whole page each: about 6 s in release builds.
    assert!(t.elapsed() < Duration::from_secs(5), "{:?}", t.elapsed());
}

#[cfg(feature = "shaping")]
mod shaping {
    use super::*;

    const DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor");

    fn read(name: &str) -> Vec<u8> {
        std::fs::read(format!("{DIR}/{name}")).unwrap()
    }

    #[test]
    fn a_new_font_in_a_form_goes_into_the_forms_resources() {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let helv = doc.add_object(
            dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding" },
        );
        let times = doc.add_object(
            dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Times-Roman", "Encoding" => "WinAnsiEncoding" },
        );
        let form_content = "BT /FH 12 Tf 72 700 Td (Hello ) Tj /FT 12 Tf /Span <</ActualText <FEFF0645>>> BDC (\\225) Tj EMC ET";
        let form = doc.add_object(Stream::new(
            dictionary! { "Type" => "XObject", "Subtype" => "Form", "BBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            "Resources" => dictionary! { "Font" => dictionary! { "FH" => helv, "FT" => times } } },
            form_content.as_bytes().to_vec(),
        ));
        let c = doc.add_object(Stream::new(dictionary! {}, b"BT /F2 12 Tf 72 750 Td (Title) Tj ET /Fm Do".to_vec()));
        let page = doc.add_object(dictionary! { "Type" => "Page", "Parent" => pages_id, "Contents" => c,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary! { "Font" => dictionary! { "F2" => times }, "XObject" => dictionary! { "Fm" => form } } });
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! { "Type" => "Pages", "Count" => 1, "Kids" => vec![Object::Reference(page)] }),
        );
        let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        doc.trailer.set("Root", catalog);
        let mut pdf = Vec::new();
        doc.save_to(&mut pdf).unwrap();

        let mut e = Engine::open(pdf, None).unwrap();
        e.add_font("Noto Naskh Arabic", false, false, read("fonts/NotoNaskhArabic-Regular.ttf"));
        let (after, _, _) = edit_engine(&mut e, "\u{645}", None, "سلام").unwrap();
        assert_eq!(after, ["Title", "Hello سلام"]);
        let (out, _) = e.save().unwrap();
        let doc = Document::load_mem(&out).unwrap();
        // The page's own fonts are unchanged; the form's resources name every font it uses.
        let page = doc.get_object(doc.get_pages()[&1]).unwrap().as_dict().unwrap();
        let page_fonts = page.get(b"Resources").unwrap().as_dict().unwrap().get(b"Font").unwrap().as_dict().unwrap();
        assert_eq!(page_fonts.len(), 1);
        let form = doc.get_object(form).unwrap().as_stream().unwrap();
        let mut form_res = form.dict.get(b"Resources").unwrap();
        if let Ok(id) = form_res.as_reference() {
            form_res = doc.get_object(id).unwrap();
        }
        let form_fonts = form_res.as_dict().unwrap().get(b"Font").unwrap().as_dict().unwrap();
        let mut f = form.clone();
        let _ = f.decompress();
        let body = String::from_utf8_lossy(&f.content).to_string();
        for name in body.split_whitespace().collect::<Vec<_>>().windows(3).filter(|w| w[2] == "Tf").map(|w| &w[0][1..]) {
            assert!(form_fonts.has(name.as_bytes()), "{name} missing from the form's fonts: {body}");
        }
    }

    #[test]
    fn deleting_a_whole_complex_line() {
        let pdf = build("BT /F1 12 Tf 72 700 Td /Span <</ActualText <FEFF0645>>> BDC (X) Tj EMC ET", |_, _| {});
        let (after, reopened, _) = edit(pdf, "\u{645}", None, "").unwrap();
        assert!(after.is_empty(), "{after:?}");
        assert!(reopened.is_empty(), "{reopened:?}");
    }

    #[test]
    fn arabic_edits_after_a_word_with_harakat() {
        for f in ["scripts-chrome.pdf", "scripts-libreoffice.pdf", "scripts-plain.pdf"] {
            let mut e = Engine::open(read(f), None).unwrap();
            e.add_font("Noto Naskh Arabic", false, false, read("fonts/NotoNaskhArabic-Regular.ttf"));
            // A word with a kasra, then the same letters bare: both must read back as typed.
            let (after, _, _) = edit_engine(&mut e, "هذا", None, "نِبت").unwrap_or_else(|x| panic!("{f}: {x:?}"));
            assert!(after.iter().any(|l| l.contains("نِبت")), "{f}: {after:?}");
            let (after, reopened, _) = edit_engine(&mut e, "مرحبا", None, "نبت").unwrap_or_else(|x| panic!("{f}: {x:?}"));
            let line = after.iter().find(|l| l.contains("نِبت")).unwrap_or_else(|| panic!("{f}: {after:?}"));
            assert!(line.starts_with("نبت "), "{f}: {line:?}");
            assert!(reopened.contains(line), "{f}: {reopened:?}");
        }
    }

    #[test]
    fn arabic_words_with_stacked_marks() {
        for f in ["scripts-chrome.pdf", "scripts-libreoffice.pdf"] {
            for w in ["لِلّٰه", "الرَّحْمٰنِ", "مُحَمَّدٌ", "رَبِّ"] {
                let mut e = Engine::open(read(f), None).unwrap();
                e.add_font("Noto Naskh Arabic", false, false, read("fonts/NotoNaskhArabic-Regular.ttf"));
                let (after, _, _) = edit_engine(&mut e, "هذا", None, w).unwrap_or_else(|x| panic!("{f} {w}: {x:?}"));
                assert!(after.iter().any(|l| l.contains(w)), "{f} {w}: {after:?}");
            }
        }
    }
}
