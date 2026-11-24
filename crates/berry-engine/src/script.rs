//! Character properties for complex scripts: marks, scripts, bidi classes, Indic reordering
//! helpers and presentation-form folding.

use crate::presentation::PRESENTATION;
use unicode_bidi::BidiClass;
use unicode_properties::{GeneralCategory, UnicodeGeneralCategory};
use unicode_script::{Script, UnicodeScript};

/// A combining mark that sits on a base character (accents, Indic signs, Arabic harakat).
pub fn is_mark(ch: char) -> bool {
    matches!(ch.general_category(), GeneralCategory::NonspacingMark | GeneralCategory::EnclosingMark)
}

/// Any mark, spacing ones (Indic dependent vowels) included.
pub fn is_any_mark(ch: char) -> bool {
    matches!(
        ch.general_category(),
        GeneralCategory::NonspacingMark | GeneralCategory::EnclosingMark | GeneralCategory::SpacingMark
    )
}

pub fn script(ch: char) -> Script {
    ch.script()
}

/// Indic (Brahmic) scripts whose shaping reorders and conjoins letters.
pub fn is_indic(ch: char) -> bool {
    matches!(
        ch.script(),
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
            ch.script(),
            Script::Thai | Script::Lao | Script::Khmer | Script::Myanmar | Script::Tibetan | Script::Syriac | Script::Thaana
        )
        || (0xFB1D..=0xFEFF).contains(&(ch as u32))
}

pub fn bidi(ch: char) -> BidiClass {
    unicode_bidi::bidi_class(ch)
}

/// A strong right-to-left letter.
pub fn is_rtl(ch: char) -> bool {
    matches!(bidi(ch), BidiClass::R | BidiClass::AL)
}

pub fn is_ltr(ch: char) -> bool {
    bidi(ch) == BidiClass::L
}

/// European or Arabic-Indic digits.
pub fn is_digit(ch: char) -> bool {
    matches!(bidi(ch), BidiClass::EN | BidiClass::AN)
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
        match PRESENTATION.binary_search_by_key(&(c as u32), |(k, _)| *k) {
            Ok(i) => out.push_str(PRESENTATION[i].1),
            Err(_) => out.push(c),
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
    is_indic(ch) && ch.general_category() == GeneralCategory::OtherLetter
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
