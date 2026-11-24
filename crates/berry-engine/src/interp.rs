//! Content-stream interpreter: walks a page (and its Form XObjects) with full graphics and text
//! state and reports every glyph with its position, font, size and colour, plus the text
//! events (positioning and show operators) that the editor needs to rewrite a stream.

use crate::content::{self, Op, Operand};
use crate::font::PdfFont;
use crate::geom::Matrix;
use lopdf::{Dictionary, Document, Object, ObjectId};
use std::collections::HashMap;
use std::rc::Rc;

const MAX_FORM_DEPTH: usize = 12;
/// Work limits per page. Real pages stay far below them; hostile files (form XObject fan-out,
/// decompression bombs) hit them and are refused instead of hanging the tab.
pub const MAX_FORM_INVOCATIONS: usize = 4_000;
pub const MAX_OPS: usize = 2_000_000;
pub const MAX_GLYPHS: usize = 1_000_000;
/// Largest decoded content or font stream we accept, in bytes.
pub const MAX_STREAM_BYTES: usize = 128 << 20;

/// One drawn character code.
#[derive(Clone, Debug)]
pub struct Glyph {
    /// Unicode text; empty when the font gives no mapping.
    pub text: String,
    pub code: u32,
    pub nbytes: u8,
    /// Index into [`PageContent::fonts`].
    pub font: usize,
    /// Font size in page units (the text rendering matrix's vertical scale).
    pub size: f64,
    /// Baseline start in page space.
    pub origin: (f64, f64),
    /// Baseline direction in radians.
    pub angle: f64,
    /// Glyph width along the baseline in page units (without character or word spacing).
    pub width: f64,
    /// Full advance along the baseline in page units (with spacing).
    pub advance: f64,
    /// Fill colour as sRGB, best effort.
    pub color: [u8; 3],
    pub render_mode: u8,
    /// Which stream holds the operator: index into [`PageContent::sources`].
    pub source: usize,
    /// Operator index in that stream.
    pub op: usize,
    /// Element index inside a `TJ` array (0 for the other show operators).
    pub elem: usize,
    /// Byte offset of this code inside its string.
    pub byte: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShowKind {
    Tj,
    TJ,
    /// `'`: next line, then show.
    Quote,
    /// `"`: set word and character spacing, next line, then show.
    DoubleQuote,
}

/// Text state in force at a show operator.
#[derive(Clone, Debug)]
pub struct ShowState {
    pub font: usize,
    pub font_res: Vec<u8>,
    pub tfs: f64,
    /// Horizontal scaling as a factor (1.0 = 100%).
    pub th: f64,
    pub tc: f64,
    pub tw: f64,
    /// Page units per text-space unit along the baseline.
    pub scale: f64,
}

#[derive(Clone, Debug)]
pub enum TextEvent {
    /// A text positioning operator. `absolute` ones (`BT`, `Tm`) discard earlier line offsets.
    Position {
        op: usize,
        absolute: bool,
    },
    Show {
        op: usize,
        kind: ShowKind,
        state: ShowState,
        glyphs: std::ops::Range<usize>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SourceKind {
    Page,
    Form(ObjectId),
}

/// A content stream instance: the page's own content or one invocation of a Form XObject.
pub struct Source {
    pub kind: SourceKind,
    pub data: Rc<Vec<u8>>,
    pub ops: Rc<Vec<Op>>,
    pub events: Vec<TextEvent>,
    /// For forms: the XObject resource name and the source and operator that invoked it.
    pub invoked_by: Option<(usize, usize, Vec<u8>)>,
}

/// One content stream object of a page and the byte range it covers in the joined content.
#[derive(Clone, Debug)]
pub struct Segment {
    pub id: ObjectId,
    pub start: usize,
    pub end: usize,
}

pub struct PageContent {
    pub glyphs: Vec<Glyph>,
    pub fonts: Vec<Rc<PdfFont>>,
    pub sources: Vec<Source>,
    /// The page's content streams in order; `sources[0].data` is their concatenation.
    pub segments: Vec<Segment>,
    /// A content stream could not be decoded and is missing from `sources[0]`. Such a page is
    /// read-only: rewriting it would drop that stream.
    pub incomplete: bool,
}

/// A form XObject's decoded bytes and parsed operators, cached per object.
type ParsedForm = (Rc<Vec<u8>>, Rc<Vec<Op>>);

/// Fonts are loaded once per document.
#[derive(Default)]
pub struct FontCache {
    by_id: HashMap<ObjectId, Rc<PdfFont>>,
}

impl FontCache {
    pub fn get(&mut self, doc: &Document, obj: &Object) -> Option<Rc<PdfFont>> {
        match obj {
            Object::Reference(id) => {
                if let Some(f) = self.by_id.get(id) {
                    return Some(f.clone());
                }
                let dict = doc.get_dictionary(*id).ok()?;
                let f = Rc::new(PdfFont::load(doc, dict, Some(*id)));
                self.by_id.insert(*id, f.clone());
                Some(f)
            }
            Object::Dictionary(d) => Some(Rc::new(PdfFont::load(doc, d, None))),
            _ => None,
        }
    }

    pub fn clear(&mut self) {
        self.by_id.clear();
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum ColorSpace {
    Gray,
    Rgb,
    Cmyk,
    Other,
}

#[derive(Clone)]
struct GState {
    ctm: Matrix,
    fill: [u8; 3],
    fill_cs: ColorSpace,
    tc: f64,
    tw: f64,
    th: f64,
    tl: f64,
    tfs: f64,
    trise: f64,
    tr: u8,
    font: Option<usize>,
    font_res: Vec<u8>,
}

fn to_u8(v: f64) -> u8 {
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn color_from(cs: ColorSpace, v: &[f64]) -> Option<[u8; 3]> {
    match (cs, v.len()) {
        (ColorSpace::Gray, 1) | (ColorSpace::Other, 1) => Some([to_u8(v[0]); 3]),
        (ColorSpace::Rgb, 3) | (ColorSpace::Other, 3) => Some([to_u8(v[0]), to_u8(v[1]), to_u8(v[2])]),
        (ColorSpace::Cmyk, 4) | (ColorSpace::Other, 4) => {
            let k = 1.0 - v[3];
            Some([to_u8((1.0 - v[0]) * k), to_u8((1.0 - v[1]) * k), to_u8((1.0 - v[2]) * k)])
        }
        _ => None,
    }
}

fn deref<'a>(doc: &'a Document, o: &'a Object) -> &'a Object {
    doc.dereference(o).map(|(_, o)| o).unwrap_or(o)
}

/// The resource dictionaries that apply to a page, nearest first.
pub fn page_resources(doc: &Document, page_id: ObjectId) -> Vec<&Dictionary> {
    let mut out = Vec::new();
    let mut node = doc.get_dictionary(page_id).ok();
    let mut depth = 0;
    while let Some(n) = node {
        if let Ok(r) = n.get(b"Resources") {
            if let Ok(d) = deref(doc, r).as_dict() {
                out.push(d);
            }
        }
        depth += 1;
        if depth > 64 {
            break;
        }
        node = n.get(b"Parent").ok().and_then(|p| p.as_reference().ok()).and_then(|id| doc.get_dictionary(id).ok());
    }
    out
}

fn lookup<'a>(doc: &'a Document, resources: &[&'a Dictionary], category: &[u8], name: &[u8]) -> Option<&'a Object> {
    for r in resources {
        if let Ok(cat) = r.get(category) {
            if let Ok(d) = deref(doc, cat).as_dict() {
                if let Ok(o) = d.get(name) {
                    return Some(o);
                }
            }
        }
    }
    None
}

fn color_space_of(doc: &Document, resources: &[&Dictionary], name: &[u8]) -> ColorSpace {
    match name {
        b"DeviceGray" | b"G" | b"CalGray" => return ColorSpace::Gray,
        b"DeviceRGB" | b"RGB" | b"CalRGB" => return ColorSpace::Rgb,
        b"DeviceCMYK" | b"CMYK" => return ColorSpace::Cmyk,
        _ => {}
    }
    let Some(o) = lookup(doc, resources, b"ColorSpace", name) else { return ColorSpace::Other };
    match deref(doc, o) {
        Object::Name(n) => color_space_of(doc, &[], n),
        Object::Array(a) => {
            let family = a.first().and_then(|o| deref(doc, o).as_name().ok()).unwrap_or(b"");
            match family {
                b"CalGray" => ColorSpace::Gray,
                b"CalRGB" => ColorSpace::Rgb,
                b"ICCBased" => {
                    let n = a
                        .get(1)
                        .and_then(|o| deref(doc, o).as_stream().ok())
                        .and_then(|s| s.dict.get(b"N").ok())
                        .and_then(|n| deref(doc, n).as_i64().ok());
                    match n {
                        Some(1) => ColorSpace::Gray,
                        Some(3) => ColorSpace::Rgb,
                        Some(4) => ColorSpace::Cmyk,
                        _ => ColorSpace::Other,
                    }
                }
                _ => ColorSpace::Other,
            }
        }
        _ => ColorSpace::Other,
    }
}

/// Reads the page's content streams and joins them with a newline, as the PDF spec defines.
pub fn page_content_bytes(doc: &Document, page_id: ObjectId) -> (Vec<u8>, Vec<Segment>, bool) {
    let mut data = Vec::new();
    let mut segments = Vec::new();
    let mut incomplete = false;
    for id in doc.get_page_contents(page_id) {
        let bytes = doc
            .get_object(id)
            .and_then(Object::as_stream)
            .and_then(|s| s.get_plain_content_with_limit(MAX_STREAM_BYTES.saturating_sub(data.len())));
        let Ok(bytes) = bytes else {
            incomplete = true;
            continue;
        };
        let start = data.len();
        data.extend_from_slice(&bytes);
        segments.push(Segment { id, start, end: data.len() });
        data.push(b'\n');
    }
    (data, segments, incomplete)
}

struct Interp<'a> {
    doc: &'a Document,
    cache: &'a mut FontCache,
    out: PageContent,
    font_index: HashMap<usize, usize>,
    form_stack: Vec<ObjectId>,
    /// Parsed forms, so a form drawn many times is decoded once.
    forms: HashMap<ObjectId, ParsedForm>,
    invocations: usize,
    ops_seen: usize,
    over_budget: Option<&'static str>,
}

impl<'a> Interp<'a> {
    fn font_slot(&mut self, f: Rc<PdfFont>) -> usize {
        let key = Rc::as_ptr(&f) as usize;
        if let Some(&i) = self.font_index.get(&key) {
            return i;
        }
        self.out.fonts.push(f);
        self.font_index.insert(key, self.out.fonts.len() - 1);
        self.out.fonts.len() - 1
    }

    #[allow(clippy::too_many_arguments)]
    fn show(&mut self, gs: &GState, tm: &mut Matrix, source: usize, op: usize, elem: usize, bytes: &[u8]) {
        let Some(fi) = gs.font else { return };
        let font = self.out.fonts[fi].clone();
        for (byte, (code, nbytes)) in decode_with_offsets(&font, bytes) {
            let w0 = font.width(code) / 1000.0;
            let trm = Matrix([gs.tfs * gs.th, 0.0, 0.0, gs.tfs, 0.0, gs.trise]).then(tm).then(&gs.ctm);
            let base = tm.then(&gs.ctm);
            let scale = base.x_scale();
            let mut tx = w0 * gs.tfs + gs.tc;
            if font.is_word_space(code, nbytes) {
                tx += gs.tw;
            }
            tx *= gs.th;
            self.out.glyphs.push(Glyph {
                text: font.unicode(code).unwrap_or_default(),
                code,
                nbytes: nbytes as u8,
                font: fi,
                size: trm.y_scale(),
                origin: trm.apply(0.0, 0.0),
                angle: base.x_angle(),
                width: w0 * gs.tfs * gs.th * scale,
                advance: tx * scale,
                color: gs.fill,
                render_mode: gs.tr,
                source,
                op,
                elem,
                byte,
            });
            *tm = Matrix::translate(tx, 0.0).then(tm);
        }
    }

    fn run(&mut self, source: usize, resources: &[&'a Dictionary], ctm: Matrix) {
        let ops = self.out.sources[source].ops.clone();
        let mut gs = GState {
            ctm,
            fill: [0, 0, 0],
            fill_cs: ColorSpace::Gray,
            tc: 0.0,
            tw: 0.0,
            th: 1.0,
            tl: 0.0,
            tfs: 0.0,
            trise: 0.0,
            tr: 0,
            font: None,
            font_res: Vec::new(),
        };
        let mut stack: Vec<GState> = Vec::new();
        let mut tm = Matrix::IDENTITY;
        let mut tlm = Matrix::IDENTITY;
        let mut events: Vec<TextEvent> = Vec::new();

        for (i, op) in ops.iter().enumerate() {
            self.ops_seen += 1;
            if self.ops_seen > MAX_OPS {
                self.over_budget = Some("too-many-operators");
            }
            if self.out.glyphs.len() > MAX_GLYPHS {
                self.over_budget = Some("too-many-glyphs");
            }
            if self.over_budget.is_some() {
                break;
            }
            let n = |k: usize| op.num(k);
            match op.name.as_slice() {
                b"q" => stack.push(gs.clone()),
                b"Q" => {
                    if let Some(s) = stack.pop() {
                        gs = s;
                    }
                }
                b"cm" => gs.ctm = Matrix([n(0), n(1), n(2), n(3), n(4), n(5)]).then(&gs.ctm),
                b"BT" => {
                    tm = Matrix::IDENTITY;
                    tlm = Matrix::IDENTITY;
                    events.push(TextEvent::Position { op: i, absolute: true });
                }
                b"Tc" => gs.tc = n(0),
                b"Tw" => gs.tw = n(0),
                b"Tz" => gs.th = n(0) / 100.0,
                b"TL" => gs.tl = n(0),
                b"Ts" => gs.trise = n(0),
                b"Tr" => gs.tr = n(0) as u8,
                b"Tf" => {
                    gs.tfs = n(1);
                    if let Some(name) = op.operands.first().and_then(Operand::name) {
                        gs.font_res = name.to_vec();
                        gs.font = lookup(self.doc, resources, b"Font", name)
                            .and_then(|o| self.cache.get(self.doc, o))
                            .map(|f| self.font_slot(f));
                    }
                }
                b"Td" | b"TD" => {
                    if op.is(b"TD") {
                        gs.tl = -n(1);
                    }
                    tlm = Matrix::translate(n(0), n(1)).then(&tlm);
                    tm = tlm;
                    events.push(TextEvent::Position { op: i, absolute: false });
                }
                b"Tm" => {
                    tlm = Matrix([n(0), n(1), n(2), n(3), n(4), n(5)]);
                    tm = tlm;
                    events.push(TextEvent::Position { op: i, absolute: true });
                }
                b"T*" => {
                    tlm = Matrix::translate(0.0, -gs.tl).then(&tlm);
                    tm = tlm;
                    events.push(TextEvent::Position { op: i, absolute: false });
                }
                b"Tj" | b"TJ" | b"'" | b"\"" => {
                    let kind = match op.name.as_slice() {
                        b"Tj" => ShowKind::Tj,
                        b"TJ" => ShowKind::TJ,
                        b"'" => ShowKind::Quote,
                        _ => ShowKind::DoubleQuote,
                    };
                    if kind == ShowKind::DoubleQuote {
                        gs.tw = n(0);
                        gs.tc = n(1);
                    }
                    if matches!(kind, ShowKind::Quote | ShowKind::DoubleQuote) {
                        tlm = Matrix::translate(0.0, -gs.tl).then(&tlm);
                        tm = tlm;
                    }
                    let first = self.out.glyphs.len();
                    let state = ShowState {
                        font: gs.font.unwrap_or(usize::MAX),
                        font_res: gs.font_res.clone(),
                        tfs: gs.tfs,
                        th: gs.th,
                        tc: gs.tc,
                        tw: gs.tw,
                        scale: tm.then(&gs.ctm).x_scale(),
                    };
                    match (kind, op.operands.last()) {
                        (ShowKind::TJ, Some(Operand::Array(items))) => {
                            for (e, it) in items.iter().enumerate() {
                                match it {
                                    Operand::Str(s) => self.show(&gs, &mut tm, source, i, e, s),
                                    Operand::Num(k) => {
                                        tm = Matrix::translate(-k / 1000.0 * gs.tfs * gs.th, 0.0).then(&tm);
                                    }
                                    _ => {}
                                }
                            }
                        }
                        (_, Some(Operand::Str(s))) => self.show(&gs, &mut tm, source, i, 0, s),
                        _ => {}
                    }
                    events.push(TextEvent::Show { op: i, kind, state, glyphs: first..self.out.glyphs.len() });
                }
                b"g" => {
                    gs.fill_cs = ColorSpace::Gray;
                    gs.fill = [to_u8(n(0)); 3];
                }
                b"rg" => {
                    gs.fill_cs = ColorSpace::Rgb;
                    gs.fill = [to_u8(n(0)), to_u8(n(1)), to_u8(n(2))];
                }
                b"k" => {
                    gs.fill_cs = ColorSpace::Cmyk;
                    gs.fill = color_from(ColorSpace::Cmyk, &[n(0), n(1), n(2), n(3)]).unwrap_or([0, 0, 0]);
                }
                b"cs" => {
                    if let Some(name) = op.operands.first().and_then(Operand::name) {
                        gs.fill_cs = color_space_of(self.doc, resources, name);
                        gs.fill = [0, 0, 0];
                    }
                }
                b"sc" | b"scn" => {
                    let v: Vec<f64> = op.operands.iter().filter_map(Operand::num).collect();
                    if let Some(c) = color_from(gs.fill_cs, &v) {
                        gs.fill = c;
                    }
                }
                b"Do" => {
                    let Some(name) = op.operands.first().and_then(Operand::name) else { continue };
                    let Some(Object::Reference(id)) = lookup(self.doc, resources, b"XObject", name) else { continue };
                    let id = *id;
                    let Ok(stream) = self.doc.get_object(id).and_then(Object::as_stream) else { continue };
                    let is_form = stream.dict.get(b"Subtype").ok().and_then(|o| o.as_name().ok()) == Some(b"Form".as_slice());
                    if !is_form || self.form_stack.len() >= MAX_FORM_DEPTH || self.form_stack.contains(&id) {
                        continue;
                    }
                    self.invocations += 1;
                    if self.invocations > MAX_FORM_INVOCATIONS {
                        self.over_budget = Some("too-many-form-invocations");
                        break;
                    }
                    let (data, parsed) = match self.forms.get(&id) {
                        Some(f) => f.clone(),
                        None => {
                            let Ok(data) = stream.get_plain_content_with_limit(MAX_STREAM_BYTES) else { continue };
                            let parsed = Rc::new(content::parse(&data));
                            let f = (Rc::new(data), parsed);
                            self.forms.insert(id, f.clone());
                            f
                        }
                    };
                    let matrix = match stream.dict.get(b"Matrix").ok().map(|o| deref(self.doc, o)) {
                        Some(Object::Array(a)) if a.len() == 6 => {
                            let v: Vec<f64> =
                                a.iter().map(|o| deref(self.doc, o).as_float().map(f64::from).unwrap_or(0.0)).collect();
                            Matrix([v[0], v[1], v[2], v[3], v[4], v[5]])
                        }
                        _ => Matrix::IDENTITY,
                    };
                    let own = stream.dict.get(b"Resources").ok().and_then(|o| deref(self.doc, o).as_dict().ok());
                    let mut res: Vec<&'a Dictionary> = Vec::new();
                    res.extend(own);
                    res.extend_from_slice(resources);
                    self.out.sources.push(Source {
                        kind: SourceKind::Form(id),
                        data,
                        ops: parsed,
                        events: Vec::new(),
                        invoked_by: Some((source, i, name.to_vec())),
                    });
                    let child = self.out.sources.len() - 1;
                    self.form_stack.push(id);
                    self.run(child, &res, matrix.then(&gs.ctm));
                    self.form_stack.pop();
                }
                _ => {}
            }
        }
        self.out.sources[source].events = events;
    }
}

/// Iterates the codes of a string with the byte offset of each.
pub fn decode_with_offsets<'b>(font: &PdfFont, bytes: &'b [u8]) -> impl Iterator<Item = (usize, (u32, usize))> + 'b {
    let mut off = 0;
    font.decode(bytes).map(move |(c, n)| {
        let o = off;
        off += n;
        (o, (c, n))
    })
}

/// Interprets a page and returns every glyph and the text events of each stream.
pub fn interpret_page(doc: &Document, cache: &mut FontCache, page_id: ObjectId) -> Result<PageContent, &'static str> {
    let (data, segments, incomplete) = page_content_bytes(doc, page_id);
    let mut pc = interpret_bytes(doc, cache, page_id, data, segments)?;
    pc.incomplete = incomplete;
    Ok(pc)
}

/// Same as [`interpret_page`] but with the page content supplied by the caller. The editor uses
/// this to check a rewritten stream before committing it.
pub fn interpret_bytes(
    doc: &Document,
    cache: &mut FontCache,
    page_id: ObjectId,
    data: Vec<u8>,
    segments: Vec<Segment>,
) -> Result<PageContent, &'static str> {
    let ops = content::parse(&data);
    let resources = page_resources(doc, page_id);
    let mut it = Interp {
        doc,
        cache,
        out: PageContent { glyphs: Vec::new(), fonts: Vec::new(), sources: Vec::new(), segments, incomplete: false },
        font_index: HashMap::new(),
        form_stack: Vec::new(),
        forms: HashMap::new(),
        invocations: 0,
        ops_seen: 0,
        over_budget: None,
    };
    it.out.sources.push(Source {
        kind: SourceKind::Page,
        data: Rc::new(data),
        ops: Rc::new(ops),
        events: Vec::new(),
        invoked_by: None,
    });
    it.run(0, &resources, Matrix::IDENTITY);
    match it.over_budget {
        Some(reason) => Err(reason),
        None => Ok(it.out),
    }
}
