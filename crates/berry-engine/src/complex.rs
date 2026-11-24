//! Editing lines that hold complex-script text (Devanagari and the other Indic scripts, Arabic,
//! Hebrew). Shaping depends on neighbouring letters, so an edit replaces whole words. Each new
//! word is drawn by the first exact source: the same word already on the page in the same font,
//! the font's own codes (simple scripts), the embedded program when it can shape, or a
//! registered open font shaped here. A word whose glyphs the page font's ToUnicode maps to other
//! text (an Arabic subset that draws "4" but maps it nowhere) is drawn with a sibling of that font:
//! the same font program and glyphs under a new font dictionary whose ToUnicode maps just those
//! glyphs to the text they draw, so every reader gets the word from the glyphs themselves.

use crate::engine::{limit, show_state, verify, EditResult, Engine, Error, Item, Plan, Result, Substitution};
use crate::fallback::{self, FontRequest};
use crate::font::{strip_subset_prefix, PdfFont};
use crate::geom::Rect;
use crate::interp::{self, PageContent, ShowState};
use crate::layout::{self, Line};
use crate::{script, shape};
use lopdf::{Object, ObjectId};
use std::collections::{HashMap, HashSet};

/// Largest position error accepted for any glyph, in points.
const TOLERANCE: f64 = 0.05;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
enum GlyphFont {
    /// A font of the page: index into `PageContent::fonts`.
    Page(usize),
    /// A registered face: index into `Engine::faces`.
    Face(usize),
    /// A page font drawn through its sibling: the same dictionary and program with a ToUnicode
    /// written for the glyphs this edit draws with it (see [`Engine::sibling_font`]).
    Sibling(usize),
}

/// One glyph of new text. Lengths are text-space units before horizontal scaling.
#[derive(Clone, Debug)]
struct NewGlyph {
    font: GlyphFont,
    /// Code in a page font; glyph id in a face.
    code: u32,
    /// The text the glyph stands for (first glyph of a cluster only): the ToUnicode text of a
    /// face or sibling glyph. Empty when unknown (a glyph reused from the page).
    text: String,
    /// Advance to the next glyph.
    adv: f64,
    x_off: f64,
    y_off: f64,
}

#[derive(Clone, Debug)]
enum Piece {
    /// `actual`: wrap the word in `/ActualText` (its glyphs' own Unicode would not read right,
    /// or the line already uses ActualText).
    Word {
        text: String,
        glyphs: Vec<NewGlyph>,
        face: Option<usize>,
        style: usize,
        actual: bool,
        /// Byte offset of the word in the new segment (logical order).
        at: usize,
    },
    Space {
        glyph: Option<NewGlyph>,
        adv: f64,
        at: usize,
    },
}

fn along(p: (f64, f64), ang: f64) -> f64 {
    p.0 * ang.cos() + p.1 * ang.sin()
}

fn across(p: (f64, f64), ang: f64) -> f64 {
    -p.0 * ang.sin() + p.1 * ang.cos()
}

/// What the PDF itself advances after drawing a code, in text space before scaling.
fn natural(font: &PdfFont, code: u32, state: &ShowState) -> f64 {
    let nbytes = font.code_bytes(code).len();
    let mut w = font.width(code) / 1000.0 * state.tfs + state.tc;
    if font.is_word_space(code, nbytes) {
        w += state.tw;
    }
    w
}

/// A face glyph's advance as the embedded `/W` array states it, in 1/1000 em.
fn face_width(data: &[u8], gid: u16) -> f64 {
    ttf_parser::Face::parse(data, 0)
        .ok()
        .and_then(|f| {
            f.glyph_hor_advance(ttf_parser::GlyphId(gid)).map(|w| (w as f64 * 1000.0 / f.units_per_em() as f64).round())
        })
        .unwrap_or(0.0)
}

struct Ctx<'a> {
    pc: &'a PageContent,
    lines: &'a [Line],
    state: &'a ShowState,
    /// Font size of the anchor glyph in page units.
    size: f64,
    angle: f64,
    /// The content source (page or form) the anchor is drawn in: new fonts go in its resources.
    source: usize,
}

