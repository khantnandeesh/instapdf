//! Numbers in right-to-left lines read in logical order: separate numbers ("10 - 12") right to
//! left, as UAX #9 orders them, and one number with a plus or minus inside ("050-1234567",
//! "2024-2025") as one left-to-right run (W4). The file is drawn the Word way, in visual order
//! (tests/parity/editor/gen_scripts_numbers.py).
#![cfg(feature = "shaping")]

use berry_engine::Engine;

const DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor");

fn read(name: &str) -> Vec<u8> {
    std::fs::read(format!("{DIR}/{name}")).unwrap()
}

const LINES: [&str; 4] = ["رقم الهاتف 050-1234567", "العام الدراسي 2024-2025", "التاريخ 12-05-2024", "الصفحات 10 - 12 من الكتاب"];

#[test]
fn numbers_in_arabic_lines_read_as_typed() {
    let mut e = Engine::open(read("scripts-numbers.pdf"), None).unwrap();
    let got: Vec<String> = e.page_text(0).unwrap().lines.into_iter().map(|l| l.text).collect();
    assert_eq!(got, LINES);
}

/// A word typed after a hyphenated number is kept: the line reads back as typed.
#[test]
fn a_word_after_a_hyphenated_number_is_kept() {
    for starts in ["رقم", "العام"] {
        let mut e = Engine::open(read("scripts-numbers.pdf"), None).unwrap();
        assert!(e.add_font("Noto Naskh Arabic", false, false, read("fonts/NotoNaskhArabic-Regular.ttf")));
        let p = e.page_text(0).unwrap();
        let id = p.lines.iter().position(|l| l.text.starts_with(starts)).unwrap();
        let want = format!("{} جديد", p.lines[id].text);
        let r = e.replace_line(0, id, &want).unwrap_or_else(|err| panic!("{starts}: {err:?}"));
        assert!(r.page.lines.iter().any(|l| l.text == want), "{:?}", r.page.lines.iter().map(|l| &l.text).collect::<Vec<_>>());
    }
}
