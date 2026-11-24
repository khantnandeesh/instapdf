//! The document-level API: open, read text, replace a line, save and verify.

use crate::content::{self, fmt_name, fmt_num, fmt_string, Operand};
use crate::fallback::{self, Face, FontRequest};
use crate::font::{strip_subset_prefix, FontKind, PdfFont};
use crate::geom::Rect;
use crate::interp::{self, FontCache, Glyph, PageContent, Segment, ShowKind, ShowState, SourceKind, TextEvent};
use crate::layout::{self, Line, Paragraph};
use crate::script;
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
    /// The edit was computed but failed its own check, so nothing was changed. `reason`:
    /// `text-mismatch` (the line would not read as typed), `position-drift` (a glyph would not
    /// sit where planned), `glyph-mismatch` (a glyph, font or style would change) or `overflow`
    /// (the line would run past the page edge) or `overlap` (it would run into other text on
    /// its baseline).
    Verify {
        reason: &'static str,
        message: String,
    },
    /// Writing the file, or reading it back, failed. `reason`: `write-failed`,
    /// `prefix-changed`, `reparse-failed`, `object-mismatch`, `page-mismatch` or `text-mismatch`.
    Save {
        reason: &'static str,
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

/// Ligatures a font may draw letters with, longest first, and their presentation forms.
const LIGATURES: [(&str, char); 5] =
    [("ffi", '\u{FB03}'), ("ffl", '\u{FB04}'), ("ff", '\u{FB00}'), ("fi", '\u{FB01}'), ("fl", '\u{FB02}')];

pub(crate) fn verify(reason: &'static str, message: String) -> Error {
    Error::Verify { reason, message }
}

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
    /// False for a subset: some characters may be missing.
    pub complete: bool,
}

