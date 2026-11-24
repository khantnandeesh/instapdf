//! Groups glyphs into lines, style runs, words and paragraphs.
//!
//! A *line* is what one edit acts on: glyphs on one baseline without a column-sized gap.
//! Gaps made by positioning (justified text, word-by-word placement) become *virtual* spaces:
//! they read as a space but have no glyph, so an edit keeps the gap instead of collapsing it.

use crate::geom::Rect;
use crate::interp::{Glyph, PageContent};
use crate::script;
use serde::Serialize;
use std::collections::HashMap;

/// A gap wider than this many font sizes starts a new line (columns, table cells).
const COLUMN_GAP: f64 = 1.5;
/// A gap wider than this many font sizes reads as a space.
const SPACE_GAP: f64 = 0.18;

/// One character of a line's text.
#[derive(Clone, Debug)]
pub struct LineChar {
    pub text: String,
    /// The glyph where it starts on the baseline; `None` for a virtual space.
    pub glyph: Option<usize>,
    /// Every glyph that draws it (a cluster: ActualText span, base with marks, Indic syllable).
    pub glyphs: Vec<usize>,
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
    /// Reading direction: "rtl" when the line is mostly right-to-left script.
    pub direction: &'static str,
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
    /// Glyph indices in logical order.
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
    chars.iter().flat_map(|c| c.glyphs.iter()).map(|&g| glyph_box(pc, &pc.glyphs[g])).reduce(|a, b| a.union(&b))
}

/// Glyphs drawn as one unit: an `/ActualText` span, or a base glyph with the marks on it.
#[derive(Clone, Debug)]
struct Cluster {
    glyphs: Vec<usize>,
    /// The glyph whose baseline the cluster sits on (the widest one).
    base: usize,
    text: String,
    /// Text comes from `/ActualText`: marks drawn on it add no text.
    actual: bool,
    key: (bool, i64),
    u0: f64,
    u1: f64,
    v: f64,
    size: f64,
}

impl Cluster {
    fn new(pc: &PageContent, glyphs: Vec<usize>, text: String, actual: bool) -> Cluster {
        // The base is the widest glyph that draws a letter (dots and marks can sit off the
        // baseline), else the widest glyph.
        let letter = |g: &usize| !mark_like(&pc.glyphs[*g].text);
        let widest = |a: &&usize, b: &&usize| pc.glyphs[**a].width.total_cmp(&pc.glyphs[**b].width).then(b.cmp(a));
        let base = *glyphs
            .iter()
            .filter(|g| letter(g))
            .max_by(widest)
            .or_else(|| glyphs.iter().max_by(widest))
            .expect("a cluster has a glyph");
        let g = &pc.glyphs[base];
        let (_, v) = rot(g.origin, -g.angle);
        let mut c = Cluster {
            glyphs,
            base,
            text,
            actual,
            key: (g.render_mode == 3, (g.angle.to_degrees() * 2.0).round() as i64),
            u0: f64::INFINITY,
            u1: f64::NEG_INFINITY,
            v,
            size: g.size,
        };
        c.extend(pc);
        c
    }

    fn extend(&mut self, pc: &PageContent) {
        for &gi in &self.glyphs {
            let g = &pc.glyphs[gi];
            let u = rot(g.origin, -pc.glyphs[self.base].angle).0;
            self.u0 = self.u0.min(u).min(u + g.width);
            self.u1 = self.u1.max(u + g.width).max(u);
        }
    }

    /// The glyph that starts the cluster on the baseline (leftmost, then first drawn).
    fn start(&self, pc: &PageContent) -> usize {
        let a = pc.glyphs[self.base].angle;
        *self
            .glyphs
            .iter()
            .min_by(|x, y| rot(pc.glyphs[**x].origin, -a).0.total_cmp(&rot(pc.glyphs[**y].origin, -a).0).then(x.cmp(y)))
            .unwrap()
    }
}

/// Glyphs that draw no text of their own: unmapped glyphs (dots, ligature halves) and marks.
fn mark_like(text: &str) -> bool {
    text.is_empty() || text.chars().all(script::is_mark)
}

