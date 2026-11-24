//! Measurements behind the coarse vector and the glyph signatures.

use crate::outline::Glyph;
use crate::{slot, COARSE_LEN, SIG_LEN, UNKNOWN};

/// Maps `v` from [lo, hi] to a byte 0–254 (255 is reserved for "not measured").
fn byte(v: f32, lo: f32, hi: f32) -> u8 {
    (((v - lo) / (hi - lo)).clamp(0.0, 1.0) * 254.0).round() as u8
}

fn median(mut v: Vec<f32>) -> Option<f32> {
    if v.is_empty() {
        return None;
    }
    v.sort_by(|a, b| a.total_cmp(b));
    Some(v[v.len() / 2])
}

fn mean(v: &[f32]) -> Option<f32> {
    (!v.is_empty()).then(|| v.iter().sum::<f32>() / v.len() as f32)
}

fn ink(spans: &[(f32, f32)]) -> f32 {
    spans.iter().map(|(a, b)| b - a).sum()
}

fn centre(spans: &[(f32, f32)]) -> Option<f32> {
    let total = ink(spans);
    (total > 0.0).then(|| spans.iter().map(|(a, b)| (b - a) * (a + b) / 2.0).sum::<f32>() / total)
}

struct Set<'a>(&'a [(char, Glyph)]);

impl<'a> Set<'a> {
    fn of(&self, chars: &'a str) -> impl Iterator<Item = &'a Glyph> + 'a {
        let all = self.0;
        // Shape measurements need ink: a widths-only glyph has an advance and nothing else.
        all.iter().filter(move |(c, g)| chars.contains(*c) && g.has_ink()).map(|(_, g)| g)
    }
}

/// Thick (row) and thin (column) stroke of a round letter, measured through its middle.
fn round_strokes(g: &Glyph) -> Option<(f32, f32)> {
    let (x0, y0, x1, y1) = g.bbox();
    let row = g.row_spans((y0 + y1) / 2.0);
    let col = g.column_spans((x0 + x1) / 2.0);
    // A bowl crosses the line twice: left and right walls, top and bottom arcs.
    (row.len() == 2 && col.len() == 2).then(|| (ink(&row) / 2.0, ink(&col) / 2.0))
}

/// Stem of an upright letter: the narrowest inked span on rows through its middle.
fn stem(g: &Glyph) -> Option<f32> {
    let (_, y0, _, y1) = g.bbox();
    let h = y1 - y0;
    [0.35, 0.5, 0.65].iter().filter_map(|f| g.row_spans(y0 + f * h).first().map(|(a, b)| b - a)).min_by(|a, b| a.total_cmp(b))
}

/// Foot-to-stem ratio of a letter that stands on stems: about 1 without serifs, 2 or more with.
fn serif_ratio(g: &Glyph) -> Option<f32> {
    let (_, y0, _, y1) = g.bbox();
    let h = y1 - y0;
    let foot = ink(&g.row_spans(y0 + 0.03 * h));
    let leg = ink(&g.row_spans(y0 + 0.25 * h));
    (leg > 0.0 && foot > 0.0).then(|| foot / leg)
}

/// Sideways drift per unit of height of a left-right symmetric letter (tangent of the slant).
fn slant(g: &Glyph) -> Option<f32> {
    let (_, y0, _, y1) = g.bbox();
    let h = y1 - y0;
    let lo = centre(&g.row_spans(y0 + 0.2 * h))?;
    let hi = centre(&g.row_spans(y0 + 0.8 * h))?;
    (h > 0.0).then(|| (hi - lo) / (0.6 * h))
}

