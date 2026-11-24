//! New text on a page: one line laid out with the registered open fonts (shaped with rustybuzz
//! in the `shaping` build) and drawn in a content stream of its own, plus the measurement the
//! editor lays text boxes out with ([`Engine::shape_text`]).
//!
//! The line is split into bidi runs (shaping build), then into words and spaces. A word takes the
//! face that ranks best for the request and draws all of it; punctuation, digits and spaces keep
//! the face before them when it draws them. Each word gets its glyphs' Unicode mappings and, when
//! those alone would not read back as typed, an `/ActualText` span.

use crate::engine::{limit, serialize_items, EditResult, Engine, Error, Item, Result, Substitution};
use crate::fallback::{self, FontRequest};
use crate::geom::Rect;
use crate::interp::{self, PageContent};
use crate::layout;
use crate::script::{self, Script};
use crate::shape;
#[cfg(not(feature = "shaping"))]
use crate::shape::Shaped;
use lopdf::{Object, ObjectId};
use serde::Serialize;
use std::ops::Range;

/// One glyph of shaped text. Lengths in points at the requested size.
#[derive(Clone, Debug, Serialize)]
pub struct ShapedGlyph {
    pub gid: u16,
    /// UTF-16 index in the text where the glyph's cluster starts.
    pub cluster: usize,
    pub advance: f64,
    pub dx: f64,
    pub dy: f64,
}

/// Consecutive glyphs of one registered face and direction.
#[derive(Clone, Debug, Serialize)]
pub struct ShapedRun {
    /// UTF-16 range [start, end) of the text.
    pub start: usize,
    pub end: usize,
    /// Empty for blanks no registered face draws (they still take a space's width).
    pub family: String,
    pub bold: bool,
    pub italic: bool,
    pub direction: &'static str,
    pub width: f64,
    pub glyphs: Vec<ShapedGlyph>,
}

/// A line of text laid out with the registered faces.
#[derive(Clone, Debug, Serialize)]
pub struct ShapedText {
    /// Paragraph direction, from the first strong character.
    pub direction: &'static str,
    pub width: f64,
    /// Largest ascent and descent of the faces used, in points (descent is negative).
    pub ascent: f64,
    pub descent: f64,
    /// In visual order, left to right.
    pub runs: Vec<ShapedRun>,
}

/// A word or a blank stretch, in visual order.
struct Piece {
    /// Byte range in the text.
    range: Range<usize>,
    rtl: bool,
    /// Registered face; `None` for blanks no face draws.
    face: Option<usize>,
    /// Visual order. Lengths in em.
    glyphs: Vec<PieceGlyph>,
    /// Width in em of a blank stretch without a face.
    gap: f64,
    /// Wrap in ActualText with the piece's text.
    actual: bool,
    /// Right-to-left text with numbers or Latin inside, in a left-to-right line: its glyphs read
    /// the same as other logical orders, so the whole stretch (this byte range) gets ActualText.
    group: Option<Range<usize>>,
}

struct PieceGlyph {
    gid: u16,
    /// Text for the font's ToUnicode map.
    text: String,
    /// Byte offset in the whole text of the glyph's cluster.
    cluster: usize,
    advance: f64,
    dx: f64,
    dy: f64,
}

/// The request for added text: the box's first family, then the open families of every complex
/// script in the text, then the box's other families. A missing-glyphs error names these.
pub fn request_for_added(req: &FontRequest, text: &str) -> FontRequest {
    let mut families: Vec<String> = Vec::new();
    let mut push = |f: &str| {
        if !f.trim().is_empty() && !families.iter().any(|x| fallback::normalize(x) == fallback::normalize(f)) {
            families.push(f.to_string());
        }
    };
    if let Some(first) = req.families.first() {
        push(first);
    }
    let stem = req.families.first().map(|f| fallback::normalize(f)).unwrap_or_default();
    for f in fallback::script_families_for_text(text, &stem) {
        push(f);
    }
    for f in &req.families {
        push(f);
    }
    FontRequest { families, bold: req.bold, italic: req.italic }
}

/// Byte offset to UTF-16 index.
fn utf16_at(text: &str, byte: usize) -> usize {
    text[..byte.min(text.len())].encode_utf16().count()
}

