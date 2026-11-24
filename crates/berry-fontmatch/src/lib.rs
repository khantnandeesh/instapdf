//! Font matching for the BerryPDF font library (docs/specs/f24-font-library.md).
//!
//! A font's look is reduced to a [`Fingerprint`]: a fixed coarse vector (proportions, stroke,
//! serifs, slant, letter widths) and a small shape signature per character. The library ingest
//! and the browser run this same code, so a font embedded in a PDF and a font in the library
//! are measured identically.
//!
//! Matching is two passes: [`rank`] compares coarse vectors of every face in the index, then
//! [`glyph_distance`] compares the signatures of the characters both fonts have.

mod measure;
mod outline;

pub use outline::{Glyph, GlyphSource, OpenTypeSource, ProgramSource};

/// Length of the coarse vector in bytes.
pub const COARSE_LEN: usize = 64;
/// Length of one glyph signature in bytes: an 8 by 8 coverage grid, 4 bits a cell.
pub const SIG_LEN: usize = 32;
/// A coarse byte with this value means "not measured" (the font lacks the needed characters).
pub const UNKNOWN: u8 = 0xFF;

/// Positions in the coarse vector.
pub mod slot {
    pub const X_HEIGHT: usize = 0;
    pub const CAP_HEIGHT: usize = 1;
    pub const ASCENDER: usize = 2;
    pub const DESCENDER: usize = 3;
    pub const WEIGHT: usize = 4;
    pub const CONTRAST: usize = 5;
    pub const SERIF: usize = 6;
    pub const SLANT: usize = 7;
    pub const MONOSPACE: usize = 8;
    pub const LOWER_WIDTH: usize = 9;
    pub const UPPER_WIDTH: usize = 10;
    pub const ROUND_ASPECT: usize = 11;
    /// Advances of a–z then A–Z.
    pub const ADVANCES: usize = 12;
}

/// How much each coarse byte counts in [`coarse_distance`].
const WEIGHTS: [u8; COARSE_LEN] = {
    let mut w = [1u8; COARSE_LEN];
    w[slot::X_HEIGHT] = 4;
    w[slot::CAP_HEIGHT] = 3;
    w[slot::ASCENDER] = 2;
    w[slot::DESCENDER] = 2;
    w[slot::WEIGHT] = 6;
    w[slot::CONTRAST] = 4;
    w[slot::SERIF] = 6;
    w[slot::SLANT] = 6;
    w[slot::MONOSPACE] = 4;
    w[slot::LOWER_WIDTH] = 4;
    w[slot::UPPER_WIDTH] = 3;
    w[slot::ROUND_ASPECT] = 3;
    w
};

/// The characters a fingerprint looks at.
pub const ALPHABET: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

#[derive(Clone, Debug, PartialEq)]
pub struct Fingerprint {
    pub coarse: [u8; COARSE_LEN],
    /// Signature per character the font draws, in the order asked for.
    pub glyphs: Vec<(char, [u8; SIG_LEN])>,
}

/// Fingerprints a font from the characters of `chars` it draws. The coarse vector reads only
/// the Latin letters among them; every character gets a signature, so fonts of any script can be
/// compared glyph by glyph.
pub fn fingerprint_chars(src: &dyn GlyphSource, chars: &str) -> Fingerprint {
    let mut glyphs: Vec<(char, Glyph)> = Vec::new();
    for c in chars.chars() {
        if glyphs.iter().any(|(have, _)| *have == c) {
            continue;
        }
        if let Some(g) = src.glyph(c).filter(|g| g.has_ink()) {
            glyphs.push((c, g));
        }
    }
    let coarse = measure::coarse(&glyphs);
    let sigs = glyphs.iter().map(|(c, g)| (*c, measure::signature(g))).collect();
    Fingerprint { coarse, glyphs: sigs }
}

/// Fingerprints a font from the characters of [`ALPHABET`] that `keep` allows and the font draws.
/// `keep` lets a caller measure a font as a subset would show it.
pub fn fingerprint_with(src: &dyn GlyphSource, keep: &dyn Fn(char) -> bool) -> Fingerprint {
    let chars: String = ALPHABET.chars().filter(|c| keep(*c)).collect();
    fingerprint_chars(src, &chars)
}

