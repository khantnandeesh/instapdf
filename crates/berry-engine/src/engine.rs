//! The document-level API: open, read text, replace a line, save and verify.

use crate::content::{self, fmt_name, fmt_num, fmt_string, Operand};
use crate::fallback::{self, Face, FontRequest};
use crate::font::{strip_subset_prefix, FontKind, PdfFont};
use crate::geom::Rect;
use crate::interp::{self, FontCache, Glyph, PageContent, Segment, ShowKind, ShowState, SourceKind, TextEvent};
use crate::layout::{self, Line, Paragraph};
use lopdf::{Dictionary, Document, IncrementalDocument, Object, ObjectId, Stream};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::rc::Rc;
use subsetter::GlyphRemapper;

/// Largest position error we accept for a glyph that should not have moved, in points.
const POSITION_TOLERANCE: f64 = 0.05;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Error {
    /// The file could not be read as a PDF.
    Parse {
        message: String,
    },
    /// The file is encrypted and needs a password.
    Encrypted,
    BadPage,
    BadLine,
    /// No font with that object number.
    BadFont,
    /// The line cannot be edited (vertical text, unsupported encoding, invisible text).
    ReadOnly {
        reason: String,
    },
    /// No registered font can draw these characters. Register one of `request.families`
    /// (or any font that covers them) with `add_font` and try again.
    MissingGlyphs {
        chars: String,
        request: FontRequest,
    },
    Unsupported {
        reason: String,
    },
    /// The edit was computed but failed its own check, so nothing was changed.
    Verify {
        message: String,
    },
    Save {
        message: String,
    },
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Debug, Serialize)]
pub struct FontInfo {
    /// Name without the subset prefix, e.g. `Carlito-Bold`.
    pub name: String,
    /// Family part of the name, e.g. `Carlito`.
    pub family: String,
    pub kind: FontKind,
    pub embedded: bool,
    pub subset: bool,
    pub bold: bool,
    pub italic: bool,
    pub serif: bool,
    pub monospace: bool,
    /// PDF object number of the font dictionary, when it is an indirect object.
    pub object: Option<u32>,
    /// Open fonts that can stand in for this one, best first.
    pub stand_ins: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct PageText {
    /// Zero-based page index.
    pub page: usize,
    /// `[x0, y0, x1, y1]` of the visible page (CropBox, else MediaBox) in PDF units.
    pub page_box: [f64; 4],
    /// Page rotation in degrees clockwise (0, 90, 180, 270).
    pub rotation: i64,
    pub fonts: Vec<FontInfo>,
    pub lines: Vec<Line>,
    pub paragraphs: Vec<Paragraph>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Substitution {
    pub chars: String,
    pub original_font: String,
    pub substitute_font: String,
    /// The substitute is the same family as the original, so the text looks the same.
    pub same_family: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct EditResult {
    /// The page's text after the edit. Line ids may have changed.
    pub page: PageText,
    /// Page regions whose pixels may differ from before. Everything outside must be identical.
    pub changed: Vec<Rect>,
    /// Characters drawn with a stand-in font because the original lacks them.
    pub substitutions: Vec<Substitution>,
    /// How far the rest of the line moved along its baseline, in points.
    pub shift: f64,
}

/// Which characters of a string a font can draw.
#[derive(Clone, Debug, Serialize)]
pub struct Coverage {
    /// Distinct characters the font draws, in order of first use.
    pub covered: String,
    /// Distinct characters it cannot draw (or that we cannot prove it draws).
    pub missing: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Match {
    pub page: usize,
    pub line: usize,
    /// Character range `[start, end)` in the line's text.
    pub start: usize,
    pub end: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct SaveReport {
    pub bytes_before: usize,
    pub bytes_after: usize,
    /// Objects written in the appended revision.
    pub objects_written: usize,
    /// The original bytes are an untouched prefix of the output.
    pub original_preserved: bool,
    /// Every object read back from the output equals what the engine holds.
    pub objects_verified: usize,
    pub pages_edited: Vec<usize>,
}

#[derive(Clone)]
struct Embed {
    type0: ObjectId,
    cid: ObjectId,
    desc: ObjectId,
    file: ObjectId,
    to_unicode: ObjectId,
    remap: GlyphRemapper,
    /// New glyph id → (character, glyph id in the full font).
    chars: BTreeMap<u16, (char, u16)>,
}

pub struct Engine {
    orig: Vec<u8>,
    doc: Document,
    pages: Vec<ObjectId>,
    cache: FontCache,
    dirty: BTreeSet<ObjectId>,
    faces: Vec<Face>,
    embeds: Vec<Option<Embed>>,
    edited_pages: BTreeSet<usize>,
}

/// One planned piece of new text.
enum Seg {
    /// Bytes in the anchor operator's own font.
    Orig { bytes: Vec<u8>, text: String, width_em: f64, spaces: usize },
    /// Bytes in a fallback face.
    Fallback { face: usize, gids: Vec<u16>, text: String, width_em: f64 },
    /// A space the font cannot draw: an empty advance.
    Gap { width_em: f64 },
}

enum Item {
    Bytes(Vec<u8>),
    Kern(f64),
    Font(Vec<u8>, f64),
    Td(f64),
}

struct Plan {
    removed: HashSet<usize>,
    want: HashMap<usize, f64>,
    anchor: usize,
    after: bool,
    segs: Vec<Seg>,
}

fn limit(reason: &'static str) -> Error {
    Error::Unsupported { reason: reason.to_string() }
}

fn deref<'a>(doc: &'a Document, o: &'a Object) -> &'a Object {
    doc.dereference(o).map(|(_, o)| o).unwrap_or(o)
}

fn count_refs(doc: &Document, target: ObjectId) -> usize {
    fn walk(o: &Object, target: ObjectId, n: &mut usize) {
        match o {
            Object::Reference(id) if *id == target => *n += 1,
            Object::Array(a) => a.iter().for_each(|x| walk(x, target, n)),
            Object::Dictionary(d) => d.iter().for_each(|(_, x)| walk(x, target, n)),
            Object::Stream(s) => s.dict.iter().for_each(|(_, x)| walk(x, target, n)),
            _ => {}
        }
    }
    let mut n = 0;
    for o in doc.objects.values() {
        walk(o, target, &mut n);
    }
    n
}

fn fmt_kern(v: f64) -> String {
    let r = (v * 1000.0).round() / 1000.0;
    if (r - v).abs() < 1e-9 {
        fmt_num(v)
    } else {
        format!("{v}")
    }
}

fn new_stream(data: Vec<u8>) -> Stream {
    let mut s = Stream::new(Dictionary::new(), data);
    let _ = s.compress();
    s
}

impl Engine {
    /// Opens a PDF. `password` is tried when the file is encrypted.
    pub fn open(bytes: Vec<u8>, password: Option<&str>) -> Result<Engine> {
        let doc = match password {
            Some(p) => Document::load_mem_with_options(&bytes, lopdf::LoadOptions::with_password(p)),
            None => Document::load_mem(&bytes),
        }
        .map_err(|e| Error::Parse { message: e.to_string() })?;
        if doc.is_encrypted() {
            return Err(Error::Encrypted);
        }
        let pages: Vec<ObjectId> = doc.get_pages().into_values().collect();
        Ok(Engine {
            orig: bytes,
            doc,
            pages,
            cache: FontCache::default(),
            dirty: BTreeSet::new(),
            faces: Vec::new(),
            embeds: Vec::new(),
            edited_pages: BTreeSet::new(),
        })
    }

    pub fn page_count(&self) -> usize {
        self.pages.len()
    }

    /// Registers an open-licensed TrueType font the engine may embed for missing characters.
    /// Returns false when the file is not a usable TrueType (glyf) font.
    pub fn add_font(&mut self, family: &str, bold: bool, italic: bool, data: Vec<u8>) -> bool {
        let ok = ttf_parser::Face::parse(&data, 0).map(|f| f.tables().glyf.is_some()).unwrap_or(false);
        if ok && !self.faces.iter().any(|f| f.family == family && f.bold == bold && f.italic == italic) {
            self.faces.push(Face { family: family.to_string(), bold, italic, data: Rc::new(data) });
            self.embeds.push(None);
        }
        ok
    }

    fn page_id(&self, page: usize) -> Result<ObjectId> {
        self.pages.get(page).copied().ok_or(Error::BadPage)
    }

    fn inherited(&self, page_id: ObjectId, key: &[u8]) -> Option<&Object> {
        let mut node = self.doc.get_dictionary(page_id).ok();
        for _ in 0..64 {
            let n = node?;
            if let Ok(v) = n.get(key) {
                return Some(deref(&self.doc, v));
            }
            node = n.get(b"Parent").ok().and_then(|p| p.as_reference().ok()).and_then(|id| self.doc.get_dictionary(id).ok());
        }
        None
    }

    fn font_info(f: &PdfFont) -> FontInfo {
        FontInfo {
            name: strip_subset_prefix(&f.base_font).0.to_string(),
            family: strip_subset_prefix(&f.base_font).0.split([',', '-']).next().unwrap_or("").to_string(),
            kind: f.kind,
            embedded: f.embedded,
            subset: f.subset,
            bold: f.is_bold(),
            italic: f.is_italic(),
            serif: f.is_serif(),
            monospace: f.is_monospace(),
            object: f.object_id.map(|i| i.0),
            stand_ins: fallback::request_for(f).families,
        }
    }

    fn describe(&self, page: usize, pc: &PageContent, lines: Vec<Line>, paragraphs: Vec<Paragraph>) -> PageText {
        let page_id = self.pages[page];
        let read_box = |key: &[u8]| -> Option<[f64; 4]> {
            let a = self.inherited(page_id, key)?.as_array().ok()?;
            let v: Vec<f64> = a.iter().filter_map(|o| deref(&self.doc, o).as_float().ok()).map(f64::from).collect();
            (v.len() == 4).then(|| [v[0].min(v[2]), v[1].min(v[3]), v[0].max(v[2]), v[1].max(v[3])])
        };
        let page_box = read_box(b"CropBox").or_else(|| read_box(b"MediaBox")).unwrap_or([0.0, 0.0, 612.0, 792.0]);
        let rotation = self.inherited(page_id, b"Rotate").and_then(|o| o.as_i64().ok()).unwrap_or(0).rem_euclid(360);
        PageText { page, page_box, rotation, fonts: pc.fonts.iter().map(|f| Self::font_info(f)).collect(), lines, paragraphs }
    }

    /// Every font in the document, once each, ordered by object number.
    pub fn fonts(&mut self) -> Vec<FontInfo> {
        let ids: Vec<ObjectId> = self
            .doc
            .objects
            .iter()
            .filter(|(_, o)| {
                o.as_dict().is_ok_and(|d| {
                    let sub = d.get(b"Subtype").ok().and_then(|s| s.as_name().ok()).unwrap_or(b"");
                    d.has_type(b"Font") && !sub.starts_with(b"CIDFontType")
                })
            })
            .map(|(id, _)| *id)
            .collect();
        ids.into_iter().filter_map(|id| self.cache.get(&self.doc, &Object::Reference(id))).map(|f| Self::font_info(&f)).collect()
    }

    /// Which characters of `text` the font with this object number can draw. Blank characters
    /// count as covered. Use it to show coverage in a font menu before the user commits.
    pub fn coverage(&mut self, font_object: u32, text: &str) -> Result<Coverage> {
        let id = self.doc.objects.keys().find(|k| k.0 == font_object).copied().ok_or(Error::BadFont)?;
        let is_font = self.doc.get_dictionary(id).is_ok_and(|d| d.has_type(b"Font"));
        let font = is_font.then(|| self.cache.get(&self.doc, &Object::Reference(id))).flatten().ok_or(Error::BadFont)?;
        let none = HashSet::new();
        let mut out = Coverage { covered: String::new(), missing: String::new() };
        for ch in text.chars() {
            if out.covered.contains(ch) || out.missing.contains(ch) {
                continue;
            }
            if ch.is_whitespace() || font.encode(ch, &none).is_some() {
                out.covered.push(ch);
            } else {
                out.missing.push(ch);
            }
        }
        Ok(out)
    }

    /// Text of a page: lines with runs, words, fonts and positions, and paragraphs.
    pub fn page_text(&mut self, page: usize) -> Result<PageText> {
        let page_id = self.page_id(page)?;
        let pc = interp::interpret_page(&self.doc, &mut self.cache, page_id).map_err(limit)?;
        let (lines, paragraphs) = layout::group(&pc);
        Ok(self.describe(page, &pc, lines, paragraphs))
    }

    /// Finds `needle` in the page's lines.
    pub fn find(&mut self, page: usize, needle: &str, match_case: bool) -> Result<Vec<Match>> {
        let text = self.page_text(page)?;
        let fold = |s: &str| if match_case { s.to_string() } else { s.to_lowercase() };
        let needle: Vec<char> = fold(needle).chars().collect();
        let mut out = Vec::new();
        if needle.is_empty() {
            return Ok(out);
        }
        for line in &text.lines {
            // Fold per character so that offsets stay valid.
            let hay: Vec<char> = line.text.chars().map(|c| fold(&c.to_string()).chars().next().unwrap_or(c)).collect();
            let mut i = 0;
            while i + needle.len() <= hay.len() {
                if hay[i..i + needle.len()] == needle[..] {
                    out.push(Match { page, line: line.id, start: i, end: i + needle.len() });
                    i += needle.len();
                } else {
                    i += 1;
                }
            }
        }
        Ok(out)
    }

    /// Replaces characters `[start, end)` of a line with `text`.
    pub fn replace_range(&mut self, page: usize, line: usize, start: usize, end: usize, text: &str) -> Result<EditResult> {
        let page_id = self.page_id(page)?;
        let pc = interp::interpret_page(&self.doc, &mut self.cache, page_id).map_err(limit)?;
        let (lines, _) = layout::group(&pc);
        let l = lines.get(line).ok_or(Error::BadLine)?;
        if start > end || end > l.text.chars().count() {
            return Err(Error::BadLine);
        }
        // Map character offsets to line characters, widening to whole glyphs (ligatures) and
        // keeping the part of a widened glyph that lies outside the range.
        let mut a = l.chars.len();
        let mut b = l.chars.len();
        let mut lead = String::new();
        let mut tail = String::new();
        let mut off = 0;
        for (i, c) in l.chars.iter().enumerate() {
            let len = c.text.chars().count();
            if a == l.chars.len() && start < off + len.max(1) && (start < off + len || len == 0) {
                a = i;
                lead = c.text.chars().take(start - off).collect();
            }
            if end <= off && b == l.chars.len() {
                b = i;
            } else if end > off && end < off + len && b == l.chars.len() {
                b = i + 1;
                tail = c.text.chars().skip(end - off).collect();
            }
            off += len;
        }
        if start == end && a > b {
            a = b;
        }
        let inserted = format!("{lead}{text}{tail}");
        self.edit_span(page, page_id, pc, lines, line, a, b, inserted)
    }

    /// Replaces a line's text. Only the characters that differ are rewritten; the rest of the
    /// line shifts by the change in width and nothing else on the page moves.
    pub fn replace_line(&mut self, page: usize, line_id: usize, new_text: &str) -> Result<EditResult> {
        let page_id = self.page_id(page)?;
        let pc = interp::interpret_page(&self.doc, &mut self.cache, page_id).map_err(limit)?;
        let (lines, _) = layout::group(&pc);
        let line = lines.get(line_id).ok_or(Error::BadLine)?;
        if let Some(r) = line.read_only_reason {
            return Err(Error::ReadOnly { reason: r.to_string() });
        }

        // 1. Diff at character level, then widen to whole glyphs.
        let old: Vec<(char, usize)> =
            line.chars.iter().enumerate().flat_map(|(i, c)| c.text.chars().map(move |ch| (ch, i))).collect();
        let new: Vec<char> = new_text.chars().filter(|c| !matches!(c, '\n' | '\r')).collect();
        let mut p = 0;
        while p < old.len() && p < new.len() && old[p].0 == new[p] {
            p += 1;
        }
        let mut s = 0;
        while s < old.len() - p && s < new.len() - p && old[old.len() - 1 - s].0 == new[new.len() - 1 - s] {
            s += 1;
        }
        let n = line.chars.len();
        // First line char touched, and first line char after the change.
        let mut a = if p < old.len() { old[p].1 } else { n };
        let mut b = if s > 0 { old[old.len() - s].1 } else { n };
        // A boundary inside a multi-character glyph (ligature) widens to the whole glyph.
        if p < old.len() && p > 0 && old[p - 1].1 == old[p].1 {
            a = old[p].1;
        }
        if s > 0 && old.len() - s > 0 && old[old.len() - s - 1].1 == old[old.len() - s].1 {
            b = old[old.len() - s].1 + 1;
        }
        if b < a {
            b = a;
        }
        let before: usize = old.iter().filter(|(_, i)| *i < a).count();
        let after: usize = old.iter().filter(|(_, i)| *i >= b).count();
        if before + after > new.len() {
            // Overlapping prefix and suffix (e.g. "aaa" → "aa"): give the overlap to the suffix.
            a = a.min(b);
        }
        let before: usize = old.iter().filter(|(_, i)| *i < a).count();
        let inserted: String =
            new[before.min(new.len())..new.len().saturating_sub(after).max(before.min(new.len()))].iter().collect();
        self.edit_span(page, page_id, pc, lines, line_id, a, b, inserted)
    }

    /// Replaces line characters `[a, b)` with `inserted`.
    #[allow(clippy::too_many_arguments)]
    fn edit_span(
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
        let line = lines.get(line_id).ok_or(Error::BadLine)?;
        if let Some(r) = line.read_only_reason {
            return Err(Error::ReadOnly { reason: r.to_string() });
        }
        let n = line.chars.len();
        if a > b || b > n {
            return Err(Error::BadLine);
        }
        if pc.incomplete {
            return Err(Error::Unsupported { reason: "undecodable-content".into() });
        }
        if a == b && inserted.is_empty() {
            let page_text = self.page_text(page)?;
            return Ok(EditResult { page: page_text, changed: Vec::new(), substitutions: Vec::new(), shift: 0.0 });
        }

        // 2. Positions along the baseline.
        let ang = pc.glyphs[line.glyphs[0]].angle;
        let along = |pt: (f64, f64)| pt.0 * ang.cos() + pt.1 * ang.sin();
        let glyph_of = |i: usize| line.chars[i].glyph.map(|g| &pc.glyphs[g]);
        let prev_real = |i: usize| (0..i).rev().find_map(|k| line.chars[k].glyph);
        let pos = |i: usize| -> f64 {
            if i < n {
                if let Some(g) = glyph_of(i) {
                    return along(g.origin);
                }
            }
            let g = &pc.glyphs[prev_real(i).expect("a line starts with a glyph")];
            along(g.origin) + g.advance
        };

        // 3. Where the new text goes and which style it takes.
        let (anchor, after_anchor) =
            if a < n && line.chars[a].glyph.is_some() && !(a == b && a > 0 && line.chars[a - 1].glyph.is_some()) {
                (line.chars[a].glyph.unwrap(), false)
            } else {
                (prev_real(a).ok_or(Error::BadLine)?, true)
            };
        let anchor_glyph = &pc.glyphs[anchor];
        let state = show_state(&pc, anchor).ok_or(Error::BadLine)?.clone();
        let font = pc.fonts[anchor_glyph.font].clone();
        let mut seen: HashSet<u32> = HashSet::new();
        for g in &pc.glyphs {
            if g.font == anchor_glyph.font {
                seen.insert(g.code);
            }
        }

        // 4. Choose a font for every new character.
        let request = fallback::request_for(&font);
        let mut segs: Vec<Seg> = Vec::new();
        let mut missing = String::new();
        let mut substitutions: Vec<Substitution> = Vec::new();
        for ch in inserted.chars() {
            if let Some(code) = font.encode(ch, &seen) {
                let bytes = font.code_bytes(code);
                let w = font.width(code) / 1000.0;
                let space = font.is_word_space(code, bytes.len()) as usize;
                match segs.last_mut() {
                    Some(Seg::Orig { bytes: b0, text, width_em, spaces }) => {
                        b0.extend(bytes);
                        text.push(ch);
                        *width_em += w;
                        *spaces += space;
                    }
                    _ => segs.push(Seg::Orig { bytes, text: ch.to_string(), width_em: w, spaces: space }),
                }
                continue;
            }
            if ch == ' ' || ch == '\u{a0}' {
                // Many subsets have no space glyph: leave a gap of a typical space width.
                segs.push(Seg::Gap { width_em: 0.25 });
                continue;
            }
            let Some(fi) = fallback::pick(&self.faces, &request, ch) else {
                missing.push(ch);
                continue;
            };
            let face = &self.faces[fi];
            let gid = face.glyph(ch).expect("pick checked coverage");
            let w = ttf_parser::Face::parse(&face.data, 0)
                .ok()
                .and_then(|f| {
                    f.glyph_hor_advance(ttf_parser::GlyphId(gid))
                        .map(|w| (w as f64 * 1000.0 / f.units_per_em() as f64).round() / 1000.0)
                })
                .unwrap_or(0.5);
            let name =
                format!("{}{}{}", face.family, if face.bold { " Bold" } else { "" }, if face.italic { " Italic" } else { "" });
            match substitutions.last_mut() {
                Some(sub) if sub.substitute_font == name => sub.chars.push(ch),
                _ => substitutions.push(Substitution {
                    chars: ch.to_string(),
                    original_font: strip_subset_prefix(&font.base_font).0.to_string(),
                    substitute_font: name,
                    same_family: fallback::normalize(&face.family) == fallback::family_stem(&font.base_font),
                }),
            }
            match segs.last_mut() {
                Some(Seg::Fallback { face: f0, gids, text, width_em }) if *f0 == fi => {
                    gids.push(gid);
                    text.push(ch);
                    *width_em += w;
                }
                _ => segs.push(Seg::Fallback { face: fi, gids: vec![gid], text: ch.to_string(), width_em: w }),
            }
        }
        if !missing.is_empty() {
            return Err(Error::MissingGlyphs { chars: missing, request });
        }

        // 5. Width of the new text and the shift of the rest of the line.
        let unit = state.th * state.scale;
        let mut new_width = 0.0;
        for seg in &segs {
            new_width += match seg {
                Seg::Orig { text, width_em, spaces, .. } => {
                    (width_em * state.tfs + state.tc * text.chars().count() as f64 + state.tw * *spaces as f64) * unit
                }
                Seg::Fallback { text, width_em, .. } => (width_em * state.tfs + state.tc * text.chars().count() as f64) * unit,
                Seg::Gap { width_em } => width_em * state.tfs * unit,
            };
        }
        let shift = new_width - (pos(b) - pos(a));
        let mut plan = Plan { removed: HashSet::new(), want: HashMap::new(), anchor, after: after_anchor, segs };
        plan.removed.extend(line.chars[a..b].iter().filter_map(|c| c.glyph));
        for g in line.chars[b..n].iter().filter_map(|c| c.glyph) {
            plan.want.insert(g, shift);
        }

        // 6. Apply inside a transaction and check the result before keeping it.
        let old_box = line.bbox;
        let snapshot = (self.doc.max_id, self.dirty.clone(), self.embeds.clone());
        let mut backup: Vec<(ObjectId, Option<Object>)> = Vec::new();
        let outcome = self.apply(page_id, &pc, &plan, &state, &mut backup).and_then(|()| {
            let after = interp::interpret_page(&self.doc, &mut self.cache, page_id).map_err(limit)?;
            let touched = check_edit(&pc, &after, &plan, ang)?;
            Ok((after, touched))
        });
        let (after, touched) = match outcome {
            Ok(v) => v,
            Err(e) => {
                for (id, old) in backup.into_iter().rev() {
                    match old {
                        Some(o) => {
                            self.doc.objects.insert(id, o);
                        }
                        None => {
                            self.doc.objects.remove(&id);
                        }
                    }
                }
                self.doc.max_id = snapshot.0;
                self.dirty = snapshot.1;
                self.embeds = snapshot.2;
                self.cache.clear();
                return Err(e);
            }
        };
        self.edited_pages.insert(page);

        let (lines, paragraphs) = layout::group(&after);
        // Everything that may look different: the old line, and every new or moved glyph in the
        // result, with its full advance (spacing included) and room for taller fallback fonts.
        let mut union = old_box;
        for &gi in &touched {
            union = union.union(&layout::glyph_rect(&after, &after.glyphs[gi]));
        }
        let pad = line.size * 0.35;
        let changed = vec![Rect { x0: union.x0 - 1.0, y0: union.y0 - pad, x1: union.x1 + 1.0, y1: union.y1 + pad }];
        Ok(EditResult { page: self.describe(page, &after, lines, paragraphs), changed, substitutions, shift })
    }

    /// How many pages can draw this Form XObject: through their own or inherited resources,
    /// or through forms those resources hold. A form in a resource dictionary that several
    /// pages share must be copied before it is edited.
    fn pages_reaching(&self, form: ObjectId) -> usize {
        let mut count = 0;
        for &page in &self.pages {
            let mut stack: Vec<&Dictionary> = interp::page_resources(&self.doc, page);
            let mut seen: HashSet<ObjectId> = HashSet::new();
            let mut found = false;
            while let Some(res) = stack.pop() {
                let Some(xobjects) = res.get(b"XObject").ok().and_then(|o| deref(&self.doc, o).as_dict().ok()) else {
                    continue;
                };
                for (_, v) in xobjects.iter() {
                    let Ok(id) = v.as_reference() else { continue };
                    if id == form {
                        found = true;
                        break;
                    }
                    if seen.len() < 10_000 && seen.insert(id) {
                        if let Ok(Object::Stream(st)) = self.doc.get_object(id) {
                            if let Some(r) = st.dict.get(b"Resources").ok().and_then(|o| deref(&self.doc, o).as_dict().ok()) {
                                stack.push(r);
                            }
                        }
                    }
                }
                if found {
                    break;
                }
            }
            count += found as usize;
            if count > 1 {
                break;
            }
        }
        count
    }

    fn touch(&mut self, id: ObjectId, backup: &mut Vec<(ObjectId, Option<Object>)>) {
        if !backup.iter().any(|(b, _)| *b == id) {
            backup.push((id, self.doc.objects.get(&id).cloned()));
        }
        self.dirty.insert(id);
    }

    fn add_object(&mut self, o: Object, backup: &mut Vec<(ObjectId, Option<Object>)>) -> ObjectId {
        let id = self.doc.add_object(o);
        backup.push((id, None));
        self.dirty.insert(id);
        id
    }

    /// Rewrites the affected show operators and commits the new streams to the document.
    fn apply(
        &mut self,
        page_id: ObjectId,
        pc: &PageContent,
        plan: &Plan,
        state: &ShowState,
        backup: &mut Vec<(ObjectId, Option<Object>)>,
    ) -> Result<()> {
        let anchor_source = pc.glyphs[plan.anchor].source;

        // Fallback fonts: make sure each is embedded and has a resource name where it is used.
        let mut seg_items: Vec<Item> = Vec::new();
        let mut switched = false;
        for seg in &plan.segs {
            match seg {
                Seg::Orig { bytes, .. } => {
                    if switched {
                        seg_items.push(Item::Font(state.font_res.clone(), state.tfs));
                        switched = false;
                    }
                    seg_items.push(Item::Bytes(bytes.clone()));
                }
                Seg::Gap { width_em } => seg_items.push(Item::Kern(-width_em * 1000.0)),
                Seg::Fallback { face, gids, text, .. } => {
                    let font_id = self.embed(*face, gids, text, backup)?;
                    let res = self.font_resource(page_id, pc, anchor_source, font_id, backup)?;
                    let embed = self.embeds[*face].as_ref().unwrap();
                    let mut bytes = Vec::new();
                    for g in gids {
                        let n = embed.remap.get(*g).unwrap_or(0);
                        bytes.extend_from_slice(&n.to_be_bytes());
                    }
                    seg_items.push(Item::Font(res, state.tfs));
                    seg_items.push(Item::Bytes(bytes));
                    switched = true;
                }
            }
        }
        if switched {
            seg_items.push(Item::Font(state.font_res.clone(), state.tfs));
        }
        let inserted_width: f64 = {
            let unit = state.th * state.scale;
            plan.segs
                .iter()
                .map(|seg| match seg {
                    Seg::Orig { text, width_em, spaces, .. } => {
                        (width_em * state.tfs + state.tc * text.chars().count() as f64 + state.tw * *spaces as f64) * unit
                    }
                    Seg::Fallback { text, width_em, .. } => {
                        (width_em * state.tfs + state.tc * text.chars().count() as f64) * unit
                    }
                    Seg::Gap { width_em } => width_em * state.tfs * unit,
                })
                .sum()
        };

        // Rewrite each stream that holds affected glyphs.
        let mut touched: BTreeSet<usize> = BTreeSet::new();
        touched.insert(anchor_source);
        for g in plan.removed.iter().chain(plan.want.keys()) {
            touched.insert(pc.glyphs[*g].source);
        }
        let mut splices: BTreeMap<usize, Vec<(usize, Vec<u8>)>> = BTreeMap::new();
        for &si in &touched {
            let mut ins = Some(seg_items.iter());
            let reps = rewrite_source(pc, si, plan, if si == anchor_source { ins.take() } else { None }, inserted_width);
            if !reps.is_empty() {
                splices.insert(si, reps);
            }
        }

        // Forms first: a shared form is cloned and its `Do` renamed on this page only.
        let form_sources: Vec<usize> = splices.keys().copied().filter(|&si| si != 0).collect();
        for si in form_sources {
            let src = &pc.sources[si];
            let SourceKind::Form(form_id) = src.kind else { continue };
            let data = splice(&src.data, &src.ops, &splices[&si]);
            let invocations = pc.sources.iter().filter(|s| s.kind == src.kind).count();
            let shared = invocations > 1 || count_refs(&self.doc, form_id) > 1 || self.pages_reaching(form_id) > 1;
            if !shared {
                self.touch(form_id, backup);
                let stream = self
                    .doc
                    .get_object_mut(form_id)
                    .and_then(Object::as_stream_mut)
                    .map_err(|e| Error::Unsupported { reason: e.to_string() })?;
                stream.set_plain_content(data);
                let _ = stream.compress();
                continue;
            }
            let Some((parent, do_op, _)) = &src.invoked_by else { continue };
            if *parent != 0 {
                return Err(Error::Unsupported { reason: "shared-nested-form".into() });
            }
            let mut clone = self
                .doc
                .get_object(form_id)
                .and_then(Object::as_stream)
                .map_err(|e| Error::Unsupported { reason: e.to_string() })?
                .clone();
            clone.set_plain_content(data);
            let _ = clone.compress();
            let new_id = self.add_object(Object::Stream(clone), backup);
            let name = self.add_resource(page_id, None, b"XObject", "BX", new_id, backup)?;
            let mut rep = Vec::new();
            fmt_name(&name, &mut rep);
            rep.extend_from_slice(b" Do");
            splices.entry(0).or_default().push((*do_op, rep));
        }

        // Page content.
        if let Some(reps) = splices.get(&0) {
            let src = &pc.sources[0];
            self.commit_page_content(page_id, pc, &src.data, &src.ops, reps, backup)?;
        }
        Ok(())
    }

    fn commit_page_content(
        &mut self,
        page_id: ObjectId,
        pc: &PageContent,
        data: &[u8],
        ops: &[content::Op],
        reps: &[(usize, Vec<u8>)],
        backup: &mut Vec<(ObjectId, Option<Object>)>,
    ) -> Result<()> {
        let seg_of = |op: &content::Op| pc.segments.iter().position(|s| op.start >= s.start && op.end <= s.end);
        let crossing = reps.iter().any(|(oi, _)| seg_of(&ops[*oi]).is_none());
        let mut new_ids: Vec<ObjectId> = pc.segments.iter().map(|s| s.id).collect();
        let mut contents_changed = false;
        if crossing || pc.segments.is_empty() {
            // An operator spans two content streams: write the joined content as one stream.
            let joined = splice(data, ops, reps);
            let id = self.add_object(Object::Stream(new_stream(joined)), backup);
            new_ids = vec![id];
            contents_changed = true;
        } else {
            for (k, seg) in pc.segments.iter().enumerate() {
                let mine: Vec<(usize, Vec<u8>)> = reps.iter().filter(|(oi, _)| seg_of(&ops[*oi]) == Some(k)).cloned().collect();
                if mine.is_empty() {
                    continue;
                }
                let part = splice_range(data, ops, &mine, seg);
                let users = self.pages.iter().filter(|p| self.doc.get_page_contents(**p).contains(&seg.id)).count();
                let repeats = pc.segments.iter().filter(|s| s.id == seg.id).count();
                if users > 1 || repeats > 1 {
                    let id = self.add_object(Object::Stream(new_stream(part)), backup);
                    new_ids[k] = id;
                    contents_changed = true;
                } else {
                    self.touch(seg.id, backup);
                    let stream = self
                        .doc
                        .get_object_mut(seg.id)
                        .and_then(Object::as_stream_mut)
                        .map_err(|e| Error::Unsupported { reason: e.to_string() })?;
                    stream.set_plain_content(part);
                    let _ = stream.compress();
                }
            }
        }
        if contents_changed {
            self.touch(page_id, backup);
            let page = self.doc.get_dictionary_mut(page_id).map_err(|e| Error::Unsupported { reason: e.to_string() })?;
            let refs: Vec<Object> = new_ids.into_iter().map(Object::Reference).collect();
            page.set("Contents", if refs.len() == 1 { refs[0].clone() } else { Object::Array(refs) });
        }
        Ok(())
    }

    /// Adds `target` to a resource category and returns its name. `form` selects a form's own
    /// resources; otherwise the page's nearest resources are used.
    fn add_resource(
        &mut self,
        page_id: ObjectId,
        form: Option<ObjectId>,
        category: &[u8],
        prefix: &str,
        target: ObjectId,
        backup: &mut Vec<(ObjectId, Option<Object>)>,
    ) -> Result<Vec<u8>> {
        let err = |m: &str| Error::Unsupported { reason: m.to_string() };
        // Find the object that holds /Resources.
        let mut holder = form.unwrap_or(page_id);
        if form.is_none() {
            let mut node = page_id;
            for _ in 0..64 {
                let d = self.doc.get_dictionary(node).map_err(|_| err("page-tree"))?;
                if d.has(b"Resources") {
                    holder = node;
                    break;
                }
                match d.get(b"Parent").ok().and_then(|p| p.as_reference().ok()) {
                    Some(p) => node = p,
                    None => break,
                }
            }
        }
        let holder_dict = |doc: &Document| -> Option<Dictionary> {
            match doc.get_object(holder).ok()? {
                Object::Dictionary(d) => Some(d.clone()),
                Object::Stream(s) => Some(s.dict.clone()),
                _ => None,
            }
        };
        let hd = holder_dict(&self.doc).ok_or_else(|| err("resources"))?;
        // Resolve where the category dictionary lives.
        let res_ref = hd.get(b"Resources").ok().and_then(|o| o.as_reference().ok());
        let res_dict: Dictionary = match hd.get(b"Resources").ok().map(|o| deref(&self.doc, o)) {
            Some(Object::Dictionary(d)) => d.clone(),
            _ => Dictionary::new(),
        };
        let cat_ref = res_dict.get(category).ok().and_then(|o| o.as_reference().ok());
        let mut cat: Dictionary = match res_dict.get(category).ok().map(|o| deref(&self.doc, o)) {
            Some(Object::Dictionary(d)) => d.clone(),
            _ => Dictionary::new(),
        };
        // Reuse an existing name for the same object.
        for (k, v) in cat.iter() {
            if v.as_reference().ok() == Some(target) {
                return Ok(k.clone());
            }
        }
        let mut n = 1;
        let name = loop {
            let candidate = format!("{prefix}{n}").into_bytes();
            // The name must not hide one from an outer resource dictionary either.
            let clash = cat.has(&candidate)
                || interp::page_resources(&self.doc, page_id).iter().any(|r| {
                    r.get(category)
                        .ok()
                        .and_then(|c| deref(&self.doc, c).as_dict().ok())
                        .map(|d| d.has(&candidate))
                        .unwrap_or(false)
                });
            if !clash {
                break candidate;
            }
            n += 1;
        };
        cat.set(name.clone(), Object::Reference(target));
        if let Some(cid) = cat_ref {
            self.touch(cid, backup);
            self.doc.objects.insert(cid, Object::Dictionary(cat));
            return Ok(name);
        }
        let mut res = res_dict;
        res.set(category.to_vec(), Object::Dictionary(cat));
        if let Some(rid) = res_ref {
            self.touch(rid, backup);
            self.doc.objects.insert(rid, Object::Dictionary(res));
            return Ok(name);
        }
        self.touch(holder, backup);
        match self.doc.get_object_mut(holder).map_err(|_| err("resources"))? {
            Object::Dictionary(d) => d.set("Resources", Object::Dictionary(res)),
            Object::Stream(s) => s.dict.set("Resources", Object::Dictionary(res)),
            _ => return Err(err("resources")),
        }
        Ok(name)
    }

    fn font_resource(
        &mut self,
        page_id: ObjectId,
        pc: &PageContent,
        source: usize,
        font_id: ObjectId,
        backup: &mut Vec<(ObjectId, Option<Object>)>,
    ) -> Result<Vec<u8>> {
        let form = match pc.sources[source].kind {
            SourceKind::Form(id) => {
                let has_own = self
                    .doc
                    .get_object(id)
                    .ok()
                    .and_then(|o| o.as_stream().ok())
                    .map(|s| s.dict.has(b"Resources"))
                    .unwrap_or(false);
                has_own.then_some(id)
            }
            SourceKind::Page => None,
        };
        self.add_resource(page_id, form, b"Font", "BE", font_id, backup)
    }

    /// Embeds (or extends) the subset of a fallback face and returns its Type 0 font object.
    fn embed(
        &mut self,
        face_index: usize,
        gids: &[u16],
        text: &str,
        backup: &mut Vec<(ObjectId, Option<Object>)>,
    ) -> Result<ObjectId> {
        let err = |m: String| Error::Unsupported { reason: m };
        let face = self.faces[face_index].clone();
        let mut embed = match self.embeds[face_index].take() {
            Some(e) => e,
            None => {
                let mut ids = [(0, 0); 5];
                for id in ids.iter_mut() {
                    *id = self.add_object(Object::Null, backup);
                }
                let mut remap = GlyphRemapper::new();
                remap.remap(0);
                Embed {
                    type0: ids[0],
                    cid: ids[1],
                    desc: ids[2],
                    file: ids[3],
                    to_unicode: ids[4],
                    remap,
                    chars: BTreeMap::new(),
                }
            }
        };
        for (g, ch) in gids.iter().zip(text.chars()) {
            let n = embed.remap.remap(*g);
            embed.chars.entry(n).or_insert((ch, *g));
        }
        let parsed = ttf_parser::Face::parse(&face.data, 0).map_err(|e| err(e.to_string()))?;
        let upem = parsed.units_per_em() as f64;
        let k = 1000.0 / upem;
        let subset = subsetter::subset(&face.data, 0, &embed.remap).map_err(|e| err(e.to_string()))?;

        let ps_base: String = format!(
            "{}{}{}",
            face.family,
            if face.bold { "-Bold" } else { "" },
            if face.italic {
                if face.bold {
                    "Italic"
                } else {
                    "-Italic"
                }
            } else {
                ""
            }
        )
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
        let tag: String = {
            let mut n = face_index;
            let mut t = String::from("BERRY");
            t.push((b'A' + (n % 26) as u8) as char);
            n /= 26;
            if n > 0 {
                t.replace_range(4..5, &((b'A' + (n % 26) as u8) as char).to_string());
            }
            t
        };
        let ps_name = format!("{tag}+{ps_base}");

        for id in [embed.type0, embed.cid, embed.desc, embed.file, embed.to_unicode] {
            self.touch(id, backup);
        }
        let mut file_dict = Dictionary::new();
        file_dict.set("Length1", subset.len() as i64);
        let mut file = Stream::new(file_dict, subset);
        let _ = file.compress();
        self.doc.objects.insert(embed.file, Object::Stream(file));

        let bbox = parsed.global_bounding_box();
        let mut flags = 4;
        if parsed.is_monospaced() {
            flags |= 1;
        }
        if face.italic {
            flags |= 64;
        }
        let mut desc = Dictionary::new();
        desc.set("Type", Object::Name(b"FontDescriptor".to_vec()));
        desc.set("FontName", Object::Name(ps_name.clone().into_bytes()));
        desc.set("Flags", flags as i64);
        desc.set(
            "FontBBox",
            Object::Array(vec![
                Object::Real((bbox.x_min as f64 * k) as f32),
                Object::Real((bbox.y_min as f64 * k) as f32),
                Object::Real((bbox.x_max as f64 * k) as f32),
                Object::Real((bbox.y_max as f64 * k) as f32),
            ]),
        );
        desc.set("ItalicAngle", Object::Real(parsed.italic_angle()));
        desc.set("Ascent", Object::Real((parsed.ascender() as f64 * k) as f32));
        desc.set("Descent", Object::Real((parsed.descender() as f64 * k) as f32));
        desc.set("CapHeight", Object::Real((parsed.capital_height().unwrap_or(parsed.ascender()) as f64 * k) as f32));
        desc.set("StemV", if face.bold { 120 } else { 80 });
        desc.set("FontFile2", Object::Reference(embed.file));
        self.doc.objects.insert(embed.desc, Object::Dictionary(desc));

        let mut w: Vec<Object> = Vec::new();
        for (new, (_, old)) in &embed.chars {
            // Whole numbers: several readers parse CID widths as integers, and the
            // line shift is computed from the same rounded value.
            let adv = (parsed.glyph_hor_advance(ttf_parser::GlyphId(*old)).unwrap_or(0) as f64 * k).round();
            w.push(Object::Integer(*new as i64));
            w.push(Object::Array(vec![Object::Integer(adv as i64)]));
        }
        let mut info = Dictionary::new();
        info.set("Registry", Object::string_literal("Adobe"));
        info.set("Ordering", Object::string_literal("Identity"));
        info.set("Supplement", 0);
        let mut cid = Dictionary::new();
        cid.set("Type", Object::Name(b"Font".to_vec()));
        cid.set("Subtype", Object::Name(b"CIDFontType2".to_vec()));
        cid.set("BaseFont", Object::Name(ps_name.clone().into_bytes()));
        cid.set("CIDSystemInfo", Object::Dictionary(info));
        cid.set("FontDescriptor", Object::Reference(embed.desc));
        cid.set("DW", 1000);
        cid.set("W", Object::Array(w));
        cid.set("CIDToGIDMap", Object::Name(b"Identity".to_vec()));
        self.doc.objects.insert(embed.cid, Object::Dictionary(cid));

        let mut cmap = String::from(
            "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n",
        );
        let entries: Vec<(u16, char)> = embed.chars.iter().map(|(n, (c, _))| (*n, *c)).collect();
        for chunk in entries.chunks(100) {
            cmap.push_str(&format!("{} beginbfchar\n", chunk.len()));
            for (n, c) in chunk {
                let mut units = [0u16; 2];
                let hex: String = c.encode_utf16(&mut units).iter().map(|u| format!("{u:04X}")).collect();
                cmap.push_str(&format!("<{n:04X}> <{hex}>\n"));
            }
            cmap.push_str("endbfchar\n");
        }
        cmap.push_str("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n");
        self.doc.objects.insert(embed.to_unicode, Object::Stream(new_stream(cmap.into_bytes())));

        let mut t0 = Dictionary::new();
        t0.set("Type", Object::Name(b"Font".to_vec()));
        t0.set("Subtype", Object::Name(b"Type0".to_vec()));
        t0.set("BaseFont", Object::Name(ps_name.into_bytes()));
        t0.set("Encoding", Object::Name(b"Identity-H".to_vec()));
        t0.set("DescendantFonts", Object::Array(vec![Object::Reference(embed.cid)]));
        t0.set("ToUnicode", Object::Reference(embed.to_unicode));
        self.doc.objects.insert(embed.type0, Object::Dictionary(t0));

        let id = embed.type0;
        self.embeds[face_index] = Some(embed);
        // The font object changed: drop cached copies.
        self.cache.clear();
        Ok(id)
    }

    /// Writes the document as the original bytes plus one appended revision, then reads the
    /// result back and checks it against what the engine holds.
    pub fn save(&mut self) -> Result<(Vec<u8>, SaveReport)> {
        let err = |m: String| Error::Save { message: m };
        if self.dirty.is_empty() {
            let report = SaveReport {
                bytes_before: self.orig.len(),
                bytes_after: self.orig.len(),
                objects_written: 0,
                original_preserved: true,
                objects_verified: 0,
                pages_edited: Vec::new(),
            };
            return Ok((self.orig.clone(), report));
        }
        let mut inc = IncrementalDocument::create_from(self.orig.clone(), self.doc.clone());
        for id in &self.dirty {
            if let Ok(o) = self.doc.get_object(*id) {
                inc.new_document.set_object(*id, o.clone());
            }
        }
        inc.new_document.max_id = self.doc.max_id;
        let mut out = Vec::with_capacity(self.orig.len() + 4096);
        inc.save_to(&mut out).map_err(|e| err(e.to_string()))?;

        // Verify.
        if out.len() < self.orig.len() || out[..self.orig.len()] != self.orig[..] {
            return Err(Error::Verify { message: "original bytes were not preserved".into() });
        }
        let reread = Document::load_mem(&out).map_err(|e| Error::Verify { message: format!("output does not parse: {e}") })?;
        let mut verified = 0;
        for (id, o) in &self.doc.objects {
            // Object and xref streams are rebuilt by the writer, not carried over.
            if let Object::Stream(s) = o {
                let t = s.dict.get(b"Type").ok().and_then(|t| t.as_name().ok());
                if matches!(t, Some(b"ObjStm") | Some(b"XRef")) {
                    continue;
                }
            }
            match reread.objects.get(id) {
                Some(r) if same_object(r, o) => verified += 1,
                Some(_) => return Err(Error::Verify { message: format!("object {} {} differs after saving", id.0, id.1) }),
                None => return Err(Error::Verify { message: format!("object {} {} is missing after saving", id.0, id.1) }),
            }
        }
        let reread_pages: Vec<ObjectId> = reread.get_pages().into_values().collect();
        if reread_pages != self.pages {
            return Err(Error::Verify { message: "page list changed".into() });
        }
        let mut cache = FontCache::default();
        for &p in &self.edited_pages {
            let mine = interp::interpret_page(&self.doc, &mut self.cache, self.pages[p]).map_err(limit)?;
            let theirs = interp::interpret_page(&reread, &mut cache, reread_pages[p]).map_err(limit)?;
            let text = |pc: &PageContent| layout::group(pc).0.into_iter().map(|l| l.text).collect::<Vec<_>>();
            if text(&mine) != text(&theirs) {
                return Err(Error::Verify { message: format!("page {} reads differently after saving", p + 1) });
            }
        }
        let report = SaveReport {
            bytes_before: self.orig.len(),
            bytes_after: out.len(),
            objects_written: self.dirty.len(),
            original_preserved: true,
            objects_verified: verified,
            pages_edited: self.edited_pages.iter().copied().collect(),
        };
        Ok((out, report))
    }
}

fn same_object(a: &Object, b: &Object) -> bool {
    match (a, b) {
        (Object::Stream(x), Object::Stream(y)) => {
            // Compare what the streams decode to; /Length may be direct or indirect.
            let strip = |d: &Dictionary| {
                let mut d = d.clone();
                d.remove(b"Length");
                d
            };
            strip(&x.dict) == strip(&y.dict)
                && (x.content == y.content || matches!((x.get_plain_content(), y.get_plain_content()), (Ok(p), Ok(q)) if p == q))
        }
        _ => a == b,
    }
}

/// The text state of the show operator that draws a glyph.
fn show_state(pc: &PageContent, glyph: usize) -> Option<&ShowState> {
    let g = &pc.glyphs[glyph];
    pc.sources[g.source].events.iter().find_map(|e| match e {
        TextEvent::Show { state, glyphs, .. } if glyphs.contains(&glyph) => Some(state),
        _ => None,
    })
}

/// Replaces operator spans in a whole stream.
fn splice(data: &[u8], ops: &[content::Op], reps: &[(usize, Vec<u8>)]) -> Vec<u8> {
    let whole = Segment { id: (0, 0), start: 0, end: data.len() };
    splice_range(data, ops, reps, &whole)
}

/// Replaces operator spans inside one segment of the joined page content.
fn splice_range(data: &[u8], ops: &[content::Op], reps: &[(usize, Vec<u8>)], seg: &Segment) -> Vec<u8> {
    let mut reps: Vec<&(usize, Vec<u8>)> = reps.iter().collect();
    reps.sort_by_key(|(oi, _)| ops[*oi].start);
    let mut out = Vec::with_capacity(seg.end - seg.start + 64);
    let mut at = seg.start;
    for (oi, bytes) in reps {
        let op = &ops[*oi];
        out.extend_from_slice(&data[at..op.start]);
        // Producers often write operators back to back ("Tf[<01>]TJ"): keep tokens apart.
        let is_space = |b: u8| matches!(b, 0 | 9 | 10 | 12 | 13 | 32);
        if !bytes.is_empty() {
            if out.last().is_some_and(|b| !is_space(*b)) {
                out.push(b' ');
            }
            out.extend_from_slice(bytes);
            if data.get(op.end).is_some_and(|b| !is_space(*b)) {
                out.push(b' ');
            }
        } else if out.last().is_some_and(|b| !is_space(*b)) && data.get(op.end).is_some_and(|b| !is_space(*b)) {
            out.push(b' ');
        }
        at = op.end;
    }
    out.extend_from_slice(&data[at..seg.end]);
    out
}

#[allow(unused_assignments)] // `changed` is set inside the fix-up macros
/// Walks one stream's text events and returns replacement bytes for the show operators that
/// must change. `insert` carries the new text when this stream holds the anchor glyph.
fn rewrite_source(
    pc: &PageContent,
    si: usize,
    plan: &Plan,
    mut insert: Option<std::slice::Iter<'_, Item>>,
    inserted_width: f64,
) -> Vec<(usize, Vec<u8>)> {
    let src = &pc.sources[si];
    let mut out = Vec::new();
    // Shift already applied to the line matrix, and shift of the current point, in page units.
    let mut tlm_shift = 0.0f64;
    let mut cur = 0.0f64;
    let mut fresh = true;
    const EPS: f64 = 1e-4;

    for ev in &src.events {
        let (op_index, kind, state, range) = match ev {
            TextEvent::Position { absolute, .. } => {
                if *absolute {
                    tlm_shift = 0.0;
                }
                cur = tlm_shift;
                fresh = true;
                continue;
            }
            TextEvent::Show { op, kind, state, glyphs } => (*op, *kind, state, glyphs.clone()),
        };
        if matches!(kind, ShowKind::Quote | ShowKind::DoubleQuote) {
            cur = tlm_shift;
            fresh = true;
        }
        let op = &src.ops[op_index];
        let elements: Vec<Operand> = match op.operands.last() {
            Some(Operand::Array(items)) if kind == ShowKind::TJ => items.clone(),
            Some(Operand::Str(s)) => vec![Operand::Str(s.clone())],
            _ => Vec::new(),
        };
        let mut items: Vec<Item> = Vec::new();
        let mut changed = false;
        let per_unit = state.scale;
        let kern_unit = state.tfs * state.th * state.scale / 1000.0;

        macro_rules! fix {
            ($target:expr) => {{
                let delta: f64 = $target - cur;
                if delta.abs() > EPS {
                    if fresh && per_unit > 0.0 {
                        items.push(Item::Td(delta / per_unit));
                        tlm_shift += delta;
                        cur += delta;
                        changed = true;
                    } else if kern_unit.abs() > 0.0 {
                        items.push(Item::Kern(-delta / kern_unit));
                        cur += delta;
                        changed = true;
                    }
                }
            }};
        }
        macro_rules! place_insert {
            () => {{
                if let Some(it) = insert.take() {
                    fix!(0.0);
                    for item in it {
                        items.push(match item {
                            Item::Bytes(b) => Item::Bytes(b.clone()),
                            Item::Kern(k) => Item::Kern(*k),
                            Item::Font(n, s) => Item::Font(n.clone(), *s),
                            Item::Td(t) => Item::Td(*t),
                        });
                    }
                    cur += inserted_width;
                    fresh = false;
                    changed = true;
                }
            }};
        }

        let mut gi = range.start;
        for (e, el) in elements.iter().enumerate() {
            match el {
                Operand::Num(k) => {
                    items.push(Item::Kern(*k));
                    fresh = false;
                }
                Operand::Str(s) => {
                    let mut any = false;
                    while gi < range.end && pc.glyphs[gi].elem == e {
                        any = true;
                        let g: &Glyph = &pc.glyphs[gi];
                        if gi == plan.anchor && !plan.after {
                            place_insert!();
                        }
                        if plan.removed.contains(&gi) {
                            cur -= g.advance;
                            changed = true;
                        } else {
                            let want = plan.want.get(&gi).copied().unwrap_or(0.0);
                            fix!(want);
                            items.push(Item::Bytes(s[g.byte..g.byte + g.nbytes as usize].to_vec()));
                            fresh = false;
                        }
                        if gi == plan.anchor && plan.after {
                            place_insert!();
                        }
                        gi += 1;
                    }
                    if !any && !s.is_empty() {
                        items.push(Item::Bytes(s.clone()));
                        fresh = false;
                    }
                }
                _ => {}
            }
        }
        if changed {
            out.push((op_index, serialize(kind, op, items)));
        }
    }
    out
}

fn serialize(kind: ShowKind, op: &content::Op, items: Vec<Item>) -> Vec<u8> {
    let mut parts: Vec<Vec<u8>> = Vec::new();
    match kind {
        ShowKind::Quote => parts.push(b"T*".to_vec()),
        ShowKind::DoubleQuote => {
            parts.push(format!("{} Tw {} Tc T*", fmt_num(op.num(0)), fmt_num(op.num(1))).into_bytes());
        }
        _ => {}
    }
    let mut group: Vec<Item> = Vec::new();
    fn flush(group: &mut Vec<Item>, parts: &mut Vec<Vec<u8>>) {
        // Merge neighbours, drop empty strings and zero kerns.
        let mut merged: Vec<Item> = Vec::new();
        for it in group.drain(..) {
            match (merged.last_mut(), it) {
                (Some(Item::Bytes(a)), Item::Bytes(b)) => a.extend(b),
                (Some(Item::Kern(a)), Item::Kern(b)) => *a += b,
                (_, it) => merged.push(it),
            }
        }
        merged.retain(|it| match it {
            Item::Bytes(b) => !b.is_empty(),
            Item::Kern(k) => k.abs() > 1e-6,
            _ => true,
        });
        if merged.is_empty() {
            return;
        }
        let mut out = Vec::new();
        if let [Item::Bytes(b)] = merged.as_slice() {
            fmt_string(b, &mut out);
            out.extend_from_slice(b" Tj");
        } else {
            out.push(b'[');
            for it in &merged {
                match it {
                    Item::Bytes(b) => fmt_string(b, &mut out),
                    Item::Kern(k) => {
                        if out.last().is_some_and(|c| c.is_ascii_digit() || *c == b'.') {
                            out.push(b' ');
                        }
                        out.extend_from_slice(fmt_kern(*k).as_bytes());
                    }
                    _ => {}
                }
            }
            out.extend_from_slice(b"] TJ");
        }
        parts.push(out);
    }
    for it in items {
        match it {
            Item::Td(dx) => {
                flush(&mut group, &mut parts);
                parts.push(format!("{} 0 Td", fmt_num(dx)).into_bytes());
            }
            Item::Font(name, size) => {
                flush(&mut group, &mut parts);
                let mut out = Vec::new();
                fmt_name(&name, &mut out);
                out.extend_from_slice(format!(" {} Tf", fmt_num(size)).as_bytes());
                parts.push(out);
            }
            other => group.push(other),
        }
    }
    flush(&mut group, &mut parts);
    parts.join(&b' ')
}

/// Compares the page before and after an edit: every glyph we did not remove must be the same
/// glyph in the same font, size and colour, at its old position plus its planned shift, and
/// the new glyphs must sit where the old text started.
/// Returns the indices (in `after`) of glyphs that are new or moved.
// `!(x <= tol)` is deliberate: it also rejects NaN.
#[allow(clippy::neg_cmp_op_on_partial_ord)]
fn check_edit(before: &PageContent, after: &PageContent, plan: &Plan, angle: f64) -> Result<Vec<usize>> {
    let fail = |m: String| Err(Error::Verify { message: m });
    let inserted: usize = plan
        .segs
        .iter()
        .map(|s| match s {
            Seg::Orig { text, .. } => text.chars().count(),
            Seg::Fallback { text, .. } => text.chars().count(),
            Seg::Gap { .. } => 0,
        })
        .sum();
    let expected_text: String = plan
        .segs
        .iter()
        .map(|s| match s {
            Seg::Orig { text, .. } | Seg::Fallback { text, .. } => text.as_str(),
            Seg::Gap { .. } => "",
        })
        .collect();
    let kept = before.glyphs.len() - plan.removed.len();
    if after.glyphs.len() != kept + inserted {
        return fail(format!("expected {} glyphs after the edit, found {}", kept + inserted, after.glyphs.len()));
    }
    let (dx, dy) = (angle.cos(), angle.sin());
    let anchor = &before.glyphs[plan.anchor];
    let mut touched: Vec<usize> = Vec::new();
    let mut j = 0;
    let check_inserted = |j: &mut usize, start: Option<(f64, f64)>, touched: &mut Vec<usize>| -> Result<()> {
        let mut text = String::new();
        let mut prev: Option<(f64, f64)> = None;
        for k in 0..inserted {
            let g = &after.glyphs[*j + k];
            touched.push(*j + k);
            text.push_str(&g.text);
            if !g.origin.0.is_finite() || !g.origin.1.is_finite() {
                return Err(Error::Verify { message: "new text has no valid position".into() });
            }
            // New glyphs take the anchor's size, colour and rendering mode.
            if (g.size - anchor.size).abs() > 1e-6 || g.color != anchor.color || g.render_mode != anchor.render_mode {
                return Err(Error::Verify { message: format!("new glyph {:?} has the wrong style", g.text) });
            }
            // And they stay on the baseline.
            if let Some(p) = prev {
                // (Negative character spacing may legitimately move them backwards.)
                let off = -(g.origin.0 - p.0) * dy + (g.origin.1 - p.1) * dx;
                if !(off.abs() <= POSITION_TOLERANCE) {
                    return Err(Error::Verify { message: format!("new glyph {:?} is out of line", g.text) });
                }
            }
            prev = Some(g.origin);
            if k == 0 {
                if let Some(s) = start {
                    if !((g.origin.0 - s.0).hypot(g.origin.1 - s.1) <= POSITION_TOLERANCE) {
                        return Err(Error::Verify { message: "new text does not start where the old text did".into() });
                    }
                }
            }
        }
        if text != expected_text {
            return Err(Error::Verify { message: format!("new text reads {text:?}, expected {expected_text:?}") });
        }
        *j += inserted;
        Ok(())
    };
    let same_font = |a: &PdfFont, b: &PdfFont| a.object_id == b.object_id && a.base_font == b.base_font;
    for (i, g) in before.glyphs.iter().enumerate() {
        if i == plan.anchor && !plan.after {
            check_inserted(&mut j, Some(g.origin), &mut touched)?;
        }
        if !plan.removed.contains(&i) {
            let h = &after.glyphs[j];
            let want = plan.want.get(&i).copied().unwrap_or(0.0);
            let target = (g.origin.0 + want * dx, g.origin.1 + want * dy);
            let moved = (h.origin.0 - target.0).hypot(h.origin.1 - target.1);
            if h.code != g.code
                || !same_font(&before.fonts[g.font], &after.fonts[h.font])
                || (h.size - g.size).abs() > 1e-6
                || h.color != g.color
                || h.render_mode != g.render_mode
            {
                return fail(format!("glyph {i} ({:?}) changed", g.text));
            }
            if !(moved <= POSITION_TOLERANCE) {
                return fail(format!("glyph {i} ({:?}) is {moved:.3} pt from where it should be", g.text));
            }
            if want != 0.0 {
                touched.push(j);
            }
            j += 1;
        }
        if i == plan.anchor && plan.after {
            let end = (g.origin.0 + g.advance * dx, g.origin.1 + g.advance * dy);
            check_inserted(&mut j, if plan.removed.contains(&i) { None } else { Some(end) }, &mut touched)?;
        }
    }
    Ok(touched)
}
