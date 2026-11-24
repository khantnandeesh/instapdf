//! Regression tests from the first code review of the engine.

use berry_engine::{Engine, Error, PageText};
use lopdf::{dictionary, Document, Object, Stream};

fn texts(p: &PageText) -> Vec<String> {
    p.lines.iter().map(|l| l.text.clone()).collect()
}

struct B {
    doc: Document,
    pages_id: lopdf::ObjectId,
    kids: Vec<Object>,
    pub f1: lopdf::ObjectId,
    pub f2: lopdf::ObjectId,
}
impl B {
    fn new() -> B {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let f1 = doc.add_object(
            dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding" },
        );
        let f2 = doc.add_object(
            dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Times-Bold", "Encoding" => "WinAnsiEncoding" },
        );
        B { doc, pages_id, kids: vec![], f1, f2 }
    }
    fn page(&mut self, content: &[u8], resources: Object) {
        let c = self.doc.add_object(Stream::new(dictionary! {}, content.to_vec()));
        let page = self.doc.add_object(dictionary! {
            "Type" => "Page", "Parent" => self.pages_id, "Contents" => c,
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()], "Resources" => resources,
        });
        self.kids.push(Object::Reference(page));
    }
    fn finish(mut self) -> Vec<u8> {
        let n = self.kids.len() as i64;
        self.doc.objects.insert(
            self.pages_id,
            Object::Dictionary(dictionary! { "Type" => "Pages", "Count" => n, "Kids" => self.kids.clone() }),
        );
        let catalog = self.doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => self.pages_id });
        self.doc.trailer.set("Root", catalog);
        let mut out = Vec::new();
        self.doc.save_to(&mut out).unwrap();
        out
    }
}

fn simple(content: &[u8]) -> Vec<u8> {
    let mut b = B::new();
    let res = dictionary! { "Font" => dictionary! { "F1" => b.f1, "F2" => b.f2 } };
    b.page(content, Object::Dictionary(res));
    b.finish()
}

#[test]
fn form_shared_through_shared_resources() {
    let mut b = B::new();
    let form = b.doc.add_object(Stream::new(
        dictionary! { "Type" => "XObject", "Subtype" => "Form", "BBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary!{ "Font" => dictionary!{ "F1" => b.f1 } } },
        b"BT /F1 12 Tf 72 700 Td (Northwind Traders) Tj ET".to_vec(),
    ));
    let res = b.doc.add_object(dictionary! { "Font" => dictionary! { "F1" => b.f1 }, "XObject" => dictionary!{ "Fm1" => form } });
    b.page(b"/Fm1 Do", Object::Reference(res));
    b.page(b"/Fm1 Do", Object::Reference(res));
    let pdf = b.finish();
    let mut e = Engine::open(pdf, None).unwrap();
    let m = e.find(0, "Northwind", true).unwrap()[0].clone();
    e.replace_range(0, m.line, m.start, m.end, "Southwind").unwrap();
    let (out, _) = e.save().unwrap();
    let mut e = Engine::open(out, None).unwrap();
    assert_eq!(texts(&e.page_text(0).unwrap())[0], "Southwind Traders");
    assert_eq!(texts(&e.page_text(1).unwrap())[0], "Northwind Traders", "page 2 must not change");
}

#[test]
fn form_shared_through_pattern_or_other_holder() {
    // Form referenced once in the document, but by a /Resources dict inherited from /Pages.
    let mut b = B::new();
    let form = b.doc.add_object(Stream::new(
        dictionary! { "Type" => "XObject", "Subtype" => "Form", "BBox" => vec![0.into(), 0.into(), 612.into(), 792.into()] },
        b"BT /F1 12 Tf 72 700 Td (Northwind Traders) Tj ET".to_vec(),
    ));
    let res = dictionary! { "Font" => dictionary! { "F1" => b.f1 }, "XObject" => dictionary!{ "Fm1" => form } };
    for _ in 0..2 {
        let c = b.doc.add_object(Stream::new(dictionary! {}, b"/Fm1 Do".to_vec()));
        let page = b.doc.add_object(dictionary! { "Type" => "Page", "Parent" => b.pages_id, "Contents" => c,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()] });
        b.kids.push(Object::Reference(page));
    }
    let n = b.kids.len() as i64;
    b.doc.objects.insert(
        b.pages_id,
        Object::Dictionary(dictionary! { "Type" => "Pages", "Count" => n, "Kids" => b.kids.clone(), "Resources" => res }),
    );
    let catalog = b.doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => b.pages_id });
    b.doc.trailer.set("Root", catalog);
    let mut pdf = Vec::new();
    b.doc.save_to(&mut pdf).unwrap();
    let mut e = Engine::open(pdf, None).unwrap();
    let m = e.find(0, "Northwind", true).unwrap()[0].clone();
    e.replace_range(0, m.line, m.start, m.end, "Southwind").unwrap();
    let (out, _) = e.save().unwrap();
    let mut e = Engine::open(out, None).unwrap();
    assert_eq!(texts(&e.page_text(1).unwrap())[0], "Northwind Traders", "page 2 must not change");
}