pub fn coarse(glyphs: &[(char, Glyph)]) -> [u8; COARSE_LEN] {
    let mut out = [UNKNOWN; COARSE_LEN];
    let set = Set(glyphs);
    let top = |g: &Glyph| g.bbox().3;
    let bottom = |g: &Glyph| g.bbox().1;

    // Flat-topped letters give the true height; round ones overshoot a little, so they are the
    // second choice.
    let x_height = median(set.of("xvwz").map(top).collect()).or_else(|| median(set.of("aceomnrsu").map(top).collect()));
    let cap_height =
        median(set.of("HIEFTZXKLMNVWY").map(top).collect()).or_else(|| median(set.of("ABCDGOPQRSU").map(top).collect()));
    let ascender = set.of("bdfhkl").map(top).max_by(|a, b| a.total_cmp(b));
    let descender = set.of("gjpqy").map(bottom).min_by(|a, b| a.total_cmp(b));
    if let Some(v) = x_height {
        out[slot::X_HEIGHT] = byte(v, 0.0, 1.0);
    }
    if let Some(v) = cap_height {
        out[slot::CAP_HEIGHT] = byte(v, 0.0, 1.0);
    }
    if let Some(v) = ascender {
        out[slot::ASCENDER] = byte(v, 0.0, 1.2);
    }
    if let Some(v) = descender {
        out[slot::DESCENDER] = byte(-v, 0.0, 0.6);
    }

    let rounds: Vec<(f32, f32)> = set.of("oO0").filter_map(round_strokes).collect();
    let stems: Vec<f32> = set.of("lIiHTELFnhmrkKPNMU1").filter_map(stem).collect();
    let thick = median(stems.clone()).or_else(|| median(rounds.iter().map(|r| r.0).collect()));
    if let Some(v) = thick {
        out[slot::WEIGHT] = byte(v, 0.0, 0.3);
    }
    if let Some(v) = median(rounds.iter().filter(|r| r.0 > 0.0).map(|r| (r.1 / r.0).min(1.5)).collect()) {
        out[slot::CONTRAST] = byte(v, 0.0, 1.5);
    }
    if let Some(v) = median(set.of("IlHNMnhmrikKTPFf").filter_map(serif_ratio).collect()) {
        out[slot::SERIF] = byte(v, 1.0, 3.0);
    }
    if let Some(v) = median(set.of("IlHTOoMUVWXYAvwx08").filter_map(slant).collect()) {
        out[slot::SLANT] = byte(v, -0.2, 0.5);
    }

    let advances: Vec<f32> = glyphs.iter().filter(|(c, _)| c.is_ascii_alphabetic()).map(|(_, g)| g.advance).collect();
    if advances.len() >= 4 {
        let m = mean(&advances).unwrap_or(0.0);
        let spread = advances.iter().map(|a| (a - m).abs()).fold(0f32, f32::max);
        out[slot::MONOSPACE] = if m > 0.0 && spread < 0.005 { 254 } else { 0 };
    }
    let lower: Vec<f32> = glyphs.iter().filter(|(c, _)| c.is_ascii_lowercase()).map(|(_, g)| g.advance).collect();
    let upper: Vec<f32> = glyphs.iter().filter(|(c, _)| c.is_ascii_uppercase()).map(|(_, g)| g.advance).collect();
    // A mean over a handful of letters says more about which letters than about the font.
    if lower.len() >= 8 {
        out[slot::LOWER_WIDTH] = byte(mean(&lower).unwrap_or(0.0), 0.0, 1.0);
    }
    if upper.len() >= 8 {
        out[slot::UPPER_WIDTH] = byte(mean(&upper).unwrap_or(0.0), 0.0, 1.2);
    }
    let aspect: Vec<f32> = set
        .of("oO")
        .filter_map(|g| {
            let (x0, y0, x1, y1) = g.bbox();
            (y1 > y0).then(|| (x1 - x0) / (y1 - y0))
        })
        .collect();
    if let Some(v) = mean(&aspect) {
        out[slot::ROUND_ASPECT] = byte(v, 0.3, 1.5);
    }

    for (c, g) in glyphs {
        let i = match c {
            'a'..='z' => *c as usize - 'a' as usize,
            'A'..='Z' => 26 + *c as usize - 'A' as usize,
            _ => continue,
        };
        out[slot::ADVANCES + i] = byte(g.advance, 0.0, 1.27);
    }
    out
}

const GRID: usize = 8;
const SUB: usize = 4;

/// The glyph's ink over its own bounding box as an 8 by 8 grid of 4-bit coverage, top row first.
pub fn signature(g: &Glyph) -> [u8; SIG_LEN] {
    let mut cover = [0f32; GRID * GRID];
    let (x0, y0, x1, y1) = g.bbox();
    let (w, h) = (x1 - x0, y1 - y0);
    if w > 0.0 && h > 0.0 {
        let cell = w / GRID as f32;
        for r in 0..GRID * SUB {
            let y = y1 - (r as f32 + 0.5) * h / (GRID * SUB) as f32;
            for (a, b) in g.row_spans(y) {
                for col in 0..GRID {
                    let (c0, c1) = (x0 + col as f32 * cell, x0 + (col + 1) as f32 * cell);
                    let overlap = (b.min(c1) - a.max(c0)).max(0.0);
                    cover[(r / SUB) * GRID + col] += overlap / cell / SUB as f32;
                }
            }
        }
    }
    let mut out = [0u8; SIG_LEN];
    for (i, pair) in cover.chunks_exact(2).enumerate() {
        let q = |v: f32| (v.clamp(0.0, 1.0) * 15.0).round() as u8;
        out[i] = q(pair[0]) << 4 | q(pair[1]);
    }
    out
}