/// One character of a font program: its glyph index (0 when the program is not readable) and
/// its advance in 1/1000 em.
#[derive(Clone, Debug, Serialize)]
pub struct ProgramGlyph {
    pub cp: u32,
    pub gid: u16,
    pub width: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct FontProgram {
    /// "truetype", "cff" (bare CFF) or "none" (not embedded, Type 1 or Type 3: widths only).
    pub format: &'static str,
    /// False for a subset.
    pub complete: bool,
    pub glyphs: Vec<ProgramGlyph>,
    #[serde(skip)]
    pub bytes: Vec<u8>,
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
pub(crate) struct Embed {
    type0: ObjectId,
    cid: ObjectId,
    desc: ObjectId,
    file: ObjectId,
    to_unicode: ObjectId,
    pub(crate) remap: GlyphRemapper,
    /// New glyph id → (text for ToUnicode, glyph id in the full font).
    chars: BTreeMap<u16, (String, u16)>,
    /// Extra codes for a glyph already written with another text (a letter with and without
    /// its harakat): code → (text, glyph id in the full font). They start at `alias_base`, past
    /// every glyph id, and reach their glyph through a CIDToGIDMap.
    aliases: BTreeMap<u16, (String, u16)>,
    alias_base: u16,
    /// The CIDToGIDMap stream, once there are aliases.
    cid_map: Option<ObjectId>,
}

impl Embed {
    /// The code that draws a glyph of the full font and reads as `text`.
    pub(crate) fn code_for(&self, gid: u16, text: &str) -> u16 {
        let Some(n) = self.remap.get(gid) else { return 0 };
        match self.chars.get(&n) {
            Some((t, _)) if t != text => self.aliases.iter().find(|(_, (t, g))| *g == gid && t == text).map_or(n, |(c, _)| *c),
            _ => n,
        }
    }
}

pub struct Engine {
    orig: Vec<u8>,
    pub(crate) doc: Document,
    pub(crate) pages: Vec<ObjectId>,
    pub(crate) cache: FontCache,
    pub(crate) dirty: BTreeSet<ObjectId>,
    pub(crate) faces: Vec<Face>,
    pub(crate) embeds: Vec<Option<Embed>>,
    pub(crate) edited_pages: BTreeSet<usize>,
}

/// One planned piece of new text.
pub(crate) enum Seg {
    /// Bytes in the anchor operator's own font. `text` reads as the glyphs do; `glyphs` counts
    /// codes (a ligature is one glyph for several characters).
    Orig { bytes: Vec<u8>, text: String, width_em: f64, spaces: usize, glyphs: usize },
    /// Bytes in a fallback face.
    Fallback { face: usize, gids: Vec<u16>, text: String, width_em: f64 },
    /// A space the font cannot draw: an empty advance.
    Gap { width_em: f64 },
}

#[derive(Clone)]
// Rise and the ActualText items are only written by the shaping build.
#[cfg_attr(not(feature = "shaping"), allow(dead_code))]
pub(crate) enum Item {
    Bytes(Vec<u8>),
    Kern(f64),
    Font(Vec<u8>, f64),
    Td(f64),
    /// Set the text rise (`Ts`), in text space units.
    Rise(f64),
    /// Open `/Span <</ActualText …>> BDC` with this text.
    BeginSpan(String),
    EndSpan,
}

pub(crate) struct Plan {
    pub(crate) removed: HashSet<usize>,
    pub(crate) want: HashMap<usize, f64>,
    pub(crate) anchor: usize,
    pub(crate) after: bool,
    pub(crate) segs: Vec<Seg>,
    /// Where the new text starts along the baseline, relative to the anchor glyph's origin.
    pub(crate) insert_at: f64,
    /// Operators to rewrite: (stream, operator, new bytes; empty deletes it), e.g. the BDC/EMC
    /// of removed ActualText spans.
    pub(crate) drop_ops: Vec<(usize, usize, Vec<u8>)>,
}

/// The operator rewrites that take whole ActualText spans out of the content, so the glyphs that
/// replace them read as themselves. Other marked-content properties (such as `/MCID`) stay.
pub(crate) fn unwrap_spans(pc: &PageContent, spans: impl IntoIterator<Item = usize>) -> Result<Vec<(usize, usize, Vec<u8>)>> {
    let mut spans: Vec<usize> = spans.into_iter().collect();
    // Spans nested inside one (glyphs only record the outermost) go with it.
    let inner: Vec<usize> = spans
        .iter()
        .filter_map(|&s| Some((&pc.spans[s], pc.spans[s].emc?)))
        .flat_map(|(outer, emc)| {
            pc.spans
                .iter()
                .enumerate()
                .filter(move |(_, t)| t.source == outer.source && t.bdc > outer.bdc && t.emc.is_some_and(|e| e < emc))
        })
        .map(|(i, _)| i)
        .collect();
    spans.extend(inner);
    spans.sort_unstable();
    spans.dedup();
    let mut ops = Vec::new();
    for s in spans {
        let sp = &pc.spans[s];
        let emc = sp.emc.ok_or_else(|| limit("actual-text-span"))?;
        match &sp.unwrap {
            interp::Unwrap::Drop => {
                ops.push((sp.source, sp.bdc, Vec::new()));
                ops.push((sp.source, emc, Vec::new()));
            }
            interp::Unwrap::Rewrite(bytes) => ops.push((sp.source, sp.bdc, bytes.clone())),
            interp::Unwrap::Keep => return Err(limit("actual-text-span")),
        }
    }
    Ok(ops)
}

/// Engine state saved before an edit: next object id, dirty objects, embedded faces.
pub(crate) type Snapshot = (u32, BTreeSet<ObjectId>, Vec<Option<Embed>>);

pub(crate) fn limit(reason: &'static str) -> Error {
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

pub(crate) fn new_stream(data: Vec<u8>) -> Stream {
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

    /// Registers an open-licensed TrueType font (or WOFF 1.0) the engine may embed for missing
    /// characters and added text. Several files of one family and style (web font slices) are
    /// all kept. Returns false when the file is not a usable TrueType (glyf) font.
    pub fn add_font(&mut self, family: &str, bold: bool, italic: bool, data: Vec<u8>) -> bool {
        // Web fonts as served: WOFF 1.0 is unpacked to the TrueType file inside.
        let data = if data.starts_with(b"wOFF") {
            match crate::woff::unpack(&data) {
                Some(d) => d,
                None => return false,
            }
        } else {
            data
        };
        let ok = ttf_parser::Face::parse(&data, 0).map(|f| f.tables().glyf.is_some()).unwrap_or(false);
        // Web fonts come in slices (Latin, Devanagari…) under one family: every slice is kept.
        if ok && !self.faces.iter().any(|f| f.family == family && f.bold == bold && f.italic == italic && *f.data == data) {
            self.faces.push(Face { family: family.to_string(), bold, italic, data: Rc::new(data) });
            self.embeds.push(None);
        }
        ok
    }

    pub(crate) fn page_id(&self, page: usize) -> Result<ObjectId> {
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
            complete: !f.subset,
        }
    }

    /// True when an edit moves a glyph of the line past the visible page edge or past the
    /// rectangle the page clips it to (it would be in the file but not drawn), where none of the
    /// line's glyphs were before.
    pub(crate) fn overflows(
        &self,
        page: usize,
        before: &PageContent,
        line: &[usize],
        after: &PageContent,
        touched: &[usize],
    ) -> bool {
        let [x0, y0, x1, y1] = self.page_box(page);
        let out = |g: &Glyph| {
            let end = (g.origin.0 + g.advance * g.angle.cos(), g.origin.1 + g.advance * g.angle.sin());
            let [x0, y0, x1, y1] = match g.clip {
                Some(c) => [x0.max(c[0]), y0.max(c[1]), x1.min(c[2]), y1.min(c[3])],
                None => [x0, y0, x1, y1],
            };
            [g.origin, end].iter().any(|p| p.0 < x0 - 0.5 || p.0 > x1 + 0.5 || p.1 < y0 - 0.5 || p.1 > y1 + 0.5)
        };
        !line.iter().any(|&g| out(&before.glyphs[g])) && touched.iter().any(|&g| out(&after.glyphs[g]))
    }

    /// True when a new or moved glyph of the line would draw over other text on its baseline
    /// (a page number after a table-of-contents entry, the next column) that it did not touch
    /// before.
    pub(crate) fn collides(before: &PageContent, line: &[usize], after: &PageContent, touched: &[usize]) -> bool {
        let Some(&first) = line.first() else { return false };
        let a = before.glyphs[first].angle;
        let (cos, sin) = (a.cos(), a.sin());
        let along = |g: &Glyph| g.origin.0 * cos + g.origin.1 * sin;
        let across = |g: &Glyph| -g.origin.0 * sin + g.origin.1 * cos;
        let span = |g: &Glyph| {
            let u = along(g);
            (u.min(u + g.advance), u.max(u + g.advance))
        };
        let mine: HashSet<usize> = line.iter().copied().collect();
        let (lo, hi) = line
            .iter()
            .map(|&g| span(&before.glyphs[g]))
            .fold((f64::INFINITY, f64::NEG_INFINITY), |(l, h), (a, b)| (l.min(a), h.max(b)));
        let v = across(&before.glyphs[first]);
        let size = before.glyphs[first].size;
        let others: Vec<(f64, f64)> = before
            .glyphs
            .iter()
            .enumerate()
            .filter(|(i, g)| !mine.contains(i) && (g.angle - a).abs() < 0.01 && (across(g) - v).abs() < size * 0.5)
            .map(|(_, g)| span(g))
            .filter(|&(x0, x1)| x1 - x0 > 1e-6 && (x1 <= lo + 0.1 || x0 >= hi - 0.1))
            .collect();
        touched
            .iter()
            .map(|&t| span(&after.glyphs[t]))
            .any(|(t0, t1)| others.iter().any(|&(x0, x1)| t1.min(x1) - t0.max(x0) > 0.1))
    }

    /// `[x0, y0, x1, y1]` of the visible page: CropBox, else MediaBox.
    pub(crate) fn page_box(&self, page: usize) -> [f64; 4] {
        let page_id = self.pages[page];
        let read_box = |key: &[u8]| -> Option<[f64; 4]> {
            let a = self.inherited(page_id, key)?.as_array().ok()?;
            let v: Vec<f64> = a.iter().filter_map(|o| deref(&self.doc, o).as_float().ok()).map(f64::from).collect();
            (v.len() == 4).then(|| [v[0].min(v[2]), v[1].min(v[3]), v[0].max(v[2]), v[1].max(v[3])])
        };
        read_box(b"CropBox").or_else(|| read_box(b"MediaBox")).unwrap_or([0.0, 0.0, 612.0, 792.0])
    }

    pub(crate) fn describe(&self, page: usize, pc: &PageContent, lines: Vec<Line>, paragraphs: Vec<Paragraph>) -> PageText {
        let page_id = self.pages[page];
        let page_box = self.page_box(page);
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

    /// The embedded program of a document font with where it keeps each character of `chars`,
    /// for matching the font against the library (the matching itself is not in the engine).
    pub fn font_program(&mut self, font_object: u32, chars: &str) -> Result<FontProgram> {
        let id = self.doc.objects.keys().find(|k| k.0 == font_object).copied().ok_or(Error::BadFont)?;
        let is_font = self.doc.get_dictionary(id).is_ok_and(|d| d.has_type(b"Font"));
        let font = is_font.then(|| self.cache.get(&self.doc, &Object::Reference(id))).flatten().ok_or(Error::BadFont)?;
        let none = HashSet::new();
        let (format, bytes) = font.program_bytes().map(|(f, b)| (f, b.to_vec())).unwrap_or(("none", Vec::new()));
        let glyphs = chars
            .chars()
            .filter_map(|ch| {
                // To show or compare the font, a code whose glyph is in the program is enough,
                // also where its declared width disagrees with the program's own (some
                // subsetters write a wrong advance table; readers go by the PDF's widths).
                let code = font.encode(ch, &none).or_else(|| font.code_with_glyph(ch))?;
                Some(ProgramGlyph { cp: ch as u32, gid: font.program_gid(code).unwrap_or(0), width: font.width(code) })
            })
            .collect();
        Ok(FontProgram { format, complete: !font.subset, glyphs, bytes })
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
        if script::needs_shaping(&line.text, line.direction == "rtl") || script::needs_shaping(&inserted, false) {
            #[cfg(feature = "shaping")]
            return self.edit_complex(page, page_id, pc, lines, line_id, a, b, inserted);
            #[cfg(not(feature = "shaping"))]
            return Err(Error::ReadOnly { reason: "needs-shaping".into() });
        }

        // 1. ActualText spans (ligatures, replaced text): an edit that touches one rewrites the
        // whole span with its real characters and removes the span, or its old text would keep
        // replacing what is drawn.
        let (a, b, inserted, drop_ops) = {
            let span_of = |i: usize| line.chars[i].glyphs.iter().find_map(|&g| pc.glyphs[g].span);
            let mut spans: BTreeSet<usize> = (a..b).filter_map(span_of).collect();
            // New text is drawn next to the glyph it is anchored on (as in step 3): inside that
            // glyph's span when it has one.
            let anchor = if a < n && line.chars[a].glyph.is_some() && !(a == b && a > 0 && line.chars[a - 1].glyph.is_some()) {
                line.chars[a].glyph
            } else {
                (0..a).rev().find_map(|k| line.chars[k].glyph)
            };
            if !inserted.is_empty() {
                spans.extend(anchor.and_then(|g| pc.glyphs[g].span));
            }
            if spans.is_empty() {
                (a, b, inserted, Vec::new())
            } else {
                let (mut a2, mut b2) = (a, b);
                loop {
                    let lo = (0..n).find(|&i| span_of(i).is_some_and(|s| spans.contains(&s))).unwrap_or(a2);
                    let hi = (0..n).rev().find(|&i| span_of(i).is_some_and(|s| spans.contains(&s))).map_or(b2, |i| i + 1);
                    let (na, nb) = (a2.min(lo), b2.max(hi));
                    let before = spans.len();
                    spans.extend((na..nb).filter_map(span_of));
                    if (na, nb) == (a2, b2) && spans.len() == before {
                        break;
                    }
                    (a2, b2) = (na, nb);
                }
                // Every glyph of the spans must be on this line.
                let on_line: HashSet<usize> = line.chars[a2..b2].iter().flat_map(|c| c.glyphs.iter().copied()).collect();
                if pc.glyphs.iter().enumerate().any(|(i, g)| g.span.is_some_and(|s| spans.contains(&s)) && !on_line.contains(&i))
                {
                    return Err(limit("actual-text-span"));
                }
                let text_of = |r: std::ops::Range<usize>| line.chars[r].iter().map(|c| c.text.as_str()).collect::<String>();
                let widened = format!("{}{}{}", text_of(a2..a), inserted, text_of(b..b2));
                (a2, b2, widened, unwrap_spans(&pc, spans)?)
            }
        };
        if script::needs_shaping(&inserted, false) {
            #[cfg(feature = "shaping")]
            return self.edit_complex(page, page_id, pc, lines, line_id, a, b, inserted);
            #[cfg(not(feature = "shaping"))]
            return Err(Error::ReadOnly { reason: "needs-shaping".into() });
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
        let chars: Vec<char> = inserted.chars().collect();
        let mut i = 0;
        while i < chars.len() {
            let ch = chars[i];
            i += 1;
            // Letters the font cannot draw alone, but as a ligature it has: a TeX subset often
            // keeps only "fi" from a word like "Definitions".
            let lig = LIGATURES.iter().find_map(|&(seq, form)| {
                let n = seq.chars().count();
                let here = chars[i - 1..].iter().take(n).copied().eq(seq.chars());
                if !here || seq.chars().all(|c| font.encode(c, &seen).is_some()) {
                    return None;
                }
                let code = font.encode_text(seq, &seen).or_else(|| font.encode(form, &seen))?;
                Some((code, n, font.unicode(code).unwrap_or_else(|| seq.to_string())))
            });
            let found = match lig {
                Some((code, n, text)) => {
                    i += n - 1;
                    Some((code, text))
                }
                None => font.encode(ch, &seen).map(|c| (c, ch.to_string())),
            };
            if let Some((code, ch_text)) = found {
                let bytes = font.code_bytes(code);
                let w = font.width(code) / 1000.0;
                let space = font.is_word_space(code, bytes.len()) as usize;
                match segs.last_mut() {
                    Some(Seg::Orig { bytes: b0, text, width_em, spaces, glyphs }) => {
                        b0.extend(bytes);
                        text.push_str(&ch_text);
                        *width_em += w;
                        *spaces += space;
                        *glyphs += 1;
                    }
                    _ => segs.push(Seg::Orig { bytes, text: ch_text, width_em: w, spaces: space, glyphs: 1 }),
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
                Seg::Orig { width_em, spaces, glyphs, .. } => {
                    (width_em * state.tfs + state.tc * *glyphs as f64 + state.tw * *spaces as f64) * unit
                }
                Seg::Fallback { text, width_em, .. } => (width_em * state.tfs + state.tc * text.chars().count() as f64) * unit,
                Seg::Gap { width_em } => width_em * state.tfs * unit,
            };
        }
        let shift = new_width - (pos(b) - pos(a));
        let mut plan =
            Plan { removed: HashSet::new(), want: HashMap::new(), anchor, after: after_anchor, segs, insert_at: 0.0, drop_ops };
        plan.removed.extend(line.chars[a..b].iter().flat_map(|c| c.glyphs.iter().copied()));
        for g in line.chars[b..n].iter().flat_map(|c| c.glyphs.iter().copied()) {
            plan.want.insert(g, shift);
        }

        // 6. Apply inside a transaction and check the result before keeping it.
        let old_box = line.bbox;
        let snapshot = (self.doc.max_id, self.dirty.clone(), self.embeds.clone());
        let mut backup: Vec<(ObjectId, Option<Object>)> = Vec::new();
        let outcome = self.apply(page_id, &pc, &plan, &state, &mut backup).and_then(|()| {
            let after = interp::interpret_page(&self.doc, &mut self.cache, page_id).map_err(limit)?;
            // A space typed in a font without a space glyph is a gap (a TJ kern) before the
            // first new glyph, so that glyph starts after the gap, not at the old text.
            let lead: f64 = plan
                .segs
                .iter()
                .take_while(|s| matches!(s, Seg::Gap { .. }))
                .map(|s| match s {
                    Seg::Gap { width_em } => width_em * state.tfs * unit,
                    _ => 0.0,
                })
                .sum();
            let touched = check_edit(&pc, &after, &plan, ang, lead)?;
            if self.overflows(page, &pc, &line.glyphs, &after, &touched) {
                return Err(verify("overflow", "the line would run past the page edge".into()));
            }
            if Self::collides(&pc, &line.glyphs, &after, &touched) {
                return Err(verify("overlap", "the line would run into other text on its baseline".into()));
            }
            // Where marked content changed, the glyphs alone do not prove how the line reads.
            if !plan.drop_ops.is_empty() || line.glyphs.iter().any(|&g| pc.glyphs[g].span.is_some()) {
                let text_of = |r: std::ops::Range<usize>| line.chars[r].iter().map(|c| c.text.as_str()).collect::<String>();
                let expected = format!("{}{}{}", text_of(0..a), inserted, text_of(b..n));
                let (new_lines, _) = layout::group(&after);
                // The line holding a new or moved glyph; failing that (a deletion at the end), the
                // line that overlaps the old one most.
                let overlap = |r: &Rect| {
                    let o = &line.bbox;
                    (r.x1.min(o.x1) - r.x0.max(o.x0)).max(0.0) * (r.y1.min(o.y1) - r.y0.max(o.y0)).max(0.0)
                };
                let edited = match touched.first() {
                    Some(&g) => new_lines.iter().find(|l| l.glyphs.contains(&g)),
                    None => new_lines
                        .iter()
                        .filter(|l| overlap(&l.bbox) > 0.0)
                        .max_by(|x, y| overlap(&x.bbox).total_cmp(&overlap(&y.bbox))),
                };
                let reads = edited.map(|l| l.text.clone());
                let gone = edited.is_none() && expected.trim().is_empty();
                if !gone && reads.as_deref() != Some(expected.as_str()) {
                    return Err(verify(
                        "text-mismatch",
                        format!("the line reads {:?}, expected {expected:?}", reads.unwrap_or_default()),
                    ));
                }
            }
            Ok((after, touched))
        });
        let (after, touched) = match outcome {
            Ok(v) => v,
            Err(e) => {
                self.rollback(backup, snapshot);
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

    /// Undoes a failed edit: restores every object it changed and the engine state before it.
    pub(crate) fn rollback(&mut self, backup: Vec<(ObjectId, Option<Object>)>, snapshot: Snapshot) {
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
    }

    pub(crate) fn touch(&mut self, id: ObjectId, backup: &mut Vec<(ObjectId, Option<Object>)>) {
        if !backup.iter().any(|(b, _)| *b == id) {
            backup.push((id, self.doc.objects.get(&id).cloned()));
        }
        self.dirty.insert(id);
    }

    pub(crate) fn add_object(&mut self, o: Object, backup: &mut Vec<(ObjectId, Option<Object>)>) -> ObjectId {
        let id = self.doc.add_object(o);
        backup.push((id, None));
        self.dirty.insert(id);
        id
    }

    /// Rewrites the affected show operators and commits the new streams to the document.
    pub(crate) fn apply(
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
                    let pairs: Vec<(u16, String)> = gids.iter().zip(text.chars()).map(|(g, c)| (*g, c.to_string())).collect();
                    let font_id = self.embed(*face, &pairs, backup)?;
                    let res = self.font_resource(page_id, pc, anchor_source, font_id, backup)?;
                    let embed = self.embeds[*face].as_ref().unwrap();
                    let mut bytes = Vec::new();
                    for (g, c) in gids.iter().zip(text.chars()) {
                        let n = embed.code_for(*g, c.encode_utf8(&mut [0; 4]));
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
                    Seg::Orig { width_em, spaces, glyphs, .. } => {
                        (width_em * state.tfs + state.tc * *glyphs as f64 + state.tw * *spaces as f64) * unit
                    }
                    Seg::Fallback { text, width_em, .. } => {
                        (width_em * state.tfs + state.tc * text.chars().count() as f64) * unit
                    }
                    Seg::Gap { width_em } => width_em * state.tfs * unit,
                })
                .sum()
        };
        self.apply_items(page_id, pc, plan, &seg_items, inserted_width, backup)
    }

    /// Rewrites the streams that hold affected glyphs, with `items` as the new text at the
    /// anchor, and commits them.
    pub(crate) fn apply_items(
        &mut self,
        page_id: ObjectId,
        pc: &PageContent,
        plan: &Plan,
        seg_items: &[Item],
        inserted_width: f64,
        backup: &mut Vec<(ObjectId, Option<Object>)>,
    ) -> Result<()> {
        let anchor_source = pc.glyphs[plan.anchor].source;
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
        for (si, oi, bytes) in &plan.drop_ops {
            let reps = splices.entry(*si).or_default();
            if !reps.iter().any(|(o, _)| o == oi) {
                reps.push((*oi, bytes.clone()));
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

    pub(crate) fn font_resource(
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
    /// `glyphs` are (glyph id in the face, text for ToUnicode); empty text adds no mapping.
    pub(crate) fn embed(
        &mut self,
        face_index: usize,
        glyphs: &[(u16, String)],
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
                let glyph_count = ttf_parser::Face::parse(&face.data, 0).map(|f| f.number_of_glyphs()).unwrap_or(u16::MAX);
                Embed {
                    type0: ids[0],
                    cid: ids[1],
                    desc: ids[2],
                    file: ids[3],
                    to_unicode: ids[4],
                    remap,
                    chars: BTreeMap::new(),
                    aliases: BTreeMap::new(),
                    alias_base: glyph_count,
                    cid_map: None,
                }
            }
        };
        // The first text written for a glyph stays (earlier edits read through it); the same
        // glyph with another text gets an alias code of its own.
        for (g, text) in glyphs {
            let n = embed.remap.remap(*g);
            match embed.chars.get(&n) {
                None => {
                    embed.chars.insert(n, (text.clone(), *g));
                }
                Some((t, _)) if t != text => {
                    if !embed.aliases.values().any(|(t, a)| a == g && t == text) {
                        let code = embed.alias_base as u32 + embed.aliases.len() as u32;
                        let code = u16::try_from(code).map_err(|_| err("too many glyph aliases".into()))?;
                        embed.aliases.insert(code, (text.clone(), *g));
                    }
                }
                Some(_) => {}
            }
        }
        let parsed = ttf_parser::Face::parse(&face.data, 0).map_err(|e| err(e.to_string()))?;
        let upem = parsed.units_per_em() as f64;
        let k = 1000.0 / upem;
        let subset = subsetter::subset(&face.data, 0, &embed.remap).map_err(|e| err(e.to_string()))?;
        // A cmap for the characters the glyphs draw, so readers can tell a mirrored bracket
        // (right-to-left text, which only the shaping build writes).
        #[cfg(feature = "shaping")]
        let drawn: Vec<(char, u16)> = embed
            .chars
            .iter()
            .filter_map(|(&n, (text, g))| {
                let mut cs = text.chars();
                match (cs.next(), cs.next()) {
                    (Some(c), None) if face.glyph(c) == Some(*g) => Some((c, n)),
                    _ => None,
                }
            })
            .collect();
        #[cfg(feature = "shaping")]
        let subset = crate::sfnt::with_cmap(&subset, &drawn).unwrap_or(subset);

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
        for (new, (_, old)) in embed.chars.iter().chain(&embed.aliases) {
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
        if embed.aliases.is_empty() {
            cid.set("CIDToGIDMap", Object::Name(b"Identity".to_vec()));
        } else {
            // Identity up to the aliases, then each alias to its glyph in the subset.
            let last = *embed.aliases.keys().next_back().unwrap() as usize;
            let mut map: Vec<u8> = Vec::with_capacity(2 * (last + 1));
            for c in 0..=last {
                let gid = match embed.aliases.get(&(c as u16)) {
                    Some((_, g)) => embed.remap.get(*g).unwrap_or(0),
                    None if c < embed.alias_base as usize => c as u16,
                    None => 0,
                };
                map.extend_from_slice(&gid.to_be_bytes());
            }
            let mut st = Stream::new(Dictionary::new(), map);
            let _ = st.compress();
            let map_id = match embed.cid_map {
                Some(id) => {
                    self.touch(id, backup);
                    id
                }
                None => self.add_object(Object::Null, backup),
            };
            self.doc.objects.insert(map_id, Object::Stream(st));
            embed.cid_map = Some(map_id);
            cid.set("CIDToGIDMap", Object::Reference(map_id));
        }
        self.doc.objects.insert(embed.cid, Object::Dictionary(cid));

        let mut cmap = String::from(
            "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n",
        );
        // A glyph with no text of its own (the second glyph of a cluster, a dot) maps to <0000>,
        // as Chrome writes it, so readers do not show its code as a character.
        let entries: Vec<(u16, &String)> =
            embed.chars.iter().chain(&embed.aliases).filter(|(n, _)| **n != 0).map(|(n, (t, _))| (*n, t)).collect();
        for chunk in entries.chunks(100) {
            cmap.push_str(&format!("{} beginbfchar\n", chunk.len()));
            for (n, t) in chunk {
                let hex: String =
                    if t.is_empty() { "0000".into() } else { t.encode_utf16().map(|u| format!("{u:04X}")).collect() };
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
        let err = |m: String| Error::Save { reason: "write-failed", message: m };
        let fail = |reason: &'static str, message: String| Error::Save { reason, message };
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
            return Err(fail("prefix-changed", "original bytes were not preserved".into()));
        }
        let reread = Document::load_mem(&out).map_err(|e| fail("reparse-failed", format!("output does not parse: {e}")))?;
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
                Some(_) => return Err(fail("object-mismatch", format!("object {} {} differs after saving", id.0, id.1))),
                None => return Err(fail("object-mismatch", format!("object {} {} is missing after saving", id.0, id.1))),
            }
        }
        let reread_pages: Vec<ObjectId> = reread.get_pages().into_values().collect();
        if reread_pages != self.pages {
            return Err(fail("page-mismatch", "page list changed".into()));
        }
        let mut cache = FontCache::default();
        for &p in &self.edited_pages {
            let mine = interp::interpret_page(&self.doc, &mut self.cache, self.pages[p]).map_err(limit)?;
            let theirs = interp::interpret_page(&reread, &mut cache, reread_pages[p]).map_err(limit)?;
            let text = |pc: &PageContent| layout::group(pc).0.into_iter().map(|l| l.text).collect::<Vec<_>>();
            if text(&mine) != text(&theirs) {
                return Err(fail("text-mismatch", format!("page {} reads differently after saving", p + 1)));
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
pub(crate) fn show_state(pc: &PageContent, glyph: usize) -> Option<&ShowState> {
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
pub(crate) fn rewrite_source(
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
                    fix!(plan.insert_at);
                    items.extend(it.cloned());
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
    let body = serialize_items(items);
    if !body.is_empty() {
        parts.push(body);
    }
    parts.join(&b' ')
}

/// Text-showing operators for these items (fonts, rises, spans, strings and kerns).
pub(crate) fn serialize_items(items: Vec<Item>) -> Vec<u8> {
    let mut parts: Vec<Vec<u8>> = Vec::new();
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
            Item::Rise(r) => {
                flush(&mut group, &mut parts);
                parts.push(format!("{} Ts", fmt_kern(r)).into_bytes());
            }
            Item::BeginSpan(text) => {
                flush(&mut group, &mut parts);
                let mut out = b"/Span <</ActualText ".to_vec();
                let mut utf16 = vec![0xFE, 0xFF];
                for u in text.encode_utf16() {
                    utf16.extend_from_slice(&u.to_be_bytes());
                }
                fmt_string(&utf16, &mut out);
                out.extend_from_slice(b">> BDC");
                parts.push(out);
            }
            Item::EndSpan => {
                flush(&mut group, &mut parts);
                parts.push(b"EMC".to_vec());
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
fn check_edit(before: &PageContent, after: &PageContent, plan: &Plan, angle: f64, lead: f64) -> Result<Vec<usize>> {
    let fail = |r: &'static str, m: String| Err(verify(r, m));
    let inserted: usize = plan
        .segs
        .iter()
        .map(|s| match s {
            Seg::Orig { glyphs, .. } => *glyphs,
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
        return fail(
            "glyph-mismatch",
            format!("expected {} glyphs after the edit, found {}", kept + inserted, after.glyphs.len()),
        );
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
                return Err(verify("position-drift", "new text has no valid position".into()));
            }
            // New glyphs take the anchor's size, colour and rendering mode.
            if (g.size - anchor.size).abs() > 1e-6 || g.color != anchor.color || g.render_mode != anchor.render_mode {
                return Err(verify("glyph-mismatch", format!("new glyph {:?} has the wrong style", g.text)));
            }
            // And they stay on the baseline.
            if let Some(p) = prev {
                // (Negative character spacing may legitimately move them backwards.)
                let off = -(g.origin.0 - p.0) * dy + (g.origin.1 - p.1) * dx;
                if !(off.abs() <= POSITION_TOLERANCE) {
                    return Err(verify("position-drift", format!("new glyph {:?} is out of line", g.text)));
                }
            }
            prev = Some(g.origin);
            if k == 0 {
                if let Some(s) = start {
                    let s = (s.0 + lead * dx, s.1 + lead * dy);
                    if !((g.origin.0 - s.0).hypot(g.origin.1 - s.1) <= POSITION_TOLERANCE) {
                        return Err(verify("position-drift", "new text does not start where the old text did".into()));
                    }
                }
            }
        }
        if text != expected_text {
            return Err(verify("text-mismatch", format!("new text reads {text:?}, expected {expected_text:?}")));
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
                return fail("glyph-mismatch", format!("glyph {i} ({:?}) changed", g.text));
            }
            if !(moved <= POSITION_TOLERANCE) {
                return fail("position-drift", format!("glyph {i} ({:?}) is {moved:.3} pt from where it should be", g.text));
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