impl Ctx<'_> {
    /// Page units per text-space unit along the baseline.
    fn k(&self) -> f64 {
        self.state.th * self.state.scale
    }

    /// Text-space rise that moves a glyph `dv` page units up from the baseline.
    fn rise_for(&self, dv: f64) -> f64 {
        let up = across(self.state.rise_dir, self.angle);
        if up.abs() < 1e-9 {
            0.0
        } else {
            dv / up
        }
    }

    /// The same word drawn on the page in the style font: its glyphs at their relative places.
    fn reuse(&self, word: &str, style: usize) -> Option<Vec<NewGlyph>> {
        let style_font = &self.pc.fonts[style];
        for line in self.lines {
            for w in &line.words {
                if w.text != word {
                    continue;
                }
                let mut gl: Vec<usize> = line.chars[w.start..w.end].iter().flat_map(|c| c.glyphs.iter().copied()).collect();
                let Some(&first) = gl.first() else { continue };
                let font = self.pc.glyphs[first].font;
                let a = self.pc.glyphs[first].angle;
                let f = &self.pc.fonts[font];
                if (font != style && (f.base_font != style_font.base_font || f.object_id.is_none()))
                    || gl.iter().any(|&g| self.pc.glyphs[g].font != font || (self.pc.glyphs[g].angle - a).abs() > 1e-3)
                {
                    continue;
                }
                let u = |g: usize| along(self.pc.glyphs[g].origin, a);
                gl.sort_by(|x, y| u(*x).total_cmp(&u(*y)).then(x.cmp(y)));
                let src_size = self.pc.glyphs[first].size;
                let base_v = across(line.origin, a);
                let end = gl.iter().map(|&g| u(g) + self.pc.glyphs[g].advance).fold(f64::NEG_INFINITY, f64::max);
                // Source page units → page units at the target size.
                let r = self.size / src_size;
                let mut out = Vec::with_capacity(gl.len());
                for (i, &g) in gl.iter().enumerate() {
                    let gg = &self.pc.glyphs[g];
                    let next = gl.get(i + 1).map(|&n| u(n)).unwrap_or(end);
                    out.push(NewGlyph {
                        font: GlyphFont::Page(font),
                        code: gg.code,
                        text: String::new(),
                        adv: (next - u(g)) * r / self.k(),
                        x_off: 0.0,
                        y_off: self.rise_for((across(gg.origin, a) - base_v) * r),
                    });
                }
                return Some(out);
            }
        }
        None
    }

    /// A word of a simple script in the style font's own codes.
    fn encode(&self, word: &str, style: usize) -> Option<Vec<NewGlyph>> {
        if word.chars().any(script::is_complex) {
            return None;
        }
        let font = &self.pc.fonts[style];
        font.object_id?;
        let seen: HashSet<u32> = self.pc.glyphs.iter().filter(|g| g.font == style).map(|g| g.code).collect();
        word.chars()
            .map(|c| {
                let code = font.encode(c, &seen)?;
                Some(NewGlyph {
                    font: GlyphFont::Page(style),
                    code,
                    text: c.to_string(),
                    adv: natural(font, code, self.state),
                    x_off: 0.0,
                    y_off: 0.0,
                })
            })
            .collect()
    }

    /// Shapes the word with a page font's embedded program, when it has the layout tables.
    fn embedded(&self, word: &str, rtl: bool, fi: usize) -> Option<Vec<NewGlyph>> {
        let font = &self.pc.fonts[fi];
        let data = font.truetype_program()?;
        if font.object_id.is_none() || !shape::covers(data, word) || !shape::can_shape(data, word) {
            return None;
        }
        let tfs = self.state.tfs;
        let shaped = shape::shape(data, word, rtl)?;
        let texts = shape::cluster_texts(word, &shaped);
        shaped
            .into_iter()
            .zip(texts)
            .map(|(g, text)| {
                let cid = font.cid_for_gid(g.gid)?;
                (font.has_glyph(cid) != Some(false)).then_some(NewGlyph {
                    font: GlyphFont::Page(fi),
                    code: cid,
                    text,
                    adv: g.advance * tfs,
                    x_off: g.x_offset * tfs,
                    y_off: g.y_offset * tfs,
                })
            })
            .collect()
    }
}

/// A new glyph the check expects: code, font object, offset along the baseline from the start
/// of the new text and rise (text space, before scaling).
#[derive(Clone, Debug)]
struct Expect {
    code: u32,
    font: Option<ObjectId>,
    along: f64,
    rise: f64,
}

