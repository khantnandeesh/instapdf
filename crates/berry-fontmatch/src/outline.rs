//! Glyph outlines as flattened contours in em units.

/// One glyph: closed contours of straight segments, y up, 1.0 = one em.
#[derive(Clone, Debug, Default)]
pub struct Glyph {
    pub advance: f32,
    pub contours: Vec<Vec<(f32, f32)>>,
}

impl Glyph {
    pub fn has_ink(&self) -> bool {
        self.contours.iter().any(|c| c.len() >= 3)
    }

    /// (x0, y0, x1, y1) of the outline.
    pub fn bbox(&self) -> (f32, f32, f32, f32) {
        let mut b = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for &(x, y) in self.contours.iter().flatten() {
            b = (b.0.min(x), b.1.min(y), b.2.max(x), b.3.max(y));
        }
        b
    }

    /// Inked spans (x0, x1) along the horizontal line at `y`, by non-zero winding, left to right.
    pub fn row_spans(&self, y: f32) -> Vec<(f32, f32)> {
        spans(&self.contours, y, false)
    }

    /// Inked spans (y0, y1) along the vertical line at `x`.
    pub fn column_spans(&self, x: f32) -> Vec<(f32, f32)> {
        spans(&self.contours, x, true)
    }
}

fn spans(contours: &[Vec<(f32, f32)>], at: f32, vertical: bool) -> Vec<(f32, f32)> {
    // (position along the line, winding direction) of every edge crossing.
    let mut hits: Vec<(f32, i32)> = Vec::new();
    for c in contours {
        for i in 0..c.len() {
            let (p, q) = (c[i], c[(i + 1) % c.len()]);
            let ((a0, b0), (a1, b1)) = if vertical { ((p.1, p.0), (q.1, q.0)) } else { (p, q) };
            // The edge runs from (a0, b0) to (a1, b1), where b is the axis the line is fixed on.
            if (b0 <= at) == (b1 <= at) {
                continue;
            }
            let t = (at - b0) / (b1 - b0);
            hits.push((a0 + t * (a1 - a0), if b1 > b0 { 1 } else { -1 }));
        }
    }
    hits.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut out = Vec::new();
    let (mut wind, mut start) = (0, 0f32);
    for (pos, dir) in hits {
        if wind == 0 {
            start = pos;
        }
        wind += dir;
        if wind == 0 && pos > start {
            out.push((start, pos));
        }
    }
    out
}

/// Where glyphs come from: a font file here, or a PDF font program in the engine.
pub trait GlyphSource {
    fn glyph(&self, ch: char) -> Option<Glyph>;
}

/// A TrueType or OpenType (CFF) font file.
pub struct OpenTypeSource<'a> {
    face: ttf_parser::Face<'a>,
}

impl<'a> OpenTypeSource<'a> {
    pub fn parse(bytes: &'a [u8]) -> Option<Self> {
        ttf_parser::Face::parse(bytes, 0).ok().map(|face| OpenTypeSource { face })
    }

    pub fn face(&self) -> &ttf_parser::Face<'a> {
        &self.face
    }

    /// The glyph with this id (for PDF fonts addressed by glyph, not by character).
    pub fn glyph_by_id(&self, gid: u16) -> Option<Glyph> {
        let upm = self.face.units_per_em() as f32;
        if upm <= 0.0 {
            return None;
        }
        let id = ttf_parser::GlyphId(gid);
        let mut b = Flatten { scale: 1.0 / upm, contours: Vec::new(), at: (0.0, 0.0) };
        self.face.outline_glyph(id, &mut b)?;
        let advance = self.face.glyph_hor_advance(id).unwrap_or(0) as f32 / upm;
        Some(Glyph { advance, contours: b.contours })
    }
}

impl GlyphSource for OpenTypeSource<'_> {
    fn glyph(&self, ch: char) -> Option<Glyph> {
        let id = self.face.glyph_index(ch).filter(|g| g.0 != 0)?;
        self.glyph_by_id(id.0)
    }
}

/// Collects an outline as polylines: 4 segments a quadratic curve, 6 a cubic.
struct Flatten {
    scale: f32,
    contours: Vec<Vec<(f32, f32)>>,
    at: (f32, f32),
}

impl Flatten {
    fn push(&mut self, x: f32, y: f32) {
        self.at = (x, y);
        if let Some(c) = self.contours.last_mut() {
            c.push((x * self.scale, y * self.scale));
        }
    }
}

impl ttf_parser::OutlineBuilder for Flatten {
    fn move_to(&mut self, x: f32, y: f32) {
        self.contours.push(Vec::new());
        self.push(x, y);
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.push(x, y);
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        let p0 = self.at;
        for i in 1..=4 {
            let t = i as f32 / 4.0;
            let u = 1.0 - t;
            self.push(u * u * p0.0 + 2.0 * u * t * x1 + t * t * x, u * u * p0.1 + 2.0 * u * t * y1 + t * t * y);
        }
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        let p0 = self.at;
        for i in 1..=6 {
            let t = i as f32 / 6.0;
            let u = 1.0 - t;
            let (a, b, c, d) = (u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t);
            self.push(a * p0.0 + b * x1 + c * x2 + d * x, a * p0.1 + b * y1 + c * y2 + d * y);
        }
    }
    fn close(&mut self) {}
}
