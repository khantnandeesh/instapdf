//! Text shaping with rustybuzz (a Rust port of HarfBuzz): turns a word into positioned glyphs
//! of a font, in visual order, with the script's reordering, conjuncts, joining and marks.

#[cfg(feature = "shaping")]
use rustybuzz::{Direction, UnicodeBuffer};

/// One shaped glyph. Lengths are in em (1.0 = the font size).
#[derive(Clone, Debug, PartialEq)]
pub struct Shaped {
    pub gid: u16,
    /// Byte offset in the shaped text of the cluster this glyph belongs to.
    pub cluster: u32,
    pub advance: f64,
    pub x_offset: f64,
    pub y_offset: f64,
}

/// Characters that need no glyph of their own (joiners, direction marks).
pub fn is_ignorable(ch: char) -> bool {
    matches!(ch, '\u{200B}'..='\u{200F}' | '\u{2060}' | '\u{FEFF}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')
}

/// True when the font's cmap has every character of `text` (ignorable ones aside).
pub fn covers(data: &[u8], text: &str) -> bool {
    let Ok(face) = ttf_parser::Face::parse(data, 0) else { return false };
    text.chars().all(|c| is_ignorable(c) || face.glyph_index(c).is_some_and(|g| g.0 != 0))
}

/// True when the font has the layout tables needed to shape this text (GSUB for scripts that
/// change glyphs; simple scripts shape without them).
pub fn can_shape(data: &[u8], text: &str) -> bool {
    let Ok(face) = ttf_parser::Face::parse(data, 0) else { return false };
    let needs_gsub = text.chars().any(|c| crate::script::is_complex(c) && !crate::script::is_digit(c));
    !needs_gsub || face.tables().gsub.is_some()
}

#[cfg(feature = "shaping")]
/// Shapes `text` with the font in `data`. Returns `None` when the font cannot be read or a
/// glyph is missing (`.notdef`).
pub fn shape(data: &[u8], text: &str, rtl: bool) -> Option<Vec<Shaped>> {
    let face = rustybuzz::Face::from_slice(data, 0)?;
    let upem = face.units_per_em() as f64;
    let mut buf = UnicodeBuffer::new();
    buf.push_str(text);
    buf.guess_segment_properties();
    buf.set_direction(if rtl { Direction::RightToLeft } else { Direction::LeftToRight });
    // Arabic: keep dotted letters whole (no `ccmp` decomposition into a base and its dots), so
    // every glyph stands for a letter and text extraction from glyphs alone reads right, as in
    // files from word processors.
    let arabic = text.chars().any(|c| crate::script::script(c) == crate::script::Script::Arabic);
    let features =
        if arabic { vec![rustybuzz::Feature::new(rustybuzz::ttf_parser::Tag::from_bytes(b"ccmp"), 0, ..)] } else { vec![] };
    let out = rustybuzz::shape(&face, &features, buf);
    let mut glyphs = Vec::with_capacity(out.len());
    for (info, pos) in out.glyph_infos().iter().zip(out.glyph_positions()) {
        if info.glyph_id == 0 {
            return None;
        }
        glyphs.push(Shaped {
            gid: info.glyph_id as u16,
            cluster: info.cluster,
            advance: pos.x_advance as f64 / upem,
            x_offset: pos.x_offset as f64 / upem,
            y_offset: pos.y_offset as f64 / upem,
        });
    }
    Some(glyphs)
}

/// Splits shaped glyphs into clusters and gives each glyph the text it stands for: the widest
/// glyph of a cluster (its base: dots and marks have no advance) gets the cluster's text, the
/// others none.
pub fn cluster_texts(text: &str, glyphs: &[Shaped]) -> Vec<String> {
    let mut starts: Vec<u32> = glyphs.iter().map(|g| g.cluster).collect();
    starts.sort_unstable();
    starts.dedup();
    let end_of = |c: u32| starts.iter().find(|&&s| s > c).map(|&s| s as usize).unwrap_or(text.len());
    let mut seen: Vec<u32> = Vec::new();
    let mut out = vec![String::new(); glyphs.len()];
    // By cluster, widest first, then as drawn.
    let mut order: Vec<usize> = (0..glyphs.len()).collect();
    order.sort_by(|&a, &b| {
        glyphs[a].cluster.cmp(&glyphs[b].cluster).then(glyphs[b].advance.total_cmp(&glyphs[a].advance)).then(a.cmp(&b))
    });
    for i in order {
        let c = glyphs[i].cluster;
        if !seen.contains(&c) {
            seen.push(c);
            out[i] = text.get(c as usize..end_of(c)).unwrap_or("").to_string();
        }
    }
    out
}

/// Like [`cluster_texts`], but a mark the font draws with its own glyph (Arabic harakat, Hebrew
/// points) keeps its own character, so the base glyph maps to the bare letter. The same letter
/// with and without a mark then shares one Unicode mapping. `gid_of` is the font's cmap.
pub fn mark_split_texts(text: &str, glyphs: &[Shaped], gid_of: impl Fn(char) -> Option<u16>) -> Vec<String> {
    let mut out = cluster_texts(text, glyphs);
    for i in 0..glyphs.len() {
        let mut rest: Vec<char> = out[i].chars().collect();
        if rest.len() != 2 {
            continue;
        }
        // Only a single mark glyph: with several, readers disagree on their order.
        let others: Vec<usize> = (0..glyphs.len()).filter(|&j| j != i && glyphs[j].cluster == glyphs[i].cluster).collect();
        let [j] = others[..] else { continue };
        let own = rest.iter().position(|&c| crate::script::is_any_mark(c) && gid_of(c) == Some(glyphs[j].gid));
        if let Some(k) = own {
            out[j] = rest.remove(k).to_string();
        }
        out[i] = rest.into_iter().collect();
    }
    out
}

#[cfg(all(test, feature = "shaping"))]
mod tests {
    use super::*;

    fn font(name: &str) -> Vec<u8> {
        std::fs::read(format!("{}/../../tests/parity/editor/fonts/{name}", env!("CARGO_MANIFEST_DIR"))).unwrap()
    }

    #[test]
    fn devanagari_conjunct_and_matra() {
        let f = font("NotoSansDevanagari-Regular.ttf");
        // "कि": the vowel sign is drawn first, before the consonant.
        let g = shape(&f, "कि", false).unwrap();
        assert_eq!(g.len(), 2);
        let texts = cluster_texts("कि", &g);
        assert_eq!(texts.concat(), "कि");
        // "क्ष" is one conjunct glyph.
        assert_eq!(shape(&f, "क्ष", false).unwrap().len(), 1);
        assert!(covers(&f, "राशि") && can_shape(&f, "राशि"));
    }

    #[test]
    fn arabic_joins_right_to_left() {
        let f = font("NotoNaskhArabic-Regular.ttf");
        let g = shape(&f, "سلام", true).unwrap();
        // Visual order: the last letter comes first.
        assert_eq!(g.first().unwrap().cluster as usize, "سلا".len());
        assert!(!covers(&f, "(x)"));
    }
}