pub fn fingerprint(src: &dyn GlyphSource) -> Fingerprint {
    fingerprint_chars(src, ALPHABET)
}

/// Fingerprints a TrueType or OpenType font file. `None` when the bytes are not such a font.
pub fn fingerprint_bytes(bytes: &[u8]) -> Option<Fingerprint> {
    Some(fingerprint(&OpenTypeSource::parse(bytes)?))
}

/// Fingerprints a font program embedded in a PDF. `glyphs` lists, per character, the glyph
/// index in the program and the advance in 1/1000 em, as the PDF's font dictionary gives them.
/// `None` when the program cannot be read (compare widths with [`fingerprint_widths`] then).
pub fn fingerprint_program(format: &str, bytes: &[u8], glyphs: &[(char, u16, f32)]) -> Option<Fingerprint> {
    let chars: String = glyphs.iter().map(|g| g.0).collect();
    Some(fingerprint_chars(&ProgramSource::parse(format, bytes, glyphs)?, &chars))
}

/// The little a font without a readable program still tells: its letter widths. Enough to find
/// a metric-compatible twin, not a look-alike.
pub fn fingerprint_widths(widths: &[(char, f32)]) -> Fingerprint {
    let glyphs: Vec<(char, Glyph)> =
        widths.iter().map(|(c, w)| (*c, Glyph { advance: w / 1000.0, contours: Vec::new() })).collect();
    Fingerprint { coarse: measure::coarse(&glyphs), glyphs: Vec::new() }
}

/// Weighted mean difference of two coarse vectors over the bytes both have measured, 0 (same)
/// to 1. `None` when they share too little to compare.
pub fn coarse_distance(a: &[u8], b: &[u8]) -> Option<f32> {
    let (mut sum, mut weight) = (0u32, 0u32);
    for i in 0..COARSE_LEN.min(a.len()).min(b.len()) {
        if a[i] == UNKNOWN || b[i] == UNKNOWN {
            continue;
        }
        sum += WEIGHTS[i] as u32 * (a[i] as i32 - b[i] as i32).unsigned_abs();
        weight += WEIGHTS[i] as u32;
    }
    (weight >= 12).then(|| sum as f32 / (weight as f32 * 254.0))
}

/// The `top` faces of an index (face i is bytes `i * COARSE_LEN ..`) closest to `target`, best
/// first, as (face, distance). `allow` filters faces, e.g. by script coverage.
pub fn rank(target: &[u8], index: &[u8], top: usize, allow: &dyn Fn(usize) -> bool) -> Vec<(usize, f32)> {
    let mut out: Vec<(usize, f32)> = index
        .chunks_exact(COARSE_LEN)
        .enumerate()
        .filter(|(i, _)| allow(*i))
        .filter_map(|(i, face)| coarse_distance(target, face).map(|d| (i, d)))
        .collect();
    out.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)));
    out.truncate(top);
    out
}

/// Mean difference of two signatures, 0 (same shape) to 1.
pub fn signature_distance(a: &[u8; SIG_LEN], b: &[u8; SIG_LEN]) -> f32 {
    let mut sum = 0u32;
    for i in 0..SIG_LEN {
        sum += ((a[i] >> 4) as i32 - (b[i] >> 4) as i32).unsigned_abs();
        sum += ((a[i] & 15) as i32 - (b[i] & 15) as i32).unsigned_abs();
    }
    sum as f32 / (SIG_LEN as f32 * 2.0 * 15.0)
}

/// Mean signature difference over the characters both fonts draw, and how many there were.
/// `None` when they share none.
pub fn glyph_distance(a: &[(char, [u8; SIG_LEN])], b: &[(char, [u8; SIG_LEN])]) -> Option<(f32, usize)> {
    let (mut sum, mut n) = (0f32, 0usize);
    for (ca, sa) in a {
        if let Some((_, sb)) = b.iter().find(|(cb, _)| cb == ca) {
            sum += signature_distance(sa, sb);
            n += 1;
        }
    }
    (n > 0).then(|| (sum / n as f32, n))
}

