//! Hostile inputs must be bounded in time and memory and must never panic.

use berry_engine::Engine;
use lopdf::{dictionary, Document, Object, Stream};

fn doc_with_font(font: impl FnOnce(&mut Document) -> lopdf::ObjectId, content: &[u8]) -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let f = font(&mut doc);
    let c = doc.add_object(Stream::new(dictionary! {}, content.to_vec()));
    let page = doc.add_object(dictionary! { "Type" => "Page", "Parent" => pages_id, "Contents" => c,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()], "Resources" => dictionary!{ "Font" => dictionary!{ "F1" => f } } });
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

#[test]
fn type1_charstrings_length_wraps() {
    let plain = b"0000/CharStrings 1 dict dup begin\n/a 18446744073709551600 RD x ND\nend\n";
    let mut r: u16 = 55665;
    let mut enc = b"%!PS-AdobeFont-1.0\ncurrentfile eexec\n".to_vec();
    let head = enc.len();
    for &p in plain.iter() {
        let c = p ^ (r >> 8) as u8;
        r = (c as u16).wrapping_add(r).wrapping_mul(52845).wrapping_add(22719);
        enc.push(c);
    }
    let pdf = doc_with_font(
        |doc| {
            let file = doc.add_object(Stream::new(dictionary! { "Length1" => head as i64 }, enc));
            let desc = doc
                .add_object(dictionary! { "Type" => "FontDescriptor", "FontName" => "Evil", "Flags" => 32, "FontFile" => file });
            doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Evil", "FontDescriptor" => desc,
            "FirstChar" => 97, "LastChar" => 97, "Widths" => vec![500.into()] })
        },
        b"BT /F1 12 Tf 72 700 Td (a) Tj ET",
    );
    println!("opening {} byte pdf", pdf.len());
    let mut e = Engine::open(pdf, None).unwrap();
    let _ = e.page_text(0).unwrap();
}

#[test]
fn cid_w_array_bomb() {
    let triples = 400u32;
    let mut w = Vec::new();
    for i in 0..triples {
        w.push(Object::Integer((i * 65536) as i64));
        w.push(Object::Integer((i * 65536 + 65535) as i64));
        w.push(Object::Integer(500));
    }
    let pdf = doc_with_font(
        |doc| {
            let cid = doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "CIDFontType2", "BaseFont" => "X", "W" => w,
                "CIDSystemInfo" => dictionary!{ "Registry" => Object::string_literal("Adobe"), "Ordering" => Object::string_literal("Identity"), "Supplement" => 0 } });
            doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "Type0", "BaseFont" => "X", "Encoding" => "Identity-H", "DescendantFonts" => vec![Object::Reference(cid)] })
        },
        b"BT /F1 12 Tf 72 700 Td <0041> Tj ET",
    );
    let t = std::time::Instant::now();
    let mut e = Engine::open(pdf.clone(), None).unwrap();
    let _ = e.page_text(0).unwrap();
    assert!(t.elapsed().as_secs() < 2, "{} W triples in a {} byte pdf took {:?}", triples, pdf.len(), t.elapsed());
}

#[test]
fn type0_without_tounicode_is_fast() {
    let data = std::fs::read("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf").unwrap();
    let face = ttf_parser::Face::parse(&data, 0).unwrap();
    let text = "The quick brown fox jumps over the lazy dog. ".repeat(60);
    let mut content = String::from("BT /F1 10 Tf 40 780 Td 11 TL ");
    for (i, chunk) in text.as_bytes().chunks(90).enumerate() {
        let hex: String = chunk.iter().map(|b| format!("{:04x}", face.glyph_index(*b as char).unwrap().0)).collect();
        content.push_str(&format!("<{hex}> {} ", if i == 0 { "Tj" } else { "'" }));
    }
    content.push_str("ET");
    let pdf = doc_with_font(
        |doc| {
            let mut fs = Stream::new(dictionary! { "Length1" => data.len() as i64 }, data.clone());
            let _ = fs.compress();
            let file = doc.add_object(fs);
            let desc = doc.add_object(
                dictionary! { "Type" => "FontDescriptor", "FontName" => "LiberationSans", "Flags" => 32, "FontFile2" => file,
                "Ascent" => 905, "Descent" => -212 },
            );
            let cid = doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "CIDFontType2", "BaseFont" => "LiberationSans", "DW" => 500,
                "FontDescriptor" => desc, "CIDToGIDMap" => "Identity",
                "CIDSystemInfo" => dictionary!{ "Registry" => Object::string_literal("Adobe"), "Ordering" => Object::string_literal("Identity"), "Supplement" => 0 } });
            doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "Type0", "BaseFont" => "LiberationSans", "Encoding" => "Identity-H", "DescendantFonts" => vec![Object::Reference(cid)] })
        },
        content.as_bytes(),
    );
    let t = std::time::Instant::now();
    let mut e = Engine::open(pdf, None).unwrap();
    let p = e.page_text(0).unwrap();
    assert!(p.lines[0].text.starts_with("The quick brown fox"));
    let r = e.replace_range(0, 0, 4, 9, "slow").unwrap();
    assert!(r.page.lines[0].text.starts_with("The slow brown fox"));
    assert!(t.elapsed().as_secs() < 10, "took {:?}", t.elapsed());
}