impl Engine {
    /// Replaces line characters `[a, b)` with `inserted` in a line with complex-script text.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn edit_complex(
        &mut self,
        page: usize,
        page_id: ObjectId,
        pc: PageContent,
        lines: Vec<Line>,
        line_id: usize,
        a: usize,
        b: usize,
        inserted: String,
    ) -> Result<EditResult> {
        let line = &lines[line_id];
        let n = line.chars.len();
        let text_of = |r: std::ops::Range<usize>| line.chars[r].iter().map(|c| c.text.as_str()).collect::<String>();
        let expected = format!("{}{}{}", text_of(0..a), inserted, text_of(b..n));
        let blank = |i: usize| line.chars[i].text.chars().all(char::is_whitespace);
        let glyphs_in = |a: usize, b: usize| line.chars[a..b].iter().flat_map(|c| c.glyphs.iter().copied()).collect::<Vec<_>>();
        let word_start = |mut i: usize| {
            while i > 0 && !blank(i - 1) {
                i -= 1;
            }
            i
        };
        let word_end = |mut i: usize| {
            while i < n && !blank(i) {
                i += 1;
            }
            i
        };

        // 1. Widen to whole words, with at least one glyph to replace.
        let (a0, b0) = (a, b);
        let lead_space = inserted.starts_with(char::is_whitespace);
        let tail_space = inserted.ends_with(char::is_whitespace);
        let mut a =
            if (a < n && !blank(a) && a < b) || (a > 0 && !blank(a - 1) && !(a == b && lead_space)) { word_start(a) } else { a };
        let mut b =
            if (b > 0 && !blank(b - 1) && a0 < b) || (b < n && !blank(b) && !(a0 == b && tail_space)) { word_end(b) } else { b };
        while glyphs_in(a, b).is_empty() {
            if a > 0 {
                a = word_start(a - 1);
            } else if b < n {
                b = word_end(b + 1);
            } else {
                return Err(Error::BadLine);
            }
        }

        // 2. The replaced glyphs must be one block along the baseline, and whole ActualText spans.
        let ang = pc.glyphs[line.glyphs[0]].angle;
        let u_of = |g: usize| along(pc.glyphs[g].origin, ang);
        let ok = |a: usize, b: usize| -> bool {
            let r: HashSet<usize> = glyphs_in(a, b).into_iter().collect();
            let lo = r.iter().map(|&g| u_of(g)).fold(f64::INFINITY, f64::min);
            let hi = r.iter().map(|&g| u_of(g)).fold(f64::NEG_INFINITY, f64::max);
            let contiguous = line.glyphs.iter().all(|&g| r.contains(&g) || u_of(g) <= lo + 1e-6 || u_of(g) >= hi - 1e-6);
            let whole_spans = r.iter().all(|&g| match pc.glyphs[g].span {
                Some(s) => pc.glyphs.iter().enumerate().all(|(i, x)| x.span != Some(s) || r.contains(&i)),
                None => true,
            });
            contiguous && whole_spans
        };
        if !ok(a, b) {
            a = 0;
            b = n;
            if !ok(a, b) {
                return Err(limit("actual-text-span"));
            }
        }
        let segment = format!("{}{}{}", text_of(a..a0), inserted, text_of(b0..b));
        let removed: HashSet<usize> = glyphs_in(a, b).into_iter().collect();
        let drop_ops = crate::engine::unwrap_spans(&pc, removed.iter().filter_map(|&g| pc.glyphs[g].span))?;

        // 3. Style: the anchor is the first removed glyph drawn on the baseline.
        let mut order: Vec<usize> = removed.iter().copied().collect();
        order.sort_unstable();
        let base_v = across(line.origin, ang);
        let anchor = order
            .iter()
            .copied()
            .find(|&g| (across(pc.glyphs[g].origin, ang) - base_v).abs() < 0.01 * pc.glyphs[g].size)
            .unwrap_or(order[0]);
        let state = show_state(&pc, anchor).ok_or(Error::BadLine)?.clone();
        if state.tfs.abs() < 1e-9 || state.scale.abs() < 1e-12 || state.th.abs() < 1e-9 {
            return Err(limit("degenerate-text-matrix"));
        }
        let rtl = line.direction == "rtl";
        let ctx = Ctx {
            pc: &pc,
            lines: &lines,
            state: &state,
            size: pc.glyphs[anchor].size,
            angle: ang,
            source: pc.glyphs[anchor].source,
        };
        // The style font of a word: the font the replaced (else the line's) text of the same
        // script was in, else the anchor's.
        let style_for = |word: &str| -> usize {
            let sc = word.chars().find(|c| c.is_alphanumeric()).map(script::script);
            let same = |g: &usize| sc.is_some_and(|sc| pc.glyphs[*g].text.chars().any(|c| script::script(c) == sc));
            order
                .iter()
                .find(|g| same(g))
                .or_else(|| line.glyphs.iter().find(|g| same(g)))
                .map(|&g| pc.glyphs[g].font)
                .unwrap_or(state.font)
        };

        // 4. Lay the new text out with the bidi algorithm, then draw each word.
        let spans_on_line = line.glyphs.iter().any(|&g| pc.glyphs[g].span.is_some());
        let mut pieces: Vec<Piece> = Vec::new();
        let mut missing = String::new();
        let mut request: Option<FontRequest> = None;
        let base = if rtl { unicode_bidi::Level::rtl() } else { unicode_bidi::Level::ltr() };
        let info = unicode_bidi::BidiInfo::new(&segment, Some(base));
        let mut runs: Vec<(std::ops::Range<usize>, bool)> = Vec::new();
        for para in &info.paragraphs {
            let (levels, vruns) = info.visual_runs(para, para.range.clone());
            for r in vruns {
                let odd = levels[r.start].is_rtl();
                runs.push((r, odd));
            }
        }
        // Whether the line has right-to-left text (see the ActualText check after step 4).
        let any_rtl = rtl || runs.iter().any(|r| r.1);
        // Readers rebuild a right-to-left line's order from the glyphs with their own bidi rules,
        // and PDFium does not agree with UAX #9 (our read-back) on two cases, so they are refused:
        // (a) punctuation typed next to punctuation ("تجريبي." + "، نعم" reads "تجريبي،. نعم"):
        //     a run of neutrals is ordered by its neighbours, which the edit changed;
        // (b) a left-to-right run of two or more words in a right-to-left line (" abc def" reads
        //     "defabc"): PDFium orders the words of the run right to left.
        if any_rtl {
            use unicode_bidi::BidiClass::{CS, ES, ET, ON};
            let neutral = |c: char| matches!(unicode_bidi::bidi_class(c), CS | ES | ET | ON);
            let mut seq: Vec<char> = Vec::new();
            if a0 > 0 {
                seq.extend(text_of(a0 - 1..a0).chars().last());
            }
            seq.extend(inserted.chars());
            if b0 < n {
                seq.extend(text_of(b0..b0 + 1).chars().next());
            }
            if seq.windows(2).any(|w| neutral(w[0]) && neutral(w[1])) {
                return Err(verify(
                    "text-mismatch",
                    format!("{inserted:?} puts punctuation next to punctuation in a right-to-left line, which PDFium reorders"),
                ));
            }
        }
        if rtl {
            for (range, run_rtl) in &runs {
                let words = segment[range.clone()].split_whitespace().filter(|w| w.chars().any(char::is_alphanumeric)).count();
                if !run_rtl && words >= 2 {
                    return Err(verify(
                        "text-mismatch",
                        format!(
                            "{:?} is a left-to-right run of several words in a right-to-left line, which PDFium reverses",
                            &segment[range.clone()]
                        ),
                    ));
                }
            }
        }
        for (range, run_rtl) in runs {
            let run = &segment[range];
            let mut parts: Vec<(bool, &str)> = Vec::new();
            let mut start = 0;
            let mut space: Option<bool> = None;
            for (i, c) in run.char_indices() {
                let s = c.is_whitespace();
                if space != Some(s) {
                    if i > start {
                        parts.push((space.unwrap_or(false), &run[start..i]));
                    }
                    start = i;
                    space = Some(s);
                }
            }
            if start < run.len() {
                parts.push((space.unwrap_or(false), &run[start..]));
            }
            if run_rtl {
                parts.reverse();
            }
            for (is_space, part) in parts {
                let style = style_for(part);
                let at = part.as_ptr() as usize - segment.as_ptr() as usize;
                if is_space {
                    for (i, _) in part.char_indices() {
                        pieces.push(space_piece(&ctx, style, at + i));
                    }
                    continue;
                }
                // Whether readers get the word from the glyphs' own Unicode mappings. Right-to-left
                // words skip ActualText when they can: PDFium reverses right-to-left ActualText.
                let folded = script::canonical_marks(&script::fold_presentation(part));
                let plain_ok = |glyphs: &[NewGlyph]| plain_reading(&pc, glyphs, run_rtl) == folded;
                // Left-to-right page glyphs (digits, Latin) whose ToUnicode reads wrong move to the
                // font's sibling, when the text of every glyph is known. A right-to-left word keeps
                // preferring a registered face (below).
                let readable_glyphs = |glyphs: Vec<NewGlyph>| match sibling(&pc, &glyphs) {
                    Some(s) if !run_rtl && !plain_ok(&glyphs) && plain_ok(&s) => s,
                    _ => glyphs,
                };
                let word = |glyphs: Vec<NewGlyph>, face| {
                    let actual = !plain_ok(&glyphs) || (spans_on_line && !run_rtl);
                    Piece::Word { text: part.to_string(), glyphs, face, style, actual, at }
                };
                if let Some(g) = ctx.reuse(part, style).or_else(|| ctx.encode(part, style)) {
                    pieces.push(word(readable_glyphs(g), None));
                    continue;
                }
                let others = (0..pc.fonts.len()).filter(|&i| i != style && pc.fonts[i].truetype_program().is_some());
                let shaped_here: Vec<Vec<NewGlyph>> = std::iter::once(style)
                    .chain(others)
                    .filter_map(|f| ctx.embedded(part, run_rtl, f))
                    .take(2)
                    .map(readable_glyphs)
                    .collect();
                // A right-to-left word whose embedded glyphs cannot carry its text prefers a
                // registered face, whose Unicode mapping is written here.
                let readable = shaped_here.iter().position(|g| !run_rtl || plain_ok(g));
                if let Some(i) = readable {
                    pieces.push(word(shaped_here[i].clone(), None));
                    continue;
                }
                let req = fallback::request_for_text(&pc.fonts[style], part);
                let picked = fallback::pick_text(&self.faces, &req, part)
                    .and_then(|f| shape::shape(&self.faces[f].data, part, run_rtl).map(|s| (f, s)));
                match picked {
                    Some((f, shaped)) => {
                        let texts = if run_rtl {
                            let face = &self.faces[f];
                            shape::mark_split_texts(part, &shaped, |c| face.glyph(c))
                        } else {
                            shape::cluster_texts(part, &shaped)
                        };
                        let glyphs = shaped
                            .iter()
                            .zip(texts)
                            .map(|(g, t)| NewGlyph {
                                font: GlyphFont::Face(f),
                                code: g.gid as u32,
                                text: t,
                                adv: g.advance * state.tfs,
                                x_off: g.x_offset * state.tfs,
                                y_off: g.y_offset * state.tfs,
                            })
                            .collect();
                        pieces.push(word(glyphs, Some(f)));
                    }
                    None if !shaped_here.is_empty() => pieces.push(word(shaped_here[0].clone(), None)),
                    None => {
                        for c in part.chars() {
                            if !missing.contains(c) && !shape::is_ignorable(c) {
                                missing.push(c);
                            }
                        }
                        request.get_or_insert(req);
                    }
                }
            }
        }
        if let Some(request) = request {
            return Err(Error::MissingGlyphs { chars: missing, request });
        }
        // One sibling per page font: a code must stand for one text in it. Otherwise the words
        // keep the page font's glyphs (and the ActualText check below decides).
        let mut sib_text: HashMap<(usize, u32), &str> = HashMap::new();
        let clash = pieces.iter().flat_map(piece_glyphs).any(|g| match g.font {
            GlyphFont::Sibling(fi) => *sib_text.entry((fi, g.code)).or_insert(&g.text) != g.text,
            _ => false,
        });
        if clash {
            for p in &mut pieces {
                if let Piece::Word { glyphs, actual, .. } = p {
                    if glyphs.iter().any(|g| matches!(g.font, GlyphFont::Sibling(_))) {
                        for g in glyphs.iter_mut() {
                            if let GlyphFont::Sibling(fi) = g.font {
                                g.font = GlyphFont::Page(fi);
                            }
                        }
                        *actual = true;
                    }
                }
            }
        }
        // pdf.js ignores ActualText and pdfium reorders it, so in a line with right-to-left text a
        // word that reads as typed only through ActualText is refused; "Replace with new text"
        // covers it. (Digits an Arabic subset draws but does not map read by their glyphs through
        // a sibling font, above.) A word drawn in another font is kept: pdfium reads it in place, while pdf.js, which
        // puts a line's text items in content order, can read it out of order (crates/README.md).
        // A line already drawn with ActualText spans (Chrome's output) is left out: neither reader
        // reads it by its glyphs before the edit either.
        if any_rtl && !spans_on_line {
            if let Some(text) = pieces.iter().find_map(|p| match p {
                Piece::Word { text, actual: true, .. } => Some(text),
                _ => None,
            }) {
                return Err(verify(
                    "text-mismatch",
                    format!("{text:?} would read as typed only through ActualText, which pdf.js ignores"),
                ));
            }
        }

        // 5. Geometry: left-to-right lines keep their start, right-to-left lines their end.
        let k = ctx.k();
        let new_width = pieces
            .iter()
            .map(|p| match p {
                Piece::Word { glyphs, .. } => glyphs.iter().map(|g| g.adv).sum::<f64>(),
                Piece::Space { adv, .. } => *adv,
            })
            .sum::<f64>()
            * k;
        let lo = removed.iter().map(|&g| u_of(g)).fold(f64::INFINITY, f64::min);
        let hi = removed.iter().map(|&g| u_of(g)).fold(f64::NEG_INFINITY, f64::max);
        let end = removed.iter().map(|&g| u_of(g) + pc.glyphs[g].advance).fold(f64::NEG_INFINITY, f64::max);
        let delta = new_width - (end - lo);
        let start = if rtl { end - new_width } else { lo };
        let mut want: HashMap<usize, f64> = HashMap::new();
        for &g in &line.glyphs {
            if removed.contains(&g) {
                continue;
            }
            // A zero-advance glyph can end the word (a Devanagari reph after its consonant), so
            // a glyph that starts where the word ends is after it.
            // Only glyphs that advance: a remaining zero-advance mark there belongs to its base.
            let advances = pc.glyphs[g].advance.abs() > 1e-6;
            if !rtl && (u_of(g) > hi + 1e-6 || (advances && u_of(g) >= end - 1e-6)) {
                want.insert(g, delta);
            } else if rtl && (u_of(g) < lo - 1e-6 || (advances && u_of(g) + pc.glyphs[g].advance <= lo + 1e-6)) {
                want.insert(g, -delta);
            }
        }
        // Where the new text goes in the content. pdf.js reads a line's text items in content
        // order, and new glyphs in another font than the line's are items of their own. So when
        // a right-to-left line gets new text at its logical end (typing at the end of a sentence),
        // the runs in the line's font are drawn in place and the others after the line's last
        // glyph, in logical order. Elsewhere no content order reads right in pdf.js: a word in a
        // registered face is kept (PDFium reads it in order; see crates/README.md), but a sibling
        // word is refused, as the ActualText it replaces was. A line drawn with ActualText spans
        // (Chrome's) is left as it was: no reader goes by its glyphs, and glyphs after its last
        // one would land inside a span.
        let (runs, _) = runs_of(&pieces);
        let foreign = |r: usize| runs[r].font.is_some_and(|f| f != GlyphFont::Page(state.font));
        let all: Vec<usize> = (0..runs.len()).collect();
        let mut lists = vec![all.clone()];
        let mut tail: Option<(usize, f64)> = None;
        if rtl && !spans_on_line && all.iter().any(|&r| foreign(r)) {
            let mut logical = all.clone();
            logical.sort_by_key(|&r| runs[r].at);
            let first = logical.iter().position(|&r| foreign(r)).unwrap_or(0);
            let ordered = logical[first..].iter().all(|&r| foreign(r) || runs[r].font.is_none());
            let kept = line.glyphs.iter().copied().filter(|g| !removed.contains(g));
            let at_end = kept.clone().all(|g| !want.contains_key(&g));
            let same_style = |g: usize| {
                let (a, h) = (&pc.glyphs[anchor], &pc.glyphs[g]);
                h.source == a.source
                    && h.size == a.size
                    && h.color == a.color
                    && h.render_mode == a.render_mode
                    && (h.angle - a.angle).abs() < 1e-9
                    && (across(h.origin, ang) - base_v).abs() < 0.01 * h.size
                    && show_state(&pc, g).is_some_and(|s| {
                        s.font == state.font
                            && s.font_res == state.font_res
                            && (s.tfs, s.th, s.tc, s.tw, s.scale, s.rise)
                                == (state.tfs, state.th, state.tc, state.tw, state.scale, state.rise)
                    })
            };
            let placed = ordered
                && at_end
                && match kept.max() {
                    // The new text is drawn after the rest of the line already.
                    None => true,
                    Some(g) if g < anchor => true,
                    Some(g) if same_style(g) => {
                        tail = Some((g, start - (u_of(g) + pc.glyphs[g].advance)));
                        true
                    }
                    Some(_) => false,
                };
            if placed {
                lists = match tail {
                    Some(_) => vec![
                        all.iter().copied().filter(|&r| !foreign(r)).collect(),
                        logical.iter().copied().filter(|&r| foreign(r)).collect(),
                    ],
                    None => vec![logical],
                };
            } else if pieces.iter().flat_map(piece_glyphs).any(|g| matches!(g.font, GlyphFont::Sibling(_))) {
                return Err(verify(
                    "text-mismatch",
                    format!(
                        "{inserted:?} needs glyphs of another font inside a right-to-left line, which pdf.js reads out of order"
                    ),
                ));
            }
        }
        let plan =
            Plan { removed, want, anchor, after: false, segs: Vec::new(), insert_at: start - u_of(anchor), drop_ops, tail };

        // 6. Apply in a transaction, check, then keep or roll back. A line that reads back in
        // another order than typed (digits or Latin inside a right-to-left line, which readers
        // rebuild from glyph positions with their own bidi rules) is refused: wrapping it in one
        // ActualText span would satisfy this check but not readers that go by the glyphs
        // (pdfium, pdf.js). The editor then offers "Replace with new text".
        let snapshot = (self.doc.max_id, self.dirty.clone(), self.embeds.clone());
        let mut backup: Vec<(ObjectId, Option<Object>)> = Vec::new();
        let outcome = self.emit(page_id, &ctx, &pieces, &lists, &mut backup).and_then(|drawn| {
            let none = (Vec::new(), Vec::new());
            let ((items, expect), (tail_items, tail_expect)) = (&drawn[0], drawn.get(1).unwrap_or(&none));
            self.apply_items(page_id, &pc, &plan, (items, tail_items), new_width, &mut backup)?;
            let after = interp::interpret_page(&self.doc, &mut self.cache, page_id).map_err(limit)?;
            let (touched, map) = check(&pc, &after, &plan, (expect, tail_expect), start, ang, &state)?;
            if self.overflows(page, &pc, &line.glyphs, &after, &touched) {
                return Err(verify("overflow", "the line would run past the page edge".into()));
            }
            if Self::collides(&pc, &line.glyphs, &after, &touched) {
                return Err(verify("overlap", "the line would run into other text on its baseline".into()));
            }
            let (new_lines, paragraphs) = layout::group(&after);
            // The edited line must read back exactly as asked.
            let probe = touched.first().copied().or_else(|| line.glyphs.iter().find_map(|&g| map[g]));
            let reads = probe.and_then(|g| new_lines.iter().find(|l| l.glyphs.contains(&g))).map(|l| l.text.clone());
            // Nothing left to probe: the whole line was deleted, which is right when nothing visible was asked for.
            let gone = probe.is_none() && expected.trim().is_empty();
            if !gone && reads.as_deref().map(script::canonical_marks) != Some(script::canonical_marks(&expected)) {
                return Err(verify(
                    "text-mismatch",
                    format!("the line reads {:?}, expected {expected:?}", reads.unwrap_or_default()),
                ));
            }
            Ok((after, touched, new_lines, paragraphs))
        });
        let (after, touched, new_lines, paragraphs) = match outcome {
            Ok(v) => v,
            Err(e) => {
                self.rollback(backup, snapshot);
                return Err(e);
            }
        };
        self.edited_pages.insert(page);

        let mut union = line.bbox;
        for &gi in &touched {
            union = union.union(&layout::glyph_rect(&after, &after.glyphs[gi]));
        }
        let pad = line.size * 0.35;
        let changed = vec![Rect { x0: union.x0 - 1.0, y0: union.y0 - pad, x1: union.x1 + 1.0, y1: union.y1 + pad }];
        let mut substitutions: Vec<Substitution> = Vec::new();
        for p in &pieces {
            let Piece::Word { text, face: Some(f), style, .. } = p else { continue };
            let face = &self.faces[*f];
            let name =
                format!("{}{}{}", face.family, if face.bold { " Bold" } else { "" }, if face.italic { " Italic" } else { "" });
            let original = &pc.fonts[*style].base_font;
            if substitutions.last().is_none_or(|s| s.substitute_font != name) {
                substitutions.push(Substitution {
                    chars: String::new(),
                    original_font: strip_subset_prefix(original).0.to_string(),
                    substitute_font: name,
                    same_family: fallback::normalize(&face.family) == fallback::family_stem(original),
                });
            }
            let s = substitutions.last_mut().expect("pushed above");
            for c in text.chars() {
                if !s.chars.contains(c) {
                    s.chars.push(c);
                }
            }
        }
        let shift = if rtl { -delta } else { delta };
        Ok(EditResult { page: self.describe(page, &after, new_lines, paragraphs), changed, substitutions, shift })
    }

    /// Turns the pieces into content items (embedding faces and siblings as needed) and lists
    /// every glyph they draw: one list of items per entry of `lists` (indices into
    /// [`runs_of`]'s runs, in the order they are drawn).
    fn emit(
        &mut self,
        page_id: ObjectId,
        ctx: &Ctx,
        pieces: &[Piece],
        lists: &[Vec<usize>],
        backup: &mut Vec<(ObjectId, Option<Object>)>,
    ) -> Result<Vec<(Vec<Item>, Vec<Expect>)>> {
        let pc = ctx.pc;
        let state = ctx.state;
        let tfs = state.tfs;
        let source = ctx.source;
        // Embed the faces first so their codes are known.
        let mut per_face: Vec<(usize, Vec<(u16, String)>)> = Vec::new();
        for p in pieces {
            let Piece::Word { glyphs, .. } = p else { continue };
            for g in glyphs {
                if let GlyphFont::Face(f) = g.font {
                    match per_face.iter_mut().find(|(x, _)| *x == f) {
                        Some((_, v)) => v.push((g.code as u16, g.text.clone())),
                        None => per_face.push((f, vec![(g.code as u16, g.text.clone())])),
                    }
                }
            }
        }
        let mut face_font: HashMap<usize, ObjectId> = HashMap::new();
        for (f, glyphs) in &per_face {
            face_font.insert(*f, self.embed(*f, glyphs, backup)?);
        }
        let mut per_sibling: Vec<(usize, Vec<(u32, String)>)> = Vec::new();
        for g in pieces.iter().flat_map(piece_glyphs) {
            if let GlyphFont::Sibling(fi) = g.font {
                let i = match per_sibling.iter().position(|(x, _)| *x == fi) {
                    Some(i) => i,
                    None => {
                        per_sibling.push((fi, Vec::new()));
                        per_sibling.len() - 1
                    }
                };
                if !per_sibling[i].1.iter().any(|(c, _)| *c == g.code) {
                    per_sibling[i].1.push((g.code, g.text.clone()));
                }
            }
        }
        // A sibling of a Type 0 font also declares the widths of its codes the font leaves to
        // `/DW` (glyphs the subset never drew), from the program, so readers advance by the real
        // width.
        let mut sibling_font: HashMap<usize, ObjectId> = HashMap::new();
        let mut sibling_width: HashMap<(usize, u32), f64> = HashMap::new();
        for (fi, map) in &per_sibling {
            let f = &pc.fonts[*fi];
            let id = f.object_id.ok_or_else(|| limit("inline-font"))?;
            let mut widths: Vec<(u32, f64)> = Vec::new();
            if f.kind == crate::font::FontKind::Type0 {
                for (code, _) in map {
                    if f.declares_width(*code) {
                        continue;
                    }
                    let w = f.truetype_program().zip(f.program_gid(*code)).map(|(d, gid)| face_width(d, gid));
                    if let Some(w) = w.filter(|w| *w > 0.0) {
                        widths.push((*code, w));
                        sibling_width.insert((*fi, *code), w);
                    }
                }
            }
            sibling_font.insert(*fi, self.sibling_font(id, if f.two_byte { 2 } else { 1 }, map, &widths, backup)?);
        }
        let mut names: HashMap<GlyphFont, Vec<u8>> = HashMap::new();
        names.insert(GlyphFont::Page(state.font), state.font_res.clone());
        let kern = |d: f64| -d * 1000.0 / tfs;
        let (runs, total) = runs_of(pieces);
        let mut out: Vec<(Vec<Item>, Vec<Expect>)> = Vec::new();
        for list in lists {
            // Each list starts and ends at the line's font and rise, its pen at the segment's
            // start and end.
            let mut items: Vec<Item> = Vec::new();
            let mut expect: Vec<Expect> = Vec::new();
            let mut cur_font = GlyphFont::Page(state.font);
            let mut cur_rise = 0.0f64;
            let mut pen = 0.0f64;
            for &r in list {
                let run = &runs[r];
                if (run.start - pen).abs() > 1e-9 {
                    items.push(Item::Kern(kern(run.start - pen)));
                    pen = run.start;
                }
                for p in &pieces[run.range.clone()] {
                    let glyphs: &[NewGlyph] = match p {
                        Piece::Word { text, glyphs, actual, .. } => {
                            if *actual {
                                items.push(Item::BeginSpan(text.clone()));
                            }
                            glyphs
                        }
                        Piece::Space { glyph: Some(g), .. } => std::slice::from_ref(g),
                        Piece::Space { glyph: None, adv, .. } => {
                            items.push(Item::Kern(kern(*adv)));
                            pen += adv;
                            continue;
                        }
                    };
                    for g in glyphs {
                        if g.font != cur_font {
                            let name = match names.get(&g.font) {
                                Some(n) => n.clone(),
                                None => {
                                    let obj = match g.font {
                                        GlyphFont::Page(fi) => pc.fonts[fi].object_id.ok_or_else(|| limit("inline-font"))?,
                                        GlyphFont::Face(f) => face_font[&f],
                                        GlyphFont::Sibling(fi) => sibling_font[&fi],
                                    };
                                    let n = self.font_resource(page_id, pc, source, obj, backup)?;
                                    names.insert(g.font, n.clone());
                                    n
                                }
                            };
                            items.push(Item::Font(name, tfs));
                            cur_font = g.font;
                        }
                        if (g.y_off - cur_rise).abs() > 1e-9 {
                            items.push(Item::Rise(state.rise + g.y_off));
                            cur_rise = g.y_off;
                        }
                        let (bytes, code, actual, obj) = match g.font {
                            GlyphFont::Page(fi) => {
                                let f = &pc.fonts[fi];
                                (f.code_bytes(g.code), g.code, natural(f, g.code, state), f.object_id)
                            }
                            GlyphFont::Sibling(fi) => {
                                let f = &pc.fonts[fi];
                                let w = match sibling_width.get(&(fi, g.code)) {
                                    Some(w) => w / 1000.0 * tfs + state.tc,
                                    None => natural(f, g.code, state),
                                };
                                (f.code_bytes(g.code), g.code, w, Some(sibling_font[&fi]))
                            }
                            GlyphFont::Face(f) => {
                                let embed = self.embeds[f].as_ref().expect("embedded above");
                                let cid = embed.code_for(g.code as u16, &g.text);
                                let w = face_width(&self.faces[f].data, g.code as u16) / 1000.0;
                                (cid.to_be_bytes().to_vec(), cid as u32, w * tfs + state.tc, Some(face_font[&f]))
                            }
                        };
                        if g.x_off.abs() > 1e-9 {
                            items.push(Item::Kern(kern(g.x_off)));
                        }
                        items.push(Item::Bytes(bytes));
                        items.push(Item::Kern(kern(g.adv - g.x_off - actual)));
                        expect.push(Expect { code, font: obj, along: pen + g.x_off, rise: g.y_off });
                        pen += g.adv;
                    }
                    if matches!(p, Piece::Word { actual: true, .. }) {
                        items.push(Item::EndSpan);
                    }
                }
            }
            if (total - pen).abs() > 1e-9 {
                items.push(Item::Kern(kern(total - pen)));
            }
            if cur_rise.abs() > 1e-9 {
                items.push(Item::Rise(state.rise));
            }
            if cur_font != GlyphFont::Page(state.font) {
                items.push(Item::Font(state.font_res.clone(), tfs));
            }
            out.push((items, expect));
        }
        Ok(out)
    }
}

