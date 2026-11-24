//! Nearest-font matching for characters the original font cannot draw.
//!
//! The host registers open-licensed font files. For a PDF font we rank families: the same
//! family first, then the metric-compatible stand-in, then a generic face of the same class.

use crate::font::{strip_subset_prefix, PdfFont};
use serde::Serialize;

/// What the engine asks the host for when no registered font covers a character.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct FontRequest {
    /// Family names, best first.
    pub families: Vec<String>,
    pub bold: bool,
    pub italic: bool,
}

pub fn normalize(name: &str) -> String {
    name.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase()
}

/// Family stem of a PostScript name: no subset prefix, no style words.
pub fn family_stem(base_font: &str) -> String {
    let name = strip_subset_prefix(base_font).0;
    let name = name.split([',', '-']).next().unwrap_or(name);
    let mut n = normalize(name);
    loop {
        let before = n.len();
        for suffix in ["mt", "ps", "regular", "roman", "bolditalic", "boldoblique", "bold", "italic", "oblique", "medium", "book"]
        {
            if n.len() > suffix.len() + 2 && n.ends_with(suffix) {
                n.truncate(n.len() - suffix.len());
            }
        }
        if n.len() == before {
            break;
        }
    }
    n
}

/// Metric-compatible or close open stand-ins, keyed by normalised family stem.
const STAND_INS: &[(&[&str], &[&str])] = &[
    (&["arial", "helvetica", "helveticaneue", "arimo", "liberationsans", "nimbussans"], &["Liberation Sans", "Arimo"]),
    (&["times", "timesnew", "timesnewroman", "tinos", "liberationserif", "nimbusroman"], &["Liberation Serif", "Tinos"]),
    (&["courier", "couriernew", "cousine", "liberationmono", "nimbusmono"], &["Liberation Mono", "Cousine"]),
    (&["calibri", "carlito"], &["Carlito"]),
    (&["cambria", "caladea"], &["Caladea"]),
    (&["verdana", "tahoma", "dejavusans"], &["DejaVu Sans"]),
    (&["georgia", "gelasio"], &["Gelasio"]),
    (&["segoeui", "selawik"], &["Selawik"]),
    (&["garamond", "ebgaramond"], &["EB Garamond"]),
];

/// Ranks fallback families for a PDF font.
pub fn request_for(font: &PdfFont) -> FontRequest {
    let stem = family_stem(&font.base_font);
    let mut families: Vec<String> = Vec::new();
    let mut push = |f: &str| {
        if !families.iter().any(|x| normalize(x) == normalize(f)) {
            families.push(f.to_string());
        }
    };
    // The same family, in case the host has it (the name is matched after normalising).
    let pretty = strip_subset_prefix(&font.base_font).0.split([',', '-']).next().unwrap_or("").to_string();
    if !pretty.is_empty() {
        push(&pretty);
    }
    for (keys, subs) in STAND_INS {
        if keys.contains(&stem.as_str()) {
            for s in *subs {
                push(s);
            }
        }
    }
    if font.is_monospace() || stem.contains("mono") || stem.contains("courier") {
        push("Liberation Mono");
    } else if font.is_serif() || stem.contains("serif") && !stem.contains("sans") {
        push("Liberation Serif");
    } else {
        push("Liberation Sans");
    }
    push("Noto Sans");
    FontRequest { families, bold: font.is_bold(), italic: font.is_italic() }
}

/// Open families for a script, best first, given the original font's look.
fn script_families(sc: unicode_script::Script, serif: bool, stem: &str) -> Vec<&'static str> {
    use unicode_script::Script as S;
    let naskh = [
        "times",
        "timesnew",
        "timesnewroman",
        "traditionalarabic",
        "simplifiedarabic",
        "arabictypesetting",
        "amiri",
        "notonaskharabic",
        "scheherazade",
        "lotus",
        "badr",
    ];
    match sc {
        S::Devanagari => {
            let serif = serif
                || ["kokila", "aparajita", "utsaah", "notoserifdevanagari", "sanskrit", "martel"]
                    .iter()
                    .any(|k| stem.contains(k));
            if serif {
                vec!["Noto Serif Devanagari", "Noto Sans Devanagari"]
            } else {
                vec!["Noto Sans Devanagari", "Noto Serif Devanagari"]
            }
        }
        S::Arabic => {
            if serif || naskh.iter().any(|k| stem.contains(k)) {
                vec!["Noto Naskh Arabic", "Noto Sans Arabic"]
            } else {
                vec!["Noto Sans Arabic", "Noto Naskh Arabic"]
            }
        }
        S::Hebrew => {
            if serif {
                vec!["Noto Serif Hebrew", "Noto Sans Hebrew"]
            } else {
                vec!["Noto Sans Hebrew", "Noto Serif Hebrew"]
            }
        }
        S::Bengali => vec!["Noto Sans Bengali", "Noto Serif Bengali"],
        S::Gurmukhi => vec!["Noto Sans Gurmukhi"],
        S::Gujarati => vec!["Noto Sans Gujarati"],
        S::Oriya => vec!["Noto Sans Oriya"],
        S::Tamil => vec!["Noto Sans Tamil"],
        S::Telugu => vec!["Noto Sans Telugu"],
        S::Kannada => vec!["Noto Sans Kannada"],
        S::Malayalam => vec!["Noto Sans Malayalam"],
        S::Sinhala => vec!["Noto Sans Sinhala"],
        S::Thai => vec!["Noto Sans Thai"],
        _ => vec![],
    }
}