/// Builds clusters: one per usable ActualText span, one per other glyph, then attaches marks to
/// the cluster they are drawn on.
fn clusters(pc: &PageContent) -> Vec<Cluster> {
    let usable = |g: &Glyph| g.size > 0.01 && g.origin.0.is_finite() && g.origin.1.is_finite();
    let mut by_span: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut loose: Vec<usize> = Vec::new();
    for (gi, g) in pc.glyphs.iter().enumerate() {
        if !usable(g) {
            continue;
        }
        match g.span {
            Some(s) => by_span.entry(s).or_default().push(gi),
            None => loose.push(gi),
        }
    }
    let mut out: Vec<Cluster> = Vec::new();
    let mut spans: Vec<(usize, Vec<usize>)> = by_span.into_iter().collect();
    spans.sort_by_key(|(_, g)| g[0]);
    for (s, glyphs) in spans {
        let c = Cluster::new(pc, glyphs.clone(), script::fold_presentation(&pc.spans[s].text), true);
        // A span that runs over several baselines or directions is not one cluster: read its
        // glyphs one by one instead.
        let one_line = glyphs.iter().all(|&gi| {
            let g = &pc.glyphs[gi];
            let (_, v) = rot(g.origin, -pc.glyphs[c.base].angle);
            (v - c.v).abs() <= c.size && (g.angle - pc.glyphs[c.base].angle).abs() < 0.01
        });
        if one_line {
            out.push(c);
        } else {
            loose.extend(glyphs);
        }
    }
    let mut marks: Vec<usize> = Vec::new();
    for gi in loose {
        let g = &pc.glyphs[gi];
        if mark_like(&g.text) {
            marks.push(gi);
        } else {
            out.push(Cluster::new(pc, vec![gi], script::fold_presentation(&g.text), false));
        }
    }
    // Marks: the cluster on the same baseline (within an em) that overlaps them most.
    let mut by_key: HashMap<(bool, i64), Vec<usize>> = HashMap::new();
    for (ci, c) in out.iter().enumerate() {
        by_key.entry(c.key).or_default().push(ci);
    }
    for cs in by_key.values_mut() {
        cs.sort_by(|a, b| out[*a].u0.total_cmp(&out[*b].u0));
    }
    let mut leftovers: Vec<usize> = Vec::new();
    for gi in marks {
        let g = &pc.glyphs[gi];
        let key = (g.render_mode == 3, (g.angle.to_degrees() * 2.0).round() as i64);
        let (u, v) = rot(g.origin, -g.angle);
        // Where the mark's ink is: marks often have no advance and draw left of their origin.
        let font = &pc.fonts[g.font];
        // Font units to page units along the baseline, horizontal scaling included.
        let fw = font.width(g.code) / 1000.0 * g.size;
        let stretch = if fw > 0.0 && g.width > 0.0 { g.width / fw } else { 1.0 };
        let scale = g.size / 1000.0 * stretch;
        let (m0, m1) = match font.ink_x(g.code) {
            Some((x0, x1)) if x1 > x0 => (u + x0 * scale, u + x1 * scale),
            // No outline to measure: a zero-width mark belongs to the glyph before its origin.
            _ if g.width.abs() < 1e-6 => (u - 0.02 * g.size, u - 0.01 * g.size),
            _ => (u.min(u + g.width), u.max(u + g.width).max(u + 0.01)),
        };
        let mut best: Option<(f64, usize)> = None;
        if let Some(cs) = by_key.get(&key) {
            // Only clusters that can reach the mark horizontally.
            // A window bounded by the mark's own size: monotone along the sorted clusters, and
            // one huge glyph elsewhere on the page does not widen it.
            let reach = 4.0 * g.size;
            let lo = cs.partition_point(|&ci| out[ci].u0 < m0 - reach);
            for &ci in &cs[lo..] {
                let c = &out[ci];
                if c.u0 > m1 + reach {
                    break;
                }
                if c.u0 > m1 + 0.3 * c.size {
                    continue;
                }
                if (c.v - v).abs() > 0.9 * c.size.max(g.size) {
                    continue;
                }
                let overlap = m1.min(c.u1) - m0.max(c.u0);
                let gap = if overlap > 0.0 { -overlap } else { (m0 - c.u1).max(c.u0 - m1) };
                if gap > 0.15 * c.size {
                    continue;
                }
                if best.map(|(b, _)| gap < b).unwrap_or(true) {
                    best = Some((gap, ci));
                }
            }
        }
        match best {
            Some((_, ci)) => {
                let c = &mut out[ci];
                c.glyphs.push(gi);
                c.glyphs.sort_unstable();
                if !c.actual {
                    c.text.push_str(&g.text);
                }
                c.extend(pc);
            }
            None => leftovers.push(gi),
        }
    }
    for gi in leftovers {
        let t = &pc.glyphs[gi].text;
        let text = if t.is_empty() { "\u{fffd}".to_string() } else { t.clone() };
        out.push(Cluster::new(pc, vec![gi], text, false));
    }
    // A cluster's own marks follow its base in text order (base text first).
    out
}