/// A run of pieces in one font (a space drawn as a gap joins the run before it), in visual order.
struct Run {
    range: std::ops::Range<usize>,
    /// Font of its glyphs (`None`: gaps only).
    font: Option<GlyphFont>,
    /// Offset along the baseline from the segment's start, text space.
    start: f64,
    /// Smallest byte offset of its pieces in the segment (logical order).
    at: usize,
}

/// The pieces' runs and their total width.
fn runs_of(pieces: &[Piece]) -> (Vec<Run>, f64) {
    let mut runs: Vec<Run> = Vec::new();
    let mut x = 0.0f64;
    for (i, p) in pieces.iter().enumerate() {
        let (font, at, w) = match p {
            Piece::Word { glyphs, at, .. } => (glyphs.first().map(|g| g.font), *at, glyphs.iter().map(|g| g.adv).sum::<f64>()),
            Piece::Space { glyph, at, adv } => (glyph.as_ref().map(|g| g.font), *at, *adv),
        };
        match runs.last_mut() {
            Some(r) if font.is_none() || r.font.is_none() || font == r.font => {
                r.range.end = i + 1;
                r.at = r.at.min(at);
                r.font = r.font.or(font);
            }
            _ => runs.push(Run { range: i..i + 1, font, start: x, at }),
        }
        x += w;
    }
    (runs, x)
}

