use berry_engine::{Engine, Error};
use lopdf::{dictionary, Document, Object, Stream};
use std::fmt::Write as _;

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
    fn pick<'a>(&mut self, v: &[&'a str]) -> &'a str {
        v[self.below(v.len() as u64) as usize]
    }
}

fn build(streams: &[String]) -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let f1 = doc.add_object(
        dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding" },
    );
    let f2 = doc.add_object(
        dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Times-Roman", "Encoding" => "WinAnsiEncoding" },
    );
    let f3 = doc.add_object(
        dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier", "Encoding" => "WinAnsiEncoding" },
    );
    let ids: Vec<Object> =
        streams.iter().map(|s| Object::Reference(doc.add_object(Stream::new(dictionary! {}, s.as_bytes().to_vec())))).collect();
    let page = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id, "Contents" => Object::Array(ids),
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary! { "Font" => dictionary! { "F1" => f1, "F2" => f2, "F3" => f3 } },
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

const WORDS: &[&str] = &["alpha", "Beta ", " gamma", "de lta", "(x)", "a\\\\b", "10,000", "fi", " ", "Zed.", "AV", "To"];

fn string(r: &mut Rng) -> String {
    let w = r.pick(WORDS);
    if r.below(5) == 0 {
        // hex form
        let raw: Vec<u8> = w.replace("\\\\", "\\").into_bytes();
        format!("<{}>", raw.iter().map(|b| format!("{b:02x}")).collect::<String>())
    } else {
        format!("({})", w.replace('(', "\\(").replace(')', "\\)"))
    }
}

fn gen(r: &mut Rng) -> Vec<String> {
    let mut s = String::new();
    let blocks = 1 + r.below(3);
    for _ in 0..blocks {
        let wrap = r.below(4) == 0;
        if wrap {
            let sc = r.pick(&["1", "0.5", "2", "1.25"]);
            write!(s, "q {sc} 0 0 {sc} {} {} cm ", r.below(40), r.below(40)).unwrap();
        }
        write!(s, "BT /F{} {} Tf ", 1 + r.below(3), r.pick(&["12", "9", "1", "10.5"])).unwrap();
        if r.below(2) == 0 {
            write!(s, "{} TL ", r.pick(&["14", "11", "0", "13.5"])).unwrap();
        }
        match r.below(3) {
            0 => write!(s, "{} {} Td ", 40 + r.below(100), 300 + r.below(400)).unwrap(),
            1 => write!(s, "1 0 0 1 {} {} Tm ", 40 + r.below(100), 300 + r.below(400)).unwrap(),
            _ => write!(s, "{0} 0 0 {0} {1} {2} Tm ", r.pick(&["12", "10", "1", "8"]), 40 + r.below(100), 300 + r.below(400))
                .unwrap(),
        }
        let n = 2 + r.below(12);
        for _ in 0..n {
            match r.below(16) {
                0..=2 => write!(s, "{} Tj ", string(r)).unwrap(),
                3..=5 => {
                    s.push('[');
                    for _ in 0..1 + r.below(5) {
                        if r.below(3) == 0 {
                            write!(s, "{} ", r.pick(&["-120", "15", "-2000", "300", "-333.5", "0", "-9000"])).unwrap();
                        }
                        s.push_str(&string(r));
                        if r.below(4) == 0 {
                            write!(s, " {}", r.pick(&["-250", "40", "-1500"])).unwrap();
                        }
                    }
                    s.push_str("] TJ ");
                }
                6 => write!(s, "{} ' ", string(r)).unwrap(),
                7 => write!(s, "{} {} {} \" ", r.pick(&["0", "2", "-1", "0.5"]), r.pick(&["0", "1", "0.3"]), string(r)).unwrap(),
                8 => {
                    write!(s, "{} {} Td ", r.pick(&["0", "20", "-15", "60", "3.5"]), r.pick(&["0", "0", "0", "-14", "-12", "5"]))
                        .unwrap()
                }
                9 => write!(s, "{} {} TD ", r.pick(&["0", "10", "-5"]), r.pick(&["-14", "-11", "0"])).unwrap(),
                10 => s.push_str("T* "),
                11 => write!(s, "{} Tc ", r.pick(&["0", "0.5", "-0.2", "2"])).unwrap(),
                12 => write!(s, "{} Tw ", r.pick(&["0", "3", "-1", "10"])).unwrap(),
                13 => write!(s, "{} Tz ", r.pick(&["100", "80", "150", "50"])).unwrap(),
                14 => write!(s, "/F{} {} Tf ", 1 + r.below(3), r.pick(&["12", "9", "1", "14"])).unwrap(),
                _ => write!(s, "{} g {} Ts ", r.pick(&["0", "0.5"]), r.pick(&["0", "3", "-2"])).unwrap(),
            }
        }
        s.push_str("ET ");
        if wrap {
            s.push_str("Q ");
        }
    }
    // Sometimes split into several streams at a random space.
    let mut parts = vec![];
    let mut rest = s.as_str();
    while r.below(3) == 0 && rest.len() > 10 {
        let cut = 1 + r.below(rest.len() as u64 - 2) as usize;
        if let Some(p) = rest[cut..].find(' ') {
            // do not cut inside a string
            let head = &rest[..cut + p];
            let opens = head.matches('(').count() - head.matches("\\(").count();
            let closes = head.matches(')').count() - head.matches("\\)").count();
            if opens == closes {
                parts.push(head.to_string());
                rest = &rest[cut + p..];
                continue;
            }
        }
        break;
    }
    parts.push(rest.to_string());
    parts
}