/// One unit of a line before it becomes a [`LineChar`].
#[derive(Clone, Debug)]
struct Unit {
    text: String,
    /// Text from ActualText: already logical, never mirrored.
    actual: bool,
    glyphs: Vec<usize>,
    start: Option<usize>,
    u0: f64,
    u1: f64,
}

/// Puts Indic text drawn in visual order back in logical order: a pre-base vowel sign moves
/// after its consonant cluster and a reph moves before the syllable it sits on. Units that
/// already read logically (ActualText) never match.
fn indic_logical(units: &mut Vec<Unit>, size: f64) {
    let first = |u: &Unit| u.text.chars().next();
    let last = |u: &Unit| u.text.chars().last();
    let joins = |a: &Unit, b: &Unit| {
        last(a).map(script::is_virama).unwrap_or(false)
            || first(b).map(script::is_virama).unwrap_or(false)
            || first(b) == Some('\u{093C}')
    };
    let mut i = 0;
    while i < units.len() {
        let u = &units[i];
        let is_matra = first(u).map(script::is_prebase_matra).unwrap_or(false) && u.text.chars().all(script::is_any_mark);
        if is_matra && i + 1 < units.len() && first(&units[i + 1]).map(script::is_indic_letter).unwrap_or(false) {
            let mut k = i + 1;
            while k + 1 < units.len() && joins(&units[k], &units[k + 1]) {
                k += 1;
            }
            let mut cons: String = units[i + 1..=k].iter().map(|u| u.text.as_str()).collect();
            // Bindus and visarga come after the vowel sign.
            let mut tail = String::new();
            while cons.chars().last().is_some_and(|c| matches!(c as u32 & 0x7F, 0x00..=0x03) && script::is_indic(c)) {
                tail.insert(0, cons.pop().unwrap());
            }
            let merged = Unit {
                actual: false,
                text: format!("{cons}{}{tail}", units[i].text),
                glyphs: units[i..=k].iter().flat_map(|u| u.glyphs.iter().copied()).collect(),
                start: units[i].start,
                u0: units[i..=k].iter().map(|u| u.u0).fold(f64::INFINITY, f64::min),
                u1: units[i..=k].iter().map(|u| u.u1).fold(f64::NEG_INFINITY, f64::max),
            };
            units.splice(i..=k, [merged]);
        }
        i += 1;
    }
    let mut i = 1;
    while i < units.len() {
        let chars: Vec<char> = units[i].text.chars().collect();
        let is_reph = chars.len() == 2 && script::is_ra(chars[0]) && script::is_virama(chars[1]);
        // A reph sits on the syllable before it; a half-form RA has its own width and comes first.
        let sits_on_previous = units[i].u0 < units[i - 1].u1 - 0.02 * size || units[i].u1 - units[i].u0 < 0.15 * size;
        let next_is_letter = units.get(i + 1).and_then(first).map(script::is_indic_letter).unwrap_or(false);
        if is_reph && sits_on_previous && !(next_is_letter && units[i].u1 - units[i].u0 >= 0.15 * size) {
            let mut s = i - 1;
            while s > 0
                && (first(&units[s]).map(script::is_virama).unwrap_or(false)
                    || last(&units[s - 1]).map(script::is_virama).unwrap_or(false)
                    || units[s].text.chars().all(script::is_any_mark))
            {
                s -= 1;
            }
            if first(&units[s]).map(script::is_indic_letter).unwrap_or(false) {
                let merged = Unit {
                    actual: false,
                    text: format!("{}{}", units[i].text, units[s..i].iter().map(|u| u.text.as_str()).collect::<String>()),
                    glyphs: units[s..=i].iter().flat_map(|u| u.glyphs.iter().copied()).collect(),
                    start: units[s].start,
                    u0: units[s..=i].iter().map(|u| u.u0).fold(f64::INFINITY, f64::min),
                    u1: units[s..=i].iter().map(|u| u.u1).fold(f64::NEG_INFINITY, f64::max),
                };
                units.splice(s..=i, [merged]);
                i = s + 1;
                continue;
            }
        }
        i += 1;
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Class {
    R,
    L,
    D,
    N,
}

fn class_of(text: &str) -> Class {
    for c in text.chars() {
        if script::is_rtl(c) {
            return Class::R;
        }
        if script::is_ltr(c) {
            return Class::L;
        }
        if script::is_digit(c) {
            return Class::D;
        }
    }
    Class::N
}

/// Puts a right-to-left line drawn in visual order into logical order (the inverse of the
/// Unicode bidi reordering). Returns true when the line reads right to left.
fn bidi_logical(pc: &PageContent, units: &mut Vec<Unit>, reversed_hint: bool) -> bool {
    let mut cls: Vec<Class> = units.iter().map(|u| class_of(&u.text)).collect();
    let n_r = cls.iter().filter(|c| **c == Class::R).count();
    if n_r == 0 {
        return false;
    }
    let n_l = cls.iter().filter(|c| **c == Class::L).count();
    let rtl = reversed_hint || n_r >= n_l;
    // Separators between digits are part of the number (1,000 and 2.5).
    for i in 1..cls.len().saturating_sub(1) {
        if cls[i] == Class::N
            && cls[i - 1] == Class::D
            && cls[i + 1] == Class::D
            && units[i].text.chars().all(|c| matches!(c, ',' | '.' | '\u{66B}' | '\u{66C}' | '/' | ':'))
        {
            cls[i] = Class::D;
        }
    }
    let strong = |i: isize, step: isize, cls: &[Class]| -> Option<Class> {
        let mut k = i;
        while k >= 0 && (k as usize) < cls.len() {
            match cls[k as usize] {
                Class::N => {}
                Class::D if !rtl => {}
                c => return Some(c),
            }
            k += step;
        }
        None
    };
    let n = units.len();
    let mut level = vec![0u8; n];
    for i in 0..n {
        level[i] = match cls[i] {
            Class::R => 1,
            Class::L => {
                if rtl {
                    2
                } else {
                    0
                }
            }
            Class::D => {
                if rtl {
                    2
                } else {
                    // In a left-to-right line a number belongs to Arabic text around it.
                    let l = strong(i as isize - 1, -1, &cls);
                    let r = strong(i as isize + 1, 1, &cls);
                    if matches!((l, r), (Some(Class::R), Some(Class::R)) | (Some(Class::R), None) | (None, Some(Class::R))) {
                        2
                    } else {
                        0
                    }
                }
            }
            Class::N => 255,
        };
    }
    // Neutrals take the direction of matching neighbours, else the line's.
    let dir = |l: u8| if l % 2 == 1 || (l == 2 && !rtl) { 'R' } else { 'L' };
    for i in 0..n {
        if level[i] != 255 {
            continue;
        }
        let mut j = i;
        while j < n && level[j] == 255 {
            j += 1;
        }
        let left = (0..i).rev().find(|&k| level[k] != 255).map(|k| dir(level[k]));
        let right = (j..n).find(|&k| level[k] != 255).map(|k| dir(level[k]));
        let base = if rtl { 'R' } else { 'L' };
        let (left, right) = (left.unwrap_or(base), right.unwrap_or(base));
        let lv = match (left, right) {
            ('R', 'R') => 1,
            ('L', 'L') => {
                if rtl {
                    2
                } else {
                    0
                }
            }
            _ => {
                if rtl {
                    1
                } else {
                    0
                }
            }
        };
        for l in level.iter_mut().take(j).skip(i) {
            *l = lv;
        }
    }
    // Undo the reordering: reverse runs at level >= k for k = 1, 2.
    let mut order: Vec<usize> = (0..n).collect();
    for k in 1..=2u8 {
        let mut i = 0;
        while i < n {
            if level[order[i]] >= k {
                let mut j = i;
                while j < n && level[order[j]] >= k {
                    j += 1;
                }
                order[i..j].reverse();
                i = j;
            } else {
                i += 1;
            }
        }
    }
    let mut out: Vec<Unit> = Vec::with_capacity(n);
    for &i in &order {
        let mut u = units[i].clone();
        if level[i] % 2 == 1 && !u.actual && u.text.chars().any(|c| script::mirror(c) != c) {
            // Producers differ: some name the bracket shape drawn (visual), others the logical
            // bracket. Mirror only when the font's own cmap shows the glyph is the named shape.
            let names_shape = u.glyphs.len() == 1 && {
                let g = &pc.glyphs[u.glyphs[0]];
                let mut it = u.text.chars();
                matches!((it.next(), it.next()), (Some(c), None) if pc.fonts[g.font].program_maps(g.code, c))
            };
            if names_shape {
                u.text = u.text.chars().map(script::mirror).collect();
            }
        }
        out.push(u);
    }
    *units = out;
    rtl
}

fn build_line(pc: &PageContent, id: usize, clusters: Vec<&Cluster>) -> Line {
    // Visual units, with virtual spaces for positioning gaps.
    let mut units: Vec<Unit> = Vec::new();
    let mut prev_end: Option<f64> = None;
    // Glyphs under an empty ActualText read as nothing: they ride with a neighbouring character.
    let mut silent: Vec<usize> = Vec::new();
    for c in &clusters {
        if c.actual && c.text.is_empty() {
            match units.iter_mut().rev().find(|u| u.start.is_some()) {
                Some(u) => u.glyphs.extend(&c.glyphs),
                None => silent.extend(&c.glyphs),
            }
            prev_end = Some(prev_end.map_or(c.u1, |p: f64| p.max(c.u1)));
            continue;
        }
        if let Some(pe) = prev_end {
            let prev_space = units.last().map(|u| u.text.ends_with(char::is_whitespace)).unwrap_or(true);
            if c.u0 - pe > SPACE_GAP * c.size && !prev_space && !c.text.starts_with(char::is_whitespace) {
                units.push(Unit { text: " ".into(), actual: false, glyphs: Vec::new(), start: None, u0: pe, u1: c.u0 });
            }
        }
        let text = if c.text.is_empty() { "\u{fffd}".to_string() } else { c.text.clone() };
        let mut glyphs = std::mem::take(&mut silent);
        glyphs.extend(&c.glyphs);
        units.push(Unit { text, actual: c.actual, glyphs, start: Some(c.start(pc)), u0: c.u0, u1: c.u1 });
        prev_end = Some(prev_end.map_or(c.u1, |p: f64| p.max(c.u1)));
    }
    if units.is_empty() {
        // Only empty ActualText on the line: keep it selectable as one unknown character.
        let c = clusters[0];
        units.push(Unit { text: "\u{fffd}".into(), actual: true, glyphs: silent, start: Some(c.start(pc)), u0: c.u0, u1: c.u1 });
    }
    let size = clusters[0].size;
    if units.iter().any(|u| u.text.chars().any(script::is_indic)) {
        indic_logical(&mut units, size);
    }
    let reversed = clusters.iter().any(|c| c.glyphs.iter().any(|&g| pc.glyphs[g].reversed));
    let rtl = bidi_logical(pc, &mut units, reversed);
    let chars: Vec<LineChar> = units.into_iter().map(|u| LineChar { text: u.text, glyph: u.start, glyphs: u.glyphs }).collect();
    let glyphs: Vec<usize> = chars.iter().flat_map(|c| c.glyphs.iter().copied()).collect();

    let first = &pc.glyphs[clusters[0].start(pc)];
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
        } else if script::is_legacy_indic_font(&f.base_font) {
            reason = Some("legacy-font-encoding");
        }
    }
    let text: String = chars.iter().map(|c| c.text.as_str()).collect();
    // Without the shaper (the default, smaller engine) complex-script lines are read-only; the
    // host loads the full engine to edit them.
    if reason.is_none() && !cfg!(feature = "shaping") && script::needs_shaping(&text, rtl) {
        reason = Some("needs-shaping");
    }
    let bbox = boxes(pc, &chars).unwrap_or(Rect { x0: 0.0, y0: 0.0, x1: 0.0, y1: 0.0 });
    Line {
        id,
        text,
        bbox,
        origin: first.origin,
        angle: first.angle.to_degrees(),
        size: first.size,
        direction: if rtl { "rtl" } else { "ltr" },
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
    let cl = clusters(pc);
    let mut order: Vec<usize> = (0..cl.len()).collect();
    order.sort_by(|&a, &b| {
        let (a, b) = (&cl[a], &cl[b]);
        a.key.cmp(&b.key).then(b.v.total_cmp(&a.v)).then(a.u0.total_cmp(&b.u0))
    });

    let mut lines: Vec<Line> = Vec::new();
    let mut i = 0;
    while i < order.len() {
        // One baseline: same key and nearly the same v.
        let first = &cl[order[i]];
        let mut j = i + 1;
        while j < order.len() && {
            let c = &cl[order[j]];
            c.key == first.key && (first.v - c.v).abs() <= (0.12 * first.size.min(c.size)).max(0.3)
        } {
            j += 1;
        }
        let mut row: Vec<&Cluster> = order[i..j].iter().map(|&k| &cl[k]).collect();
        row.sort_by(|a, b| a.u0.total_cmp(&b.u0).then(a.glyphs[0].cmp(&b.glyphs[0])));
        let mut cur: Vec<&Cluster> = Vec::new();
        let mut prev_end = f64::NEG_INFINITY;
        for c in row {
            if !cur.is_empty() && c.u0 - prev_end > COLUMN_GAP * c.size {
                lines.push(build_line(pc, lines.len(), std::mem::take(&mut cur)));
            }
            prev_end = prev_end.max(c.u1);
            cur.push(c);
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