#[test]
fn replace_range_hits_the_requested_occurrence() {
    // "Note " in bold Times, then "Note this" in Helvetica. Delete the first (bold) "Note ".
    let pdf = simple(b"BT /F2 12 Tf 72 700 Td (Note ) Tj /F1 12 Tf (Note this) Tj ET");
    let mut e = Engine::open(pdf, None).unwrap();
    let before = e.page_text(0).unwrap();
    println!(
        "{:?}",
        before.lines[0].runs.iter().map(|r| (r.text.clone(), before.fonts[r.font].name.clone())).collect::<Vec<_>>()
    );
    let r = e.replace_range(0, 0, 0, 5, "").unwrap();
    let l = &r.page.lines[0];
    let runs: Vec<_> = l.runs.iter().map(|r2| (r2.text.clone(), r.page.fonts[r2.font].name.clone())).collect();
    println!("{:?} origin {:?} -> {:?}", runs, before.lines[0].origin, l.origin);
    assert_eq!(runs, vec![("Note this".to_string(), "Helvetica".to_string())]);
}

#[test]
fn deep_array_nesting() {
    let mut c = vec![b'['; 300_000];
    c.extend_from_slice(b" BT /F1 12 Tf 72 700 Td (x) Tj ET");
    let pdf = simple(&c);
    let mut e = Engine::open(pdf, None).unwrap();
    // Unclosed arrays swallow the rest of the stream, as in viewers; what matters is no crash.
    assert!(e.page_text(0).is_ok());
}

