//! Character properties for complex scripts: marks, scripts, bidi classes, Indic reordering
//! helpers and presentation-form folding.

use crate::script_tables::{DIGITS, NONSPACING_MARKS, PRESENTATION, PRESENTATION_TEXT, RTL, SCRIPTS, SPACING_MARKS};

/// The scripts the engine treats specially. Everything else (Latin, digits, punctuation) is
/// `Other`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Script {
    Devanagari,
    Bengali,
    Gurmukhi,
    Gujarati,
    Oriya,
    Tamil,
    Telugu,
    Kannada,
    Malayalam,
    Sinhala,
    Arabic,
    Hebrew,
    Syriac,
    Thaana,
    Thai,
    Lao,
    Khmer,
    Myanmar,
    Tibetan,
    Other,
}

fn in_ranges(table: &[(u32, u32)], ch: char) -> bool {
    let c = ch as u32;
    table
        .binary_search_by(|&(a, b)| {
            if b < c {
                std::cmp::Ordering::Less
            } else if a > c {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        })
        .is_ok()
}

/// A combining mark that sits on a base character (accents, Indic signs, Arabic harakat).
pub fn is_mark(ch: char) -> bool {
    in_ranges(NONSPACING_MARKS, ch)
}

/// Any mark, spacing ones (Indic dependent vowels) included.
pub fn is_any_mark(ch: char) -> bool {
    is_mark(ch) || in_ranges(SPACING_MARKS, ch)
}

/// Canonical combining class of the Arabic and Hebrew marks; other marks sort as "above" (230).
fn combining_class(ch: char) -> u8 {
    match ch as u32 {
        0x05B0..=0x05B9 => (ch as u32 - 0x05B0 + 10) as u8,
        0x05BA => 19,
        0x05BB..=0x05BD => (ch as u32 - 0x05BB + 20) as u8,
        0x05BF => 23,
        0x05C1 => 24,
        0x05C2 => 25,
        0x0591 | 0x0596 | 0x059B | 0x05A2..=0x05A7 | 0x05AA => 220,
        0x059A | 0x05AD => 222,
        0x05AE => 228,
        0x0618..=0x061A => (ch as u32 - 0x0618 + 30) as u8,
        0x05C5 | 0x0655 | 0x0656 | 0x065C | 0x065F | 0x06E3 | 0x06EA | 0x06ED => 220,
        0x05C7 => 18,
        0x064B..=0x0652 => (ch as u32 - 0x064B + 27) as u8,
        0x0670 => 35,
        _ => 230,
    }
}

/// Puts each run of stacked right-to-left marks (harakat, Hebrew points) in canonical order,
/// so text read in drawing order compares equal to the same text typed. Other scripts are
/// left as they are.
pub fn canonical_marks(text: &str) -> String {
    let mut out: Vec<char> = text.chars().collect();
    let rtl_mark = |c: char| is_mark(c) && is_rtl_script_mark(c);
    let mut i = 0;
    while i < out.len() {
        if !rtl_mark(out[i]) {
            i += 1;
            continue;
        }
        let j = (i..out.len()).find(|&k| !rtl_mark(out[k])).unwrap_or(out.len());
        out[i..j].sort_by_key(|&c| combining_class(c));
        i = j;
    }
    out.into_iter().collect()
}

fn is_rtl_script_mark(ch: char) -> bool {
    matches!(ch as u32, 0x0591..=0x05C7 | 0x0610..=0x061A | 0x064B..=0x065F | 0x0670 | 0x06D6..=0x06ED)
}

pub fn script(ch: char) -> Script {
    let c = ch as u32;
    match SCRIPTS.binary_search_by(|&(a, b, _)| {
        if b < c {
            std::cmp::Ordering::Less
        } else if a > c {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Equal
        }
    }) {
        Ok(i) => SCRIPTS[i].2,
        Err(_) => Script::Other,
    }
}

/// Indic (Brahmic) scripts whose shaping reorders and conjoins letters.
pub fn is_indic(ch: char) -> bool {
    matches!(
        script(ch),
        Script::Devanagari
            | Script::Bengali
            | Script::Gurmukhi
            | Script::Gujarati
            | Script::Oriya
            | Script::Tamil
            | Script::Telugu
            | Script::Kannada
            | Script::Malayalam
            | Script::Sinhala
    )
}

/// Characters whose look depends on their neighbours or on bidi: any text that contains one
/// is edited by whole words and laid out by the shaper.
pub fn is_complex(ch: char) -> bool {
    is_indic(ch)
        || is_rtl(ch)
        || matches!(
            script(ch),
            Script::Thai | Script::Lao | Script::Khmer | Script::Myanmar | Script::Tibetan | Script::Syriac | Script::Thaana
        )
        || (0xFB1D..=0xFEFF).contains(&(ch as u32))
}

/// True when editing this text needs the shaper (whole-word edits, bidi layout).
pub fn needs_shaping(text: &str, rtl: bool) -> bool {
    rtl || text.chars().any(is_complex)
}

/// A strong right-to-left letter (bidi class R or AL).
pub fn is_rtl(ch: char) -> bool {
    in_ranges(RTL, ch)
}

/// A strong left-to-right character: a letter that is not right-to-left.
pub fn is_ltr(ch: char) -> bool {
    ch.is_alphabetic() && !is_rtl(ch) && !is_any_mark(ch)
}

/// European or Arabic-Indic digits.
pub fn is_digit(ch: char) -> bool {
    in_ranges(DIGITS, ch)
}

pub fn mirror(ch: char) -> char {
    unicode_bidi_mirroring::get_mirrored(ch).unwrap_or(ch)
}

/// Folds Hebrew and Arabic presentation forms (U+FB1D–U+FEFF) to their base letters.
pub fn fold_presentation(s: &str) -> String {
    if !s.chars().any(|c| (0xFB1D..=0xFEFF).contains(&(c as u32))) {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        let code = c as u32;
        match PRESENTATION.binary_search_by_key(&code, |&(k, _, _)| k as u32) {
            Ok(i) if code <= 0xFFFF => {
                let (_, a, b) = PRESENTATION[i];
                out.push_str(PRESENTATION_TEXT.get(a as usize..b as usize).unwrap_or(""));
            }
            _ => out.push(c),
        }
    }
    out
}

/// Vowel signs drawn before the consonant they follow in the text.
pub fn is_prebase_matra(ch: char) -> bool {
    matches!(
        ch as u32,
        0x093F | 0x094E | 0x09BF | 0x09C7 | 0x09C8 | 0x0A3F | 0x0ABF | 0x0B47 | 0x0BC6..=0x0BC8 | 0x0D46..=0x0D48 | 0x0DD9 | 0x0DDB
    )
}

pub fn is_virama(ch: char) -> bool {
    matches!(ch as u32, 0x094D | 0x09CD | 0x0A4D | 0x0ACD | 0x0B4D | 0x0BCD | 0x0C4D | 0x0CCD | 0x0D4D | 0x0DCA)
}

/// The letter RA of an Indic script, which forms a reph before a consonant.
pub fn is_ra(ch: char) -> bool {
    matches!(ch as u32, 0x0930 | 0x09B0 | 0x09F0 | 0x0A30 | 0x0AB0 | 0x0B30 | 0x0C30 | 0x0CB0 | 0x0D30)
}

/// An Indic letter that can be the base of a syllable.
pub fn is_indic_letter(ch: char) -> bool {
    is_indic(ch) && ch.is_alphabetic() && !is_any_mark(ch)
}

/// Legacy Hindi fonts that put Devanagari shapes on Latin codes (no Unicode text behind them).
pub fn is_legacy_indic_font(base_font: &str) -> bool {
    let n: String = base_font.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase();
    const NAMES: &[&str] = &[
        "krutidev",
        "devlys",
        "chanakya",
        "shivaji",
        "agradeep",
        "amarujala",
        "aakriti",
        "akshar",
        "shusha",
        "dvbw",
        "dvb",
        "dvot",
        "sanskrit99",
        "walkman",
        "kundli",
        "surekh",
        "yogesh",
        "hindisaral",
        "naidunia",
    ];
    // "dvb"/"dvot" only as a prefix (DVB-TTSurekh, DVOT-Yogesh): avoid matching ordinary names.
    NAMES.iter().any(|k| if k.starts_with("dv") { n.starts_with(k) || n.contains(&format!("{k}tt")) } else { n.contains(k) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classes() {
        assert!(is_mark('\u{0941}'));
        assert!(!is_mark('\u{093F}'));
        assert!(is_any_mark('\u{093F}'));
        assert!(is_rtl('م') && is_rtl('א'));
        assert!(is_digit('7') && is_digit('\u{0667}'));
        assert!(is_complex('क') && is_complex('م') && !is_complex('a'));
        assert_eq!(mirror('('), ')');
        assert_eq!(fold_presentation("\u{FEFB}\u{FE8E}"), "لاا");
        assert!(is_legacy_indic_font("ABCDEF+KrutiDev010") && !is_legacy_indic_font("Devanagari MT"));
    }
}