/// The text a reader gets from the glyphs' own Unicode mappings, in logical order: left to
/// right, or right to left for a right-to-left run (as readers reorder Word-style files).
fn plain_reading(pc: &PageContent, glyphs: &[NewGlyph], rtl: bool) -> String {
    let mut parts: Vec<String> = glyphs
        .iter()
        .map(|g| match g.font {
            GlyphFont::Page(fi) => pc.fonts[fi].reader_unicode(g.code).unwrap_or_else(|| "\u{FFFD}".into()),
            // PDFium reads a right-to-left glyph mapped to nothing as U+FFFE: such a word
            // needs ActualText.
            GlyphFont::Face(_) if rtl && g.text.is_empty() => "\u{FFFD}".into(),
            GlyphFont::Face(_) | GlyphFont::Sibling(_) => g.text.clone(),
        })
        .collect();
    if rtl {
        parts.reverse();
    }
    script::canonical_marks(&script::fold_presentation(&parts.concat()))
}

/// The glyphs a piece draws.
fn piece_glyphs(p: &Piece) -> &[NewGlyph] {
    match p {
        Piece::Word { glyphs, .. } => glyphs,
        Piece::Space { glyph: Some(g), .. } => std::slice::from_ref(g),
        Piece::Space { glyph: None, .. } => &[],
    }
}