#[test]
fn form_bomb() {
    // depth levels, each form invokes the next one `fan` times.
    let (depth, fan) = (6usize, 12usize);
    let mut b = B::new();
    let font = dictionary! { "Font" => dictionary! { "F1" => b.f1 } };
    let mut prev = b.doc.add_object(Stream::new(
        dictionary! { "Type" => "XObject", "Subtype" => "Form", "BBox" => vec![0.into(), 0.into(), 612.into(), 792.into()], "Resources" => font.clone() },
        b"BT /F1 12 Tf 72 700 Td (x) Tj ET".to_vec(),
    ));
    for _ in 0..depth {
        let body = "/N Do ".repeat(fan);
        prev = b.doc.add_object(Stream::new(
            dictionary! { "Type" => "XObject", "Subtype" => "Form", "BBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            "Resources" => dictionary!{ "XObject" => dictionary!{ "N" => prev } } },
            body.into_bytes(),
        ));
    }
    b.page(b"/N Do", Object::Dictionary(dictionary! { "XObject" => dictionary!{ "N" => prev } }));
    let pdf = b.finish();
    println!("pdf size {} bytes", pdf.len());
    let t = std::time::Instant::now();
    let mut e = Engine::open(pdf, None).unwrap();
    let r = e.page_text(0);
    assert!(
        matches!(r, Err(Error::Unsupported { ref reason }) if reason == "too-many-form-invocations"),
        "{:?}",
        r.map(|p| p.lines.len())
    );
    assert!(t.elapsed().as_secs() < 5, "took {:?}", t.elapsed());
}

fn ttf_pdf(widths_first: i64, widths: Vec<i64>, content: &[u8], subset_tag: &str) -> Vec<u8> {
    let data = std::fs::read("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf").unwrap();
    let mut b = B::new();
    let mut fs = Stream::new(dictionary! { "Length1" => data.len() as i64 }, data);
    let _ = fs.compress();
    let file = b.doc.add_object(fs);
    let name = format!("{subset_tag}LiberationSans");
    let desc = b.doc.add_object(dictionary! { "Type" => "FontDescriptor", "FontName" => Object::Name(name.clone().into_bytes()), "Flags" => 32,
        "FontBBox" => vec![(-544).into(), (-303).into(), 1302.into(), 980.into()], "ItalicAngle" => 0, "Ascent" => 905, "Descent" => -212,
        "CapHeight" => 729, "StemV" => 80, "FontFile2" => file });
    let last = widths_first + widths.len() as i64 - 1;
    let font =
        b.doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "TrueType", "BaseFont" => Object::Name(name.into_bytes()),
        "Encoding" => "WinAnsiEncoding", "FirstChar" => widths_first, "LastChar" => last,
        "Widths" => widths.into_iter().map(Object::Integer).collect::<Vec<_>>(), "FontDescriptor" => desc });
    b.page(content, Object::Dictionary(dictionary! { "Font" => dictionary! { "F1" => font } }));
    b.finish()
}

#[test]
fn sparse_widths_embedded_truetype() {
    // Producer wrote widths only for the characters it used: H e l o (72..=111), zeros elsewhere.
    let mut w = vec![0i64; 111 - 72 + 1];
    for (c, v) in [(b'H', 722), (b'e', 556), (b'l', 222), (b'o', 556)] {
        w[(c - 72) as usize] = v;
    }
    let pdf = ttf_pdf(72, w, b"BT /F1 24 Tf 72 700 Td (Hello) Tj ET", "");
    let mut e = Engine::open(pdf, None).unwrap();
    // 'J' (74) and 'k' (107) are inside the range with width 0; 'W' (87) too; 'x' (120) outside.
    // Without a fallback font, the letters with no real width are refused, not overprinted.
    match e.replace_line(0, 0, "HJkWxello") {
        Err(Error::MissingGlyphs { chars, .. }) => assert_eq!(chars, "JkWx"),
        other => panic!("expected MissingGlyphs, got {:?}", other.map(|r| r.shift)),
    }
    // With the same family registered they are drawn from it, with real advances.
    let data = std::fs::read("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf").unwrap();
    assert!(e.add_font("Liberation Sans", false, false, data));
    let r = e.replace_line(0, 0, "HJkWxello").unwrap();
    assert_eq!(r.page.lines[0].text, "HJkWxello");
    assert!(r.substitutions.iter().all(|s| s.same_family));
    // "JkWx" in Liberation Sans at 24 pt is 12 + 12 + 22.656 + 12 = 58.656 pt wide.
    assert!((r.shift - 58.656).abs() < 0.1, "shift {}", r.shift);
}

#[test]
fn check_nan_passes() {
    let big = "9".repeat(400);
    let c = format!("BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj {big} 0 Td (World) Tj ET");
    let pdf = simple(c.as_bytes());
    let mut e = Engine::open(pdf, None).unwrap();
    let p = e.page_text(0).unwrap();
    assert!(p.lines.iter().all(|l| l.origin.0.is_finite() && l.origin.1.is_finite()));
    // Editing next to an out-of-range position must still verify every glyph.
    let r = e.replace_range(0, 0, 0, 1, "J");
    assert!(r.is_ok() || matches!(r, Err(Error::Verify { .. })));
}