/// Characters that belong to no script: they keep the face of the text before them.
fn neutral(c: char) -> bool {
    shape::is_ignorable(c) || script::is_any_mark(c) || (script::script(c) == Script::Other && !c.is_alphabetic())
}

fn covers_char(data: &[u8], c: char) -> bool {
    let mut buf = [0u8; 4];
    shape::covers(data, c.encode_utf8(&mut buf))
}

/// A face glyph's advance as the embedded `/W` array states it, in em.
fn face_width(data: &[u8], gid: u16) -> f64 {
    ttf_parser::Face::parse(data, 0)
        .ok()
        .and_then(|f| {
            f.glyph_hor_advance(ttf_parser::GlyphId(gid)).map(|w| (w as f64 * 1000.0 / f.units_per_em() as f64).round())
        })
        .unwrap_or(0.0)
        / 1000.0
}

/// Simple text without the shaper: the cmap glyph and advance of each character.
#[cfg(not(feature = "shaping"))]
fn simple_shape(data: &[u8], text: &str) -> Option<Vec<Shaped>> {
    let face = ttf_parser::Face::parse(data, 0).ok()?;
    let upem = face.units_per_em() as f64;
    let mut out = Vec::new();
    for (i, c) in text.char_indices() {
        if shape::is_ignorable(c) {
            continue;
        }
        let gid = face.glyph_index(c).filter(|g| g.0 != 0)?;
        let advance = face.glyph_hor_advance(gid).unwrap_or(0) as f64 / upem;
        out.push(Shaped { gid: gid.0, cluster: i as u32, advance, x_offset: 0.0, y_offset: 0.0 });
    }
    Some(out)
}