/// The word's page glyphs moved to their fonts' siblings, or `None` when a glyph is not a page
/// glyph, has no known text, or its font cannot have a sibling (inline, Type 3, or codes of
/// another length than the ToUnicode written for it).
fn sibling(pc: &PageContent, glyphs: &[NewGlyph]) -> Option<Vec<NewGlyph>> {
    glyphs
        .iter()
        .map(|g| {
            let GlyphFont::Page(fi) = g.font else { return None };
            let f = &pc.fonts[fi];
            let width = if f.two_byte { 2 } else { 1 };
            let ok = !g.text.is_empty()
                && f.object_id.is_some()
                && f.kind != crate::font::FontKind::Type3
                && f.code_bytes(g.code).len() == width;
            ok.then(|| NewGlyph { font: GlyphFont::Sibling(fi), ..g.clone() })
        })
        .collect()
}

/// A space between new words: the style font's own space glyph, else an empty advance.
fn space_piece(ctx: &Ctx, style: usize, at: usize) -> Piece {
    let font = &ctx.pc.fonts[style];
    if font.object_id.is_some() {
        let seen: HashSet<u32> = ctx.pc.glyphs.iter().filter(|g| g.font == style).map(|g| g.code).collect();
        if let Some(code) = font.encode(' ', &seen) {
            let adv = natural(font, code, ctx.state);
            let glyph = NewGlyph { font: GlyphFont::Page(style), code, text: String::new(), adv, x_off: 0.0, y_off: 0.0 };
            return Piece::Space { glyph: Some(glyph), adv, at };
        }
    }
    Piece::Space { glyph: None, adv: 0.25 * ctx.state.tfs, at }
}

