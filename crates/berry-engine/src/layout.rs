//! Groups glyphs into lines, style runs, words and paragraphs.
//!
//! A *line* is what one edit acts on: glyphs on one baseline without a column-sized gap.
//! Gaps made by positioning (justified text, word-by-word placement) become *virtual* spaces:
//! they read as a space but have no glyph, so an edit keeps the gap instead of collapsing it.

use crate::geom::Rect;
use crate::interp::{Glyph, PageContent};
use serde::Serialize;

/// A gap wider than this many font sizes starts a new line (columns, table cells).
const COLUMN_GAP: f64 = 1.5;
/// A gap wider than this many font sizes reads as a space.
const SPACE_GAP: f64 = 0.18;

/// One character of a line's text.
#[derive(Clone, Debug)]
pub struct LineChar {
    pub text: String,
    /// The glyph that draws it; `None` for a virtual space.
    pub glyph: Option<usize>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Run {
    /// Character range `[start, end)` in the line's `chars`.
    pub start: usize,
    pub end: usize,
    pub text: String,
    /// Index into the page's font list.
    pub font: usize,
    pub size: f64,
    pub color: [u8; 3],
    pub bbox: Rect,
}

#[derive(Clone, Debug, Serialize)]
pub struct Word {
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub bbox: Rect,
}

#[derive(Clone, Debug, Serialize)]
pub struct Line {
    pub id: usize,
    pub text: String,
    pub bbox: Rect,
    /// Baseline start in page space.
    pub origin: (f64, f64),
    /// Baseline direction in degrees (0 = left to right).
    pub angle: f64,
    /// Font size of the first glyph, in page units.
    pub size: f64,
    pub runs: Vec<Run>,
    pub words: Vec<Word>,
    pub editable: bool,
    /// Why the line is read-only, when it is.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_only_reason: Option<&'static str>,
    /// Index into the page's paragraphs.
    pub paragraph: usize,
    #[serde(skip)]
    pub chars: Vec<LineChar>,
    /// Glyph indices in reading order.
    #[serde(skip)]
    pub glyphs: Vec<usize>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Paragraph {
    pub lines: Vec<usize>,
    pub bbox: Rect,
}

fn rot(p: (f64, f64), a: f64) -> (f64, f64) {
    let (s, c) = a.sin_cos();
    (p.0 * c - p.1 * s, p.0 * s + p.1 * c)
}

fn glyph_box(pc: &PageContent, g: &Glyph) -> Rect {
    let f = &pc.fonts[g.font];
    let (u, v) = rot(g.origin, -g.angle);
    let lo = v + f.descent / 1000.0 * g.size;
    let hi = v + f.ascent / 1000.0 * g.size;
    let pts: Vec<(f64, f64)> =
        [(u, lo), (u + g.width, lo), (u, hi), (u + g.width, hi)].iter().map(|&p| rot(p, g.angle)).collect();
    Rect::from_points(&pts)
}

/// A glyph's box including its full advance (character and word spacing), in page space.
pub fn glyph_rect(pc: &PageContent, g: &Glyph) -> Rect {
    let f = &pc.fonts[g.font];
    let (u, v) = rot(g.origin, -g.angle);
    let lo = v + f.descent.min(0.0) / 1000.0 * g.size;
    let hi = v + f.ascent.max(0.0) / 1000.0 * g.size;
    let (u0, u1) = (u.min(u + g.advance).min(u + g.width), u.max(u + g.advance).max(u + g.width));
    let pts: Vec<(f64, f64)> = [(u0, lo), (u1, lo), (u0, hi), (u1, hi)].iter().map(|&p| rot(p, g.angle)).collect();
    Rect::from_points(&pts)
}

fn boxes(pc: &PageContent, chars: &[LineChar]) -> Option<Rect> {
    chars.iter().filter_map(|c| c.glyph).map(|g| glyph_box(pc, &pc.glyphs[g])).reduce(|a, b| a.union(&b))
}

fn build_line(pc: &PageContent, id: usize, glyphs: Vec<usize>) -> Line {
    let mut chars: Vec<LineChar> = Vec::new();
    let mut prev_end: Option<f64> = None;
    for &gi in &glyphs {
        let g = &pc.glyphs[gi];
        let u = rot(g.origin, -g.angle).0;
        let text = if g.text.is_empty() { "\u{fffd}".to_string() } else { g.text.clone() };
        if let Some(pe) = prev_end {
            let prev_space = chars.last().map(|c| c.text.ends_with(char::is_whitespace)).unwrap_or(true);
            if u - pe > SPACE_GAP * g.size && !prev_space && !text.starts_with(char::is_whitespace) {
                chars.push(LineChar { text: " ".into(), glyph: None });
            }
        }
        chars.push(LineChar { text, glyph: Some(gi) });
        prev_end = Some(u + g.width);
    }

    let first = &pc.glyphs[glyphs[0]];
    let style = |c: &LineChar| {
        c.glyph.map(|g| {
            let g = &pc.glyphs[g];
            (g.font, (g.size * 100.0).round() as i64, g.color)
        })
    };
    let mut runs: Vec<Run> = Vec::new();
    let mut start = 0;
    let mut cur = style(&chars[0]);
    for i in 1..=chars.len() {
        // A virtual space joins the run before it.
        let s = if i < chars.len() { style(&chars[i]).or(cur) } else { None };
        if i == chars.len() || s != cur {
            if let (Some((font, _, color)), Some(bbox)) = (cur, boxes(pc, &chars[start..i])) {
                let size = chars[start..i].iter().find_map(|c| c.glyph).map(|g| pc.glyphs[g].size).unwrap_or(0.0);
                runs.push(Run {
                    start,
                    end: i,
                    text: chars[start..i].iter().map(|c| c.text.as_str()).collect(),
                    font,
                    size,
                    color,
                    bbox,
                });
            }
            start = i;
            cur = s;
        }
    }

    let mut words = Vec::new();
    let mut ws: Option<usize> = None;
    for i in 0..=chars.len() {
        let blank = i == chars.len() || chars[i].text.chars().all(char::is_whitespace);
        match (blank, ws) {
            (false, None) => ws = Some(i),
            (true, Some(s)) => {
                if let Some(bbox) = boxes(pc, &chars[s..i]) {
                    words.push(Word { start: s, end: i, text: chars[s..i].iter().map(|c| c.text.as_str()).collect(), bbox });
                }
                ws = None;
            }
            _ => {}
        }
    }

    let mut reason = None;
    for &gi in &glyphs {
        let g = &pc.glyphs[gi];
        let f = &pc.fonts[g.font];
        if f.vertical {
            reason = Some("vertical-text");
        } else if !f.cmap_supported {
            reason = Some("unsupported-encoding");
        } else if g.render_mode == 3 {
            reason = Some("invisible-text");
        }
    }
    let bbox = boxes(pc, &chars).unwrap_or(Rect { x0: 0.0, y0: 0.0, x1: 0.0, y1: 0.0 });
    Line {
        id,
        text: chars.iter().map(|c| c.text.as_str()).collect(),
        bbox,
        origin: first.origin,
        angle: first.angle.to_degrees(),
        size: first.size,
        runs,
        words,
        editable: reason.is_none(),
        read_only_reason: reason,
        paragraph: 0,
        chars,
        glyphs,
    }
}

/// Groups a page's glyphs. Returns lines in reading order (top to bottom, then left to right)
/// and the paragraphs they form.
pub fn group(pc: &PageContent) -> (Vec<Line>, Vec<Paragraph>) {
    // Key: (invisible, angle bucket), then position in the rotated frame.
    struct Item {
        gi: usize,
        key: (bool, i64),
        u: f64,
        v: f64,
        size: f64,
    }
    let mut items: Vec<Item> = pc
        .glyphs
        .iter()
        .enumerate()
        .filter(|(_, g)| g.size > 0.01 && g.origin.0.is_finite() && g.origin.1.is_finite())
        .map(|(gi, g)| {
            let (u, v) = rot(g.origin, -g.angle);
            Item { gi, key: (g.render_mode == 3, (g.angle.to_degrees() * 2.0).round() as i64), u, v, size: g.size }
        })
        .collect();
    items.sort_by(|a, b| a.key.cmp(&b.key).then(b.v.total_cmp(&a.v)).then(a.u.total_cmp(&b.u)));

    let mut lines: Vec<Line> = Vec::new();
    let mut i = 0;
    while i < items.len() {
        // One baseline: same key and nearly the same v.
        let mut j = i + 1;
        while j < items.len()
            && items[j].key == items[i].key
            && (items[i].v - items[j].v).abs() <= (0.12 * items[i].size.min(items[j].size)).max(0.3)
        {
            j += 1;
        }
        let mut row: Vec<&Item> = items[i..j].iter().collect();
        row.sort_by(|a, b| a.u.total_cmp(&b.u));
        let mut cur: Vec<usize> = Vec::new();
        let mut prev_end = f64::NEG_INFINITY;
        for it in row {
            let g = &pc.glyphs[it.gi];
            if !cur.is_empty() && it.u - prev_end > COLUMN_GAP * it.size {
                lines.push(build_line(pc, lines.len(), std::mem::take(&mut cur)));
            }
            cur.push(it.gi);
            prev_end = prev_end.max(it.u + g.width);
        }
        if !cur.is_empty() {
            lines.push(build_line(pc, lines.len(), cur));
        }
        i = j;
    }

    // Paragraphs: consecutive lines with the same direction and size, overlapping horizontally,
    // spaced like body text.
    let mut paragraphs: Vec<Paragraph> = Vec::new();
    for li in 0..lines.len() {
        let line = &lines[li];
        let mut home = None;
        for (pi, p) in paragraphs.iter().enumerate().rev().take(8) {
            let last = &lines[*p.lines.last().unwrap()];
            if (last.angle - line.angle).abs() > 0.5 || (last.size - line.size).abs() > 0.05 * line.size {
                continue;
            }
            let a = line.angle.to_radians();
            let dv = rot(last.origin, -a).1 - rot(line.origin, -a).1;
            if dv < 0.8 * line.size || dv > 1.7 * line.size {
                continue;
            }
            if p.lines.len() >= 2 {
                let prev = &lines[p.lines[p.lines.len() - 2]];
                let lead = rot(prev.origin, -a).1 - rot(last.origin, -a).1;
                if (lead - dv).abs() > 0.1 * lead.abs().max(1.0) {
                    continue;
                }
            }
            let overlap = last.bbox.x1.min(line.bbox.x1) - last.bbox.x0.max(line.bbox.x0);
            let narrow = (last.bbox.x1 - last.bbox.x0).min(line.bbox.x1 - line.bbox.x0);
            if a.abs() < 0.01 && overlap < 0.5 * narrow {
                continue;
            }
            home = Some(pi);
            break;
        }
        match home {
            Some(pi) => {
                paragraphs[pi].lines.push(li);
                paragraphs[pi].bbox = paragraphs[pi].bbox.union(&line.bbox);
                lines[li].paragraph = pi;
            }
            None => {
                paragraphs.push(Paragraph { lines: vec![li], bbox: line.bbox });
                lines[li].paragraph = paragraphs.len() - 1;
            }
        }
    }
    (lines, paragraphs)
}