#[test]
fn fuzz_edits() {
    let n: u64 = std::env::var("FUZZ_N").ok().and_then(|s| s.parse().ok()).unwrap_or(300);
    let seed0: u64 = std::env::var("FUZZ_SEED").ok().and_then(|s| s.parse().ok()).unwrap_or(1);
    let dir = std::env::var("FUZZ_OUT").ok();
    let (mut ok, mut verify, mut other, mut saved) = (0, 0, 0, 0);
    let mut report = String::new();
    for i in 0..n {
        let mut r = Rng(0x9E3779B97F4A7C15u64.wrapping_mul(seed0 * 1_000_003 + i + 1));
        let streams = gen(&mut r);
        let pdf = build(&streams);
        let mut e = Engine::open(pdf.clone(), None).unwrap();
        e.add_font(
            "Liberation Sans",
            false,
            false,
            std::fs::read("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf").unwrap(),
        );
        let before = e.page_text(0).unwrap();
        if before.lines.is_empty() {
            continue;
        }
        let li = r.below(before.lines.len() as u64) as usize;
        let len = before.lines[li].text.chars().count();
        let a = r.below(len as u64 + 1) as usize;
        let b = a + r.below((len - a) as u64 + 1) as usize;
        let rep = r.pick(&[
            "",
            "",
            "X",
            "new text",
            " ",
            "ab",
            "Wide WORDS here",
            "i",
            "fi",
            "\u{20b9}5",
            "a\u{3a9}\u{20b9} b",
            "\u{3a9}",
        ]);
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| e.replace_range(0, li, a, b, rep)));
        match res {
            Err(_) => {
                println!("PANIC case {i}: {streams:?} line {li} [{a},{b}) -> {rep:?}");
                panic!("panic in case {i}");
            }
            Ok(Ok(r2)) => {
                ok += 1;
                // Expected text of the line.
                let chars: Vec<char> = before.lines[li].text.chars().collect();
                let mut want: String = chars[..a].iter().collect();
                want.push_str(rep);
                want.extend(chars[b..].iter());
                let saved_out = e.save();
                match saved_out {
                    Ok((out, _)) => {
                        if let Some(d) = &dir {
                            if !r2.changed.is_empty() {
                                std::fs::write(format!("{d}/{i}_in.pdf"), &pdf).unwrap();
                                std::fs::write(format!("{d}/{i}_out.pdf"), &out).unwrap();
                                let c = &r2.changed[0];
                                writeln!(report, "{i}\t{}\t{}\t{}\t{}\t{}", c.x0, c.y0, c.x1, c.y1, r2.shift).unwrap();
                                saved += 1;
                            }
                        }
                    }
                    Err(err) => println!("SAVE FAIL case {i}: {err:?} {streams:?}"),
                }
                let _ = want;
            }
            Ok(Err(Error::Verify { message })) => {
                verify += 1;
                if verify <= 12 {
                    println!(
                        "VERIFY case {i}: {message}\n   {streams:?}\n   line {li} {:?} [{a},{b}) -> {rep:?}",
                        before.lines[li].text
                    );
                }
            }
            Ok(Err(err)) => {
                other += 1;
                if other <= 5 {
                    println!("ERR case {i}: {err:?}");
                }
            }
        }
    }
    if let Some(d) = &dir {
        std::fs::write(format!("{d}/report.tsv"), report).unwrap();
    }
    println!("ok {ok}, verify-refused {verify}, other errors {other}, saved {saved}");
}