/// Collapses whitespace runs to one space, for comparing what a line reads.
fn squash(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

impl Engine {
    /// Splits `text` into pieces in visual order and lays each out. Returns the paragraph
    /// direction. Errors: missing glyphs, or (default build) text that needs shaping.
    fn lay_out(&self, text: &str, req: &FontRequest) -> Result<(bool, Vec<Piece>)> {
        // Line and paragraph separators (bidi class B and the vertical whitespace around it).
        if text
            .chars()
            .any(|c| matches!(c, '\n' | '\r' | '\u{0B}' | '\u{0C}' | '\u{1C}'..='\u{1E}' | '\u{85}' | '\u{2028}' | '\u{2029}'))
        {
            return Err(limit("one-line-only"));
        }
        if text.len() > 10_000 {
            return Err(limit("text-too-long"));
        }
        let request = request_for_added(req, text);
        #[cfg(not(feature = "shaping"))]
        if script::needs_shaping(text, false) {
            return Err(Error::ReadOnly { reason: "needs-shaping".into() });
        }

        // Bidi runs in visual order (one left-to-right run without the shaper).
        #[cfg(feature = "shaping")]
        let (para_rtl, runs) = {
            let info = unicode_bidi::BidiInfo::new(text, None);
            let mut runs: Vec<(Range<usize>, bool, Option<Range<usize>>)> = Vec::new();
            let para_rtl = info.paragraphs.first().is_some_and(|p| p.level.is_rtl());
            for para in &info.paragraphs {
                let (levels, vruns) = info.visual_runs(para, para.range.clone());
                let base = para.level.number();
                let mut i = 0;
                while i < vruns.len() {
                    // A stretch of runs above a left-to-right base level: one embedded
                    // right-to-left segment, contiguous in the text.
                    let mut j = i;
                    while j < vruns.len() && !para.level.is_rtl() && levels[vruns[j].start].number() > base {
                        j += 1;
                    }
                    if j > i + 1 {
                        let start = vruns[i..j].iter().map(|r| r.start).min().unwrap_or(0);
                        let end = vruns[i..j].iter().map(|r| r.end).max().unwrap_or(0);
                        for r in &vruns[i..j] {
                            runs.push((r.clone(), levels[r.start].is_rtl(), Some(start..end)));
                        }
                        i = j;
                    } else {
                        let r = vruns[i].clone();
                        runs.push((r.clone(), levels[r.start].is_rtl(), None));
                        i += 1;
                    }
                }
            }
            (para_rtl, runs)
        };
        #[cfg(not(feature = "shaping"))]
        let (para_rtl, runs) = (false, vec![(0..text.len(), false, None::<Range<usize>>)]);

        let mut missing = String::new();
        let mut pieces: Vec<Piece> = Vec::new();
        let mut cur: Option<usize> = None;
        for (range, rtl, group) in runs {
            // Words and blanks of the run, logical order, each with its face.
            let run = &text[range.clone()];
            let mut parts: Vec<(Range<usize>, Option<usize>)> = Vec::new();
            for (off, c) in run.char_indices() {
                let at = range.start + off;
                let end = at + c.len_utf8();
                let blank = c.is_whitespace();
                let ignorable = shape::is_ignorable(c);
                let keep = ignorable || (neutral(c) && cur.is_some_and(|f| covers_char(&self.faces[f].data, c)));
                let face = if keep {
                    cur
                } else if neutral(c) {
                    // Leading punctuation takes the face of the word it starts, when it can.
                    let next = text[end..].chars().find(|&n| !neutral(n));
                    let ahead = next.and_then(|n| fallback::pick(&self.faces, &request, n));
                    if ahead.is_some_and(|f| covers_char(&self.faces[f].data, c)) {
                        ahead
                    } else {
                        fallback::pick(&self.faces, &request, c)
                    }
                } else {
                    fallback::pick(&self.faces, &request, c)
                };
                if face.is_none() && !blank && !ignorable {
                    if !missing.contains(c) {
                        missing.push(c);
                    }
                    continue;
                }
                if face.is_some() {
                    cur = face;
                }
                // A new part at each change of face and between words and blanks.
                let joins = |r: &Range<usize>, f: &Option<usize>| {
                    r.end == at && (ignorable || (*f == face && text[r.clone()].chars().all(char::is_whitespace) == blank))
                };
                match parts.last_mut() {
                    Some((r, f)) if joins(r, f) => r.end = end,
                    _ => parts.push((at..end, face)),
                }
            }
            if rtl {
                parts.reverse();
            }
            if missing.is_empty() {
                for (r, face) in parts {
                    let mut piece = self.lay_out_piece(text, r, face, rtl)?;
                    piece.group = group.clone();
                    pieces.push(piece);
                }
            }
        }
        if !missing.is_empty() {
            return Err(Error::MissingGlyphs { chars: missing, request });
        }
        Ok((para_rtl, pieces))
    }

    fn lay_out_piece(&self, text: &str, range: Range<usize>, face: Option<usize>, rtl: bool) -> Result<Piece> {
        let part = &text[range.clone()];
        let Some(f) = face else {
            // Blanks no face draws: a typical space width each.
            let gap = part.chars().filter(|c| c.is_whitespace()).count() as f64 * 0.25;
            return Ok(Piece { range, rtl, face: None, glyphs: Vec::new(), gap, actual: false, group: None });
        };
        let data = &self.faces[f].data;
        #[cfg(feature = "shaping")]
        let (shaped, texts) = {
            let shaped = shape::shape(data, part, rtl).ok_or_else(|| limit("shaping-failed"))?;
            let texts = if rtl {
                let face = &self.faces[f];
                shape::mark_split_texts(part, &shaped, |c| face.glyph(c))
            } else {
                shape::cluster_texts(part, &shaped)
            };
            (shaped, texts)
        };
        #[cfg(not(feature = "shaping"))]
        let (shaped, texts) = {
            let shaped = simple_shape(data, part).ok_or_else(|| limit("shaping-failed"))?;
            let texts = shape::cluster_texts(part, &shaped);
            (shaped, texts)
        };
        // Readers get the text from the glyphs' own mappings, in visual order (reversed for a
        // right-to-left run). PDFium reads a glyph mapped to nothing as U+FFFE, so such a word
        // needs ActualText (left to right; PDFium reverses right-to-left ActualText).
        let mut read: Vec<String> = texts.iter().map(|t| if t.is_empty() { "\u{FFFD}".to_string() } else { t.clone() }).collect();
        if rtl {
            read.reverse();
        }
        let plain = script::canonical_marks(&script::fold_presentation(&read.concat()));
        let want = script::canonical_marks(&script::fold_presentation(part));
        let blank = part.chars().all(char::is_whitespace);
        let actual = !blank && plain != want;
        // A bracket right to left is drawn mirrored ("»" for "«"). Its glyph maps to the shape
        // it shows, and the font's cmap confirms that shape: readers mirror it back when they
        // reorder the line (PDFium always does).
        let face = &self.faces[f];
        let texts: Vec<String> = texts
            .into_iter()
            .zip(&shaped)
            .map(|(t, g)| {
                let mut cs = t.chars();
                match (cs.next(), cs.next()) {
                    (Some(c), None) if rtl && script::mirror(c) != c && face.glyph(script::mirror(c)) == Some(g.gid) => {
                        script::mirror(c).to_string()
                    }
                    _ => t,
                }
            })
            .collect();
        let glyphs = shaped
            .iter()
            .zip(texts)
            .map(|(g, t)| PieceGlyph {
                gid: g.gid,
                text: t,
                cluster: range.start + g.cluster as usize,
                advance: g.advance,
                dx: g.x_offset,
                dy: g.y_offset,
            })
            .collect();
        Ok(Piece { range, rtl, face: Some(f), glyphs, gap: 0.0, actual, group: None })
    }

    /// Lays out one line of new text with the registered faces, for measuring and placing it.
    pub fn shape_text(&self, text: &str, req: &FontRequest, size: f64) -> Result<ShapedText> {
        if !(size.is_finite() && size > 0.0 && size < 10_000.0) {
            return Err(limit("bad-size"));
        }
        let (rtl, pieces) = self.lay_out(text, req)?;
        let mut runs: Vec<ShapedRun> = Vec::new();
        let (mut width, mut ascent, mut descent) = (0.0, 0.0f64, 0.0f64);
        for p in &pieces {
            let (family, bold, italic) = match p.face {
                Some(f) => {
                    let face = &self.faces[f];
                    if let Ok(parsed) = ttf_parser::Face::parse(&face.data, 0) {
                        let k = size / parsed.units_per_em() as f64;
                        ascent = ascent.max(parsed.ascender() as f64 * k);
                        descent = descent.min(parsed.descender() as f64 * k);
                    }
                    (face.family.clone(), face.bold, face.italic)
                }
                None => (String::new(), false, false),
            };
            let glyphs: Vec<ShapedGlyph> = p
                .glyphs
                .iter()
                .map(|g| ShapedGlyph {
                    gid: g.gid,
                    cluster: utf16_at(text, g.cluster),
                    advance: g.advance * size,
                    dx: g.dx * size,
                    dy: g.dy * size,
                })
                .collect();
            let w = if p.face.is_some() { glyphs.iter().map(|g| g.advance).sum() } else { p.gap * size };
            width += w;
            let (start, end) = (utf16_at(text, p.range.start), utf16_at(text, p.range.end));
            let direction = if p.rtl { "rtl" } else { "ltr" };
            // Neighbours merge only when they are also neighbours in the text.
            let touches = |r: &ShapedRun| if p.rtl { end == r.start } else { r.end == start };
            match runs.last_mut() {
                Some(r)
                    if r.family == family && r.bold == bold && r.italic == italic && r.direction == direction && touches(r) =>
                {
                    r.start = r.start.min(start);
                    r.end = r.end.max(end);
                    r.width += w;
                    r.glyphs.extend(glyphs);
                }
                _ => runs.push(ShapedRun { start, end, family, bold, italic, direction, width: w, glyphs }),
            }
        }
        Ok(ShapedText { direction: if rtl { "rtl" } else { "ltr" }, width, ascent, descent, runs })
    }

    /// Draws one line of new text: `(x, y)` is the left end of its baseline in user space,
    /// `angle` in degrees counter-clockwise, `color` sRGB 0–255. The page is read back and the
    /// new line must read as typed, with every glyph already there unmoved, or nothing changes.
    #[allow(clippy::too_many_arguments)]
    pub fn add_text(
        &mut self,
        page: usize,
        text: &str,
        req: &FontRequest,
        size: f64,
        x: f64,
        y: f64,
        angle: f64,
        color: [u8; 3],
    ) -> Result<EditResult> {
        let page_id = self.page_id(page)?;
        if !(size.is_finite() && size > 0.0 && size < 10_000.0) {
            return Err(limit("bad-size"));
        }
        if !(x.is_finite() && y.is_finite() && angle.is_finite()) || x.abs() > 1e6 || y.abs() > 1e6 {
            return Err(limit("bad-position"));
        }
        if text.chars().all(|c| c.is_whitespace() || shape::is_ignorable(c)) {
            let page_text = self.page_text(page)?;
            return Ok(EditResult { page: page_text, changed: Vec::new(), substitutions: Vec::new(), shift: 0.0 });
        }
        let (_, pieces) = self.lay_out(text, req)?;
        let before = interp::interpret_page(&self.doc, &mut self.cache, page_id).map_err(limit)?;
        if before.incomplete {
            return Err(limit("undecodable-content"));
        }

        let snapshot = (self.doc.max_id, self.dirty.clone(), self.embeds.clone());
        let mut backup: Vec<(ObjectId, Option<Object>)> = Vec::new();
        let place = Place { size, origin: (x, y), angle, color };
        let after = match self.draw_line(page_id, &before, text, &pieces, &place, &mut backup) {
            Ok(v) => v,
            Err(e) => {
                self.rollback(backup, snapshot);
                return Err(e);
            }
        };
        self.edited_pages.insert(page);

        let first = before.glyphs.len();
        let mut union: Option<Rect> = None;
        for g in &after.glyphs[first..] {
            let r = layout::glyph_rect(&after, g);
            union = Some(union.map_or(r, |u| u.union(&r)));
        }
        // Marks and shaped forms can reach past the font's ascent and descent.
        let pad = size * 0.35;
        let changed =
            union.map(|u| vec![Rect { x0: u.x0 - pad, y0: u.y0 - pad, x1: u.x1 + pad, y1: u.y1 + pad }]).unwrap_or_default();
        let first_family = req.families.first().map(|f| fallback::normalize(f)).unwrap_or_default();
        let mut substitutions: Vec<Substitution> = Vec::new();
        for p in &pieces {
            let Some(f) = p.face else { continue };
            let face = &self.faces[f];
            if fallback::normalize(&face.family) == first_family {
                continue;
            }
            let chars: String = text[p.range.clone()].chars().filter(|c| !c.is_whitespace()).collect();
            if chars.is_empty() {
                continue;
            }
            match substitutions.iter_mut().find(|s| s.substitute_font == face.family) {
                Some(s) => s.chars.push_str(&chars),
                None => substitutions.push(Substitution {
                    chars,
                    original_font: req.families.first().cloned().unwrap_or_default(),
                    substitute_font: face.family.clone(),
                    same_family: false,
                }),
            }
        }
        let (lines, paragraphs) = layout::group(&after);
        Ok(EditResult { page: self.describe(page, &after, lines, paragraphs), changed, substitutions, shift: 0.0 })
    }

    /// Writes the line's content stream and checks the page that results, which it returns.
    fn draw_line(
        &mut self,
        page_id: ObjectId,
        before: &PageContent,
        text: &str,
        pieces: &[Piece],
        place: &Place,
        backup: &mut Vec<(ObjectId, Option<Object>)>,
    ) -> Result<PageContent> {
        let size = place.size;
        // Embed every face once with all its glyphs, so their codes are known.
        let mut per_face: Vec<(usize, Vec<(u16, String)>)> = Vec::new();
        for p in pieces {
            let Some(f) = p.face else { continue };
            let i = match per_face.iter().position(|(x, _)| *x == f) {
                Some(i) => i,
                None => {
                    per_face.push((f, Vec::new()));
                    per_face.len() - 1
                }
            };
            per_face[i].1.extend(p.glyphs.iter().map(|g| (g.gid, g.text.clone())));
        }
        let mut names: Vec<(usize, Vec<u8>)> = Vec::new();
        for (f, glyphs) in &per_face {
            let font = self.embed(*f, glyphs, backup)?;
            let name = self.font_resource(page_id, before, 0, font, backup)?;
            names.push((*f, name));
        }

        // TJ numbers are 1/1000 em; the rise is in points (the matrix only rotates).
        let kern = |em: f64| -em * 1000.0;
        let mut items: Vec<Item> = Vec::new();
        let mut expect: Vec<(f64, f64)> = Vec::new();
        let mut pen = 0.0f64;
        let mut cur: Option<usize> = None;
        let mut rise = 0.0f64;
        // Piece index after which the open ActualText span ends.
        let mut span_end: Option<usize> = None;
        for (i, p) in pieces.iter().enumerate() {
            // An embedded right-to-left stretch is one span; its pieces get none of their own.
            let group_opens = p.group.is_some() && (i == 0 || pieces[i - 1].group != p.group);
            let group_closes = p.group.is_some() && pieces.get(i + 1).is_none_or(|n| n.group != p.group);
            if let (true, Some(g)) = (group_opens, &p.group) {
                items.push(Item::BeginSpan(text[g.clone()].to_string()));
            }
            let Some(f) = p.face else {
                items.push(Item::Kern(kern(p.gap)));
                pen += p.gap;
                if group_closes {
                    items.push(Item::EndSpan);
                }
                continue;
            };
            if p.actual && p.group.is_none() {
                // PDFium drops a space glyph after a word ending in a zero-advance glyph (a
                // Devanagari reph), so a left-to-right span also covers the blank after it.
                let blank_next = pieces
                    .get(i + 1)
                    .filter(|n| !p.rtl && n.face.is_some() && !n.rtl && text[n.range.clone()].chars().all(char::is_whitespace));
                let end = blank_next.map_or(p.range.end, |n| n.range.end);
                items.push(Item::BeginSpan(text[p.range.start..end].to_string()));
                span_end = Some(if blank_next.is_some() { i + 1 } else { i });
            }
            if cur != Some(f) {
                let name = names.iter().find(|(x, _)| *x == f).map(|(_, n)| n.clone()).ok_or(Error::BadFont)?;
                items.push(Item::Font(name, size));
                cur = Some(f);
            }
            let data = self.faces[f].data.clone();
            let embed = self.embeds[f].as_ref().ok_or(Error::BadFont)?;
            for g in &p.glyphs {
                if (g.dy - rise).abs() > 1e-9 {
                    items.push(Item::Rise(g.dy * size));
                    rise = g.dy;
                }
                // Readers advance by the width the font's /W states.
                let natural = face_width(&data, g.gid);
                if g.dx.abs() > 1e-9 {
                    items.push(Item::Kern(kern(g.dx)));
                }
                items.push(Item::Bytes(embed.code_for(g.gid, &g.text).to_be_bytes().to_vec()));
                items.push(Item::Kern(kern(g.advance - g.dx - natural)));
                expect.push((pen + g.dx, g.dy));
                pen += g.advance;
            }
            if span_end == Some(i) || group_closes {
                items.push(Item::EndSpan);
                span_end = None;
            }
        }
        if rise.abs() > 1e-9 {
            items.push(Item::Rise(0.0));
        }

        // q r g b rg BT rotation Tm … ET Q, after the page's own content wrapped in q … Q.
        let (sin, cos) = place.angle.to_radians().sin_cos();
        let f = crate::content::fmt_num;
        let mut body = format!(
            "q {} {} {} rg BT {} {} {} {} {} {} Tm ",
            f(place.color[0] as f64 / 255.0),
            f(place.color[1] as f64 / 255.0),
            f(place.color[2] as f64 / 255.0),
            f(cos),
            f(sin),
            f(-sin),
            f(cos),
            f(place.origin.0),
            f(place.origin.1)
        )
        .into_bytes();
        body.extend(serialize_items(items));
        body.extend_from_slice(b" ET Q\n");
        self.append_content(page_id, body, backup)?;

        let after = interp::interpret_page(&self.doc, &mut self.cache, page_id).map_err(limit)?;
        check_added(before, &after, text, &expect, place)?;
        Ok(after)
    }

    /// Appends a content stream to the page. The existing content is wrapped in q … Q first, so
    /// a transformation or colour it leaves behind does not affect the new text.
    fn append_content(&mut self, page_id: ObjectId, body: Vec<u8>, backup: &mut Vec<(ObjectId, Option<Object>)>) -> Result<()> {
        let page = self.doc.get_dictionary(page_id).map_err(|_| Error::BadPage)?;
        let existing: Vec<Object> = match page.get(b"Contents") {
            Ok(Object::Reference(id)) => match self.doc.get_object(*id) {
                Ok(Object::Array(a)) => a.clone(),
                _ => vec![Object::Reference(*id)],
            },
            Ok(Object::Array(a)) => a.clone(),
            _ => Vec::new(),
        };
        let mut contents: Vec<Object> = Vec::with_capacity(existing.len() + 3);
        if !existing.is_empty() {
            let open = self.add_object(Object::Stream(crate::engine::new_stream(b"q\n".to_vec())), backup);
            let close = self.add_object(Object::Stream(crate::engine::new_stream(b"\nQ\n".to_vec())), backup);
            contents.push(Object::Reference(open));
            contents.extend(existing);
            contents.push(Object::Reference(close));
        }
        let mine = self.add_object(Object::Stream(crate::engine::new_stream(body)), backup);
        contents.push(Object::Reference(mine));
        self.touch(page_id, backup);
        let page = self.doc.get_dictionary_mut(page_id).map_err(|_| Error::BadPage)?;
        page.set("Contents", Object::Array(contents));
        Ok(())
    }
}

struct Place {
    size: f64,
    origin: (f64, f64),
    angle: f64,
    color: [u8; 3],
}

/// The page after adding a line: every glyph that was there is unchanged, the new glyphs sit
/// where they were laid out, and the line they form reads as typed.
// `!(x <= tol)` is deliberate: it also rejects NaN.
#[allow(clippy::neg_cmp_op_on_partial_ord)]
fn check_added(before: &PageContent, after: &PageContent, text: &str, expect: &[(f64, f64)], place: &Place) -> Result<()> {
    let fail = |r: &'static str, m: String| Err(crate::engine::verify(r, m));
    if after.glyphs.len() != before.glyphs.len() + expect.len() {
        return fail(
            "glyph-mismatch",
            format!("{} glyphs on the page, expected {}", after.glyphs.len(), before.glyphs.len() + expect.len()),
        );
    }
    for (a, b) in before.glyphs.iter().zip(&after.glyphs) {
        let moved = (a.origin.0 - b.origin.0).abs().max((a.origin.1 - b.origin.1).abs());
        if a.code != b.code || !(moved <= 1e-6) || a.text != b.text {
            return fail("glyph-mismatch", "text already on the page changed".into());
        }
    }
    let (sin, cos) = place.angle.to_radians().sin_cos();
    let first = before.glyphs.len();
    for (g, &(along, up)) in after.glyphs[first..].iter().zip(expect) {
        let (u, v) = (along * place.size, up * place.size);
        let want = (place.origin.0 + u * cos - v * sin, place.origin.1 + u * sin + v * cos);
        let off = (g.origin.0 - want.0).abs().max((g.origin.1 - want.1).abs());
        if !(off <= 0.01 + place.size * 1e-4) {
            return fail("position-drift", format!("new glyph {:?} is {off:.3} pt from where it was laid out", g.text));
        }
        if !((g.size - place.size).abs() <= 1e-6) || g.color != place.color {
            return fail("glyph-mismatch", format!("new glyph {:?} has the wrong size or colour", g.text));
        }
    }
    // The new line must read back as typed. It may join text already on that baseline.
    let expected = squash(&script::canonical_marks(&script::fold_presentation(text)));
    let (lines, _) = layout::group(after);
    let reads: Vec<String> = lines
        .iter()
        .filter(|l| l.glyphs.iter().any(|&g| g >= first))
        .map(|l| squash(&script::canonical_marks(&script::fold_presentation(&l.text))))
        .collect();
    if !reads.iter().any(|r| r.contains(&expected)) {
        return fail("text-mismatch", format!("the new text reads {:?}, expected {expected:?}", reads.join(" | ")));
    }
    Ok(())
}