/// Like [`request_for`], with the families for the scripts in `text` put right after the
/// original family (a Latin stand-in cannot draw Hindi or Arabic).
pub fn request_for_text(font: &PdfFont, text: &str) -> FontRequest {
    let base = request_for(font);
    let stem = family_stem(&font.base_font);
    let mut scripts: Vec<unicode_script::Script> = Vec::new();
    for c in text.chars() {
        let sc = crate::script::script(c);
        if crate::script::is_complex(c) && !scripts.contains(&sc) {
            scripts.push(sc);
        }
    }
    if scripts.is_empty() {
        return base;
    }
    let mut families: Vec<String> = Vec::new();
    let mut push = |f: &str| {
        if !families.iter().any(|x| normalize(x) == normalize(f)) {
            families.push(f.to_string());
        }
    };
    if let Some(same) = base.families.first() {
        push(same);
    }
    for sc in scripts {
        for f in script_families(sc, font.is_serif(), &stem) {
            push(f);
        }
    }
    for f in &base.families {
        push(f);
    }
    FontRequest { families, bold: base.bold, italic: base.italic }
}

/// A font file the host registered.
#[derive(Clone)]
pub struct Face {
    pub family: String,
    pub bold: bool,
    pub italic: bool,
    pub data: std::rc::Rc<Vec<u8>>,
}

impl Face {
    /// Glyph for a character, if the face draws it (blank characters need no outline).
    pub fn glyph(&self, ch: char) -> Option<u16> {
        let face = ttf_parser::Face::parse(&self.data, 0).ok()?;
        face.glyph_index(ch).map(|g| g.0).filter(|&g| g != 0)
    }
}

/// Picks the registered face that best matches `req` and has every character of `text`.
pub fn pick_text(faces: &[Face], req: &FontRequest, text: &str) -> Option<usize> {
    let style_score = |f: &Face| (f.bold != req.bold) as u32 + (f.italic != req.italic) as u32;
    let mut best: Option<((usize, u32), usize)> = None;
    for (i, f) in faces.iter().enumerate() {
        if !crate::shape::covers(&f.data, text) {
            continue;
        }
        let rank = req.families.iter().position(|fam| normalize(fam) == normalize(&f.family)).unwrap_or(usize::MAX);
        let key = (rank, style_score(f));
        if best.map(|(k, _)| key < k).unwrap_or(true) {
            best = Some((key, i));
        }
    }
    best.map(|(_, i)| i)
}

/// Picks the registered face that best matches `req` and covers `ch`.
pub fn pick(faces: &[Face], req: &FontRequest, ch: char) -> Option<usize> {
    let style_score = |f: &Face| (f.bold != req.bold) as u32 + (f.italic != req.italic) as u32;
    let mut best: Option<((usize, u32), usize)> = None;
    for (i, f) in faces.iter().enumerate() {
        if f.glyph(ch).is_none() {
            continue;
        }
        let rank = req.families.iter().position(|fam| normalize(fam) == normalize(&f.family)).unwrap_or(usize::MAX);
        let key = (rank, style_score(f));
        if best.map(|(k, _)| key < k).unwrap_or(true) {
            best = Some((key, i));
        }
    }
    best.map(|(_, i)| i)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stems() {
        assert_eq!(family_stem("ABCDEF+Arial-BoldMT"), "arial");
        assert_eq!(family_stem("TimesNewRomanPSMT"), "timesnew");
        assert_eq!(family_stem("Calibri,Bold"), "calibri");
        assert_eq!(family_stem("Carlito-Regular"), "carlito");
    }
}