/// What the editor shows for a match (words, never a number).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Closeness {
    Exact,
    VeryClose,
    Close,
    Loose,
}

/// Grades a match from its glyph distance, or from its coarse distance when no glyphs overlap.
pub fn closeness(glyph: Option<f32>, coarse: f32) -> Closeness {
    match glyph {
        Some(d) if d < 0.012 && coarse < 0.02 => Closeness::Exact,
        Some(d) if d < 0.05 => Closeness::VeryClose,
        Some(d) if d < 0.10 => Closeness::Close,
        Some(_) => Closeness::Loose,
        None if coarse < 0.02 => Closeness::VeryClose,
        None if coarse < 0.05 => Closeness::Close,
        None => Closeness::Loose,
    }
}

/// Serialises signatures for an index file: per glyph, the code point as u32 LE, then SIG_LEN bytes.
pub fn encode_signatures(glyphs: &[(char, [u8; SIG_LEN])]) -> Vec<u8> {
    let mut out = Vec::with_capacity(glyphs.len() * (4 + SIG_LEN));
    for (c, s) in glyphs {
        out.extend_from_slice(&(*c as u32).to_le_bytes());
        out.extend_from_slice(s);
    }
    out
}

/// Reads what [`encode_signatures`] wrote. Trailing partial records and bad code points are dropped.
pub fn decode_signatures(bytes: &[u8]) -> Vec<(char, [u8; SIG_LEN])> {
    bytes
        .chunks_exact(4 + SIG_LEN)
        .filter_map(|rec| {
            let c = char::from_u32(u32::from_le_bytes([rec[0], rec[1], rec[2], rec[3]]))?;
            let mut s = [0u8; SIG_LEN];
            s.copy_from_slice(&rec[4..]);
            Some((c, s))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A square-cornered test glyph: a rectangle from (x0, y0) to (x1, y1).
    fn rect(x0: f32, y0: f32, x1: f32, y1: f32) -> Vec<(f32, f32)> {
        vec![(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    }

    struct Fake(Vec<(char, Glyph)>);
    impl GlyphSource for Fake {
        fn glyph(&self, ch: char) -> Option<Glyph> {
            self.0.iter().find(|(c, _)| *c == ch).map(|(_, g)| g.clone())
        }
    }

    /// Letters made of bars: a stem `stem` wide, with feet when `serif`.
    fn bars(stem: f32, serif: bool, lean: f32) -> Fake {
        let upright = |h: f32, adv: f32| {
            let mut contours = vec![vec![(0.1, 0.0), (0.1 + stem, 0.0), (0.1 + stem + lean * h, h), (0.1 + lean * h, h)]];
            if serif {
                contours.push(rect(0.02, 0.0, 0.18 + stem, 0.04));
            }
            Glyph { advance: adv, contours }
        };
        Fake(vec![
            ('I', upright(0.7, 0.3)),
            ('l', upright(0.75, 0.25)),
            ('x', Glyph { advance: 0.5, contours: vec![rect(0.05, 0.0, 0.45, 0.5)] }),
        ])
    }

    #[test]
    fn spans_follow_winding() {
        // A ring: outer square counter-clockwise, inner square clockwise.
        let mut inner = rect(0.3, 0.3, 0.7, 0.7);
        inner.reverse();
        let g = Glyph { advance: 1.0, contours: vec![rect(0.0, 0.0, 1.0, 1.0), inner] };
        assert_eq!(g.row_spans(0.5), vec![(0.0, 0.3), (0.7, 1.0)]);
        assert_eq!(g.row_spans(0.1), vec![(0.0, 1.0)]);
        assert_eq!(g.column_spans(0.5), vec![(0.0, 0.3), (0.7, 1.0)]);
        assert!(g.row_spans(2.0).is_empty());
    }

    #[test]
    fn coarse_reads_heights_weight_serifs_and_slant() {
        let sans = fingerprint(&bars(0.08, false, 0.0));
        assert_eq!(sans.coarse[slot::X_HEIGHT], 127);
        assert_eq!(sans.coarse[slot::CAP_HEIGHT], 178);
        assert_eq!(sans.coarse[slot::DESCENDER], UNKNOWN);
        assert_eq!(sans.coarse[slot::SERIF], 0);
        let serif = fingerprint(&bars(0.08, true, 0.0));
        assert!(serif.coarse[slot::SERIF] > 100, "{}", serif.coarse[slot::SERIF]);
        let bold = fingerprint(&bars(0.16, false, 0.0));
        assert!(bold.coarse[slot::WEIGHT] > sans.coarse[slot::WEIGHT] + 40);
        let italic = fingerprint(&bars(0.08, false, 0.2));
        assert!(italic.coarse[slot::SLANT] > sans.coarse[slot::SLANT] + 40);
        assert_eq!(sans.coarse[slot::ADVANCES + 26 + 8], byte_of(0.3));
    }

    fn byte_of(advance: f32) -> u8 {
        (advance / 1.27 * 254.0).round() as u8
    }

    #[test]
    fn distance_ignores_what_either_side_lacks() {
        let a = fingerprint(&bars(0.08, false, 0.0));
        assert_eq!(coarse_distance(&a.coarse, &a.coarse), Some(0.0));
        let only_x = fingerprint_with(&bars(0.08, false, 0.0), &|c| c == 'x');
        // One measured height is too little to compare on.
        assert_eq!(coarse_distance(&a.coarse, &only_x.coarse), None);
        let bold = fingerprint(&bars(0.16, false, 0.0));
        assert!(coarse_distance(&a.coarse, &bold.coarse).unwrap() > 0.0);
    }

    #[test]
    fn rank_orders_by_distance_and_filters() {
        let fonts = [bars(0.16, true, 0.0), bars(0.08, false, 0.0), bars(0.09, false, 0.0)];
        let index: Vec<u8> = fonts.iter().flat_map(|f| fingerprint(f).coarse).collect();
        let target = fingerprint(&bars(0.08, false, 0.0)).coarse;
        let order: Vec<usize> = rank(&target, &index, 3, &|_| true).iter().map(|r| r.0).collect();
        assert_eq!(order, vec![1, 2, 0]);
        assert_eq!(rank(&target, &index, 3, &|i| i != 1)[0].0, 2);
        assert_eq!(rank(&target, &index, 1, &|_| true).len(), 1);
    }

    #[test]
    fn signatures_compare_shapes_and_round_trip() {
        let full = Glyph { advance: 1.0, contours: vec![rect(0.0, 0.0, 1.0, 1.0)] };
        let mut hole = rect(0.25, 0.25, 0.75, 0.75);
        hole.reverse();
        let ring = Glyph { advance: 1.0, contours: vec![rect(0.0, 0.0, 1.0, 1.0), hole] };
        let (a, b) = (measure::signature(&full), measure::signature(&ring));
        assert_eq!(a, [0xFF; SIG_LEN]);
        assert_eq!(signature_distance(&a, &a), 0.0);
        assert!((signature_distance(&a, &b) - 0.25).abs() < 0.01);
        let list = vec![('a', a), ('é', b)];
        assert_eq!(decode_signatures(&encode_signatures(&list)), list);
        assert_eq!(glyph_distance(&list, &[('é', b)]), Some((0.0, 1)));
        assert_eq!(glyph_distance(&list, &[('z', b)]), None);
    }

    #[test]
    fn closeness_words() {
        assert_eq!(closeness(Some(0.0), 0.0), Closeness::Exact);
        assert_eq!(closeness(Some(0.03), 0.03), Closeness::VeryClose);
        assert_eq!(closeness(Some(0.08), 0.2), Closeness::Close);
        assert_eq!(closeness(Some(0.3), 0.0), Closeness::Loose);
        assert_eq!(closeness(None, 0.04), Closeness::Close);
    }
}
