//! berry text <in.pdf> [page]                       → page text as JSON
//! berry replace <in.pdf> <out.pdf> <page> <find> <replace> [--fonts <dir>] [--all]
//!                                                  → edits, saves, prints a JSON report
//! berry add <in.pdf> <out.pdf> <page> <x> <y> <size> <text> [--fonts <dir>] [--family <name>]
//!                                                  → draws a new line, saves, prints the same report
//!
//! Pages are 1-based here. `--fonts` registers every .ttf and .woff in a directory as a fallback
//! font.

use berry_engine::fallback::FontRequest;
use berry_engine::{Engine, Error};
use std::path::Path;

fn fail(msg: impl std::fmt::Display) -> ! {
    eprintln!("berry: {msg}");
    std::process::exit(1)
}

fn register_fonts(engine: &mut Engine, dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { fail(format!("cannot read {}", dir.display())) };
    let mut paths: Vec<_> = entries.flatten().map(|e| e.path()).collect();
    paths.sort();
    for path in paths {
        if path.is_dir() {
            register_fonts(engine, &path);
            continue;
        }
        if !matches!(path.extension().and_then(|e| e.to_str()), Some("ttf" | "woff")) {
            continue;
        }
        // "LiberationSans-BoldItalic.ttf" → family "Liberation Sans", bold, italic.
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let (family, style) = stem.split_once('-').unwrap_or((stem, "Regular"));
        let mut spaced = String::new();
        for (i, c) in family.chars().enumerate() {
            let prev_lower = family.chars().nth(i.wrapping_sub(1)).map(|p| p.is_lowercase()).unwrap_or(false);
            if i > 0 && c.is_uppercase() && prev_lower {
                spaced.push(' ');
            }
            spaced.push(c);
        }
        let style = style.to_lowercase();
        if let Ok(data) = std::fs::read(&path) {
            engine.add_font(&spaced, style.contains("bold"), style.contains("italic") || style.contains("oblique"), data);
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut positional: Vec<&str> = Vec::new();
    let mut fonts: Option<&str> = None;
    let mut family = "Noto Sans";
    let mut all = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--fonts" => {
                i += 1;
                fonts = args.get(i).map(String::as_str);
            }
            "--family" => {
                i += 1;
                family = args.get(i).map(String::as_str).unwrap_or(family);
            }
            "--all" => all = true,
            a => positional.push(a),
        }
        i += 1;
    }
    match positional.as_slice() {
        ["text", input, rest @ ..] => {
            let bytes = std::fs::read(input).unwrap_or_else(|e| fail(e));
            let mut engine = Engine::open(bytes, None).unwrap_or_else(|e| fail(e));
            let pages: Vec<usize> = match rest.first() {
                Some(p) => vec![p.parse::<usize>().unwrap_or_else(|e| fail(e)) - 1],
                None => (0..engine.page_count()).collect(),
            };
            let out: Vec<_> = pages.into_iter().map(|p| engine.page_text(p).unwrap_or_else(|e| fail(e))).collect();
            println!("{}", serde_json::to_string_pretty(&out).unwrap());
        }
        ["replace", input, output, page, find, replace] => {
            let bytes = std::fs::read(input).unwrap_or_else(|e| fail(e));
            let mut engine = Engine::open(bytes, None).unwrap_or_else(|e| fail(e));
            if let Some(dir) = fonts {
                register_fonts(&mut engine, Path::new(dir));
            }
            let page = page.parse::<usize>().unwrap_or_else(|e| fail(e)) - 1;
            let mut edits = Vec::new();
            loop {
                // Line ids change after an edit, so search again each time. Skip matches that
                // sit inside text we already replaced.
                let matches = engine.find(page, find, true).unwrap_or_else(|e| fail(e));
                let Some(m) = matches.get(if replace.contains(find) { edits.len() } else { 0 }) else { break };
                match engine.replace_range(page, m.line, m.start, m.end, replace) {
                    Ok(r) => edits.push(serde_json::json!({
                        "changed": r.changed, "substitutions": r.substitutions, "shift": r.shift,
                    })),
                    Err(e @ Error::MissingGlyphs { .. }) => fail(serde_json::to_string(&e).unwrap()),
                    Err(e) => fail(e),
                }
                if !all {
                    break;
                }
            }
            if edits.is_empty() {
                fail(format!("{find:?} not found on page {}", page + 1));
            }
            let (out, report) = engine.save().unwrap_or_else(|e| fail(e));
            std::fs::write(output, out).unwrap_or_else(|e| fail(e));
            println!("{}", serde_json::to_string_pretty(&serde_json::json!({ "edits": edits, "save": report })).unwrap());
        }
        ["add", input, output, page, x, y, size, text] => {
            let bytes = std::fs::read(input).unwrap_or_else(|e| fail(e));
            let mut engine = Engine::open(bytes, None).unwrap_or_else(|e| fail(e));
            if let Some(dir) = fonts {
                register_fonts(&mut engine, Path::new(dir));
            }
            let num = |s: &str| s.parse::<f64>().unwrap_or_else(|e| fail(e));
            let page = page.parse::<usize>().unwrap_or_else(|e| fail(e)) - 1;
            let req = FontRequest { families: vec![family.to_string()], bold: false, italic: false };
            let r = match engine.add_text(page, text, &req, num(size), num(x), num(y), 0.0, [0, 0, 0]) {
                Ok(r) => r,
                Err(e @ Error::MissingGlyphs { .. }) => fail(serde_json::to_string(&e).unwrap()),
                Err(e) => fail(e),
            };
            let edits = vec![serde_json::json!({ "changed": r.changed, "substitutions": r.substitutions, "shift": r.shift })];
            let (out, report) = engine.save().unwrap_or_else(|e| fail(e));
            std::fs::write(output, out).unwrap_or_else(|e| fail(e));
            println!("{}", serde_json::to_string_pretty(&serde_json::json!({ "edits": edits, "save": report })).unwrap());
        }
        _ => fail("usage: berry text <in.pdf> [page] | berry replace <in.pdf> <out.pdf> <page> <find> <replace> [--fonts <dir>] [--all] | berry add <in.pdf> <out.pdf> <page> <x> <y> <size> <text> [--fonts <dir>] [--family <name>]"),
    }
}