type Checked = (Vec<usize>, Vec<Option<usize>>);

/// Compares the page before and after: kept glyphs unchanged at their planned place, new
/// glyphs exactly as planned. Returns the indices in `after` of new and moved glyphs, and
/// where each glyph of `before` went.
// `!(x <= tol)` is deliberate: it also rejects NaN.
#[allow(clippy::neg_cmp_op_on_partial_ord)]
fn check(
    before: &PageContent,
    after: &PageContent,
    plan: &Plan,
    (expect, tail_expect): (&[Expect], &[Expect]),
    start: f64,
    angle: f64,
    state: &ShowState,
) -> Result<Checked> {
    let fail = |r: &'static str, m: String| Err(verify(r, m));
    let kept = before.glyphs.len() - plan.removed.len();
    let new = expect.len() + tail_expect.len();
    if after.glyphs.len() != kept + new {
        return fail("glyph-mismatch", format!("expected {} glyphs after the edit, found {}", kept + new, after.glyphs.len()));
    }
    let (dx, dy) = (angle.cos(), angle.sin());
    let anchor = &before.glyphs[plan.anchor];
    let k = state.th * state.scale;
    let base_u = along(anchor.origin, angle);
    let mut touched = Vec::new();
    let mut map = vec![None; before.glyphs.len()];
    let mut j = 0;
    let place_new = |expect: &[Expect], j: &mut usize, touched: &mut Vec<usize>| -> Result<()> {
        for e in expect {
            let h = &after.glyphs[*j];
            let du = start + e.along * k - base_u;
            let target =
                (anchor.origin.0 + du * dx + e.rise * state.rise_dir.0, anchor.origin.1 + du * dy + e.rise * state.rise_dir.1);
            let off = (h.origin.0 - target.0).hypot(h.origin.1 - target.1);
            if h.code != e.code || after.fonts[h.font].object_id != e.font {
                return Err(verify("glyph-mismatch", format!("new glyph {j} is not the planned glyph")));
            }
            if (h.size - anchor.size).abs() > 1e-6 || h.color != anchor.color || h.render_mode != anchor.render_mode {
                return Err(verify("glyph-mismatch", format!("new glyph {j} has the wrong style")));
            }
            if !(off <= TOLERANCE) {
                return Err(verify("position-drift", format!("new glyph {j} is {off:.3} pt from where it should be")));
            }
            touched.push(*j);
            *j += 1;
        }
        Ok(())
    };
    for (i, g) in before.glyphs.iter().enumerate() {
        if i == plan.anchor {
            place_new(expect, &mut j, &mut touched)?;
        }
        if plan.removed.contains(&i) {
            continue;
        }
        let h = &after.glyphs[j];
        let want = plan.want.get(&i).copied().unwrap_or(0.0);
        let target = (g.origin.0 + want * dx, g.origin.1 + want * dy);
        let moved = (h.origin.0 - target.0).hypot(h.origin.1 - target.1);
        let same_font = before.fonts[g.font].object_id == after.fonts[h.font].object_id
            && before.fonts[g.font].base_font == after.fonts[h.font].base_font;
        if h.code != g.code
            || !same_font
            || (h.size - g.size).abs() > 1e-6
            || h.color != g.color
            || h.render_mode != g.render_mode
        {
            return fail("glyph-mismatch", format!("glyph {i} ({:?}) changed", g.text));
        }
        if !(moved <= TOLERANCE) {
            return fail("position-drift", format!("glyph {i} ({:?}) is {moved:.3} pt from where it should be", g.text));
        }
        if want != 0.0 {
            touched.push(j);
        }
        map[i] = Some(j);
        j += 1;
        if plan.tail.is_some_and(|t| t.0 == i) {
            place_new(tail_expect, &mut j, &mut touched)?;
        }
    }
    Ok((touched, map))
}
