//! PDF font model: decoding codes, widths, Unicode mapping and glyph presence in the embedded
//! font program. The embedded program is parsed directly; we never trust a viewer's lookup.

use crate::content;
use crate::tables;
use lopdf::{Dictionary, Document, Object, ObjectId};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FontKind {
    Type1,
    TrueType,
    Type0,
    Type3,
}

/// The embedded font program, if any.
#[derive(Clone, Debug)]
pub enum Program {
    /// Not embedded: the viewer substitutes a system font.
    None,
    /// `FontFile2`, or `FontFile3` with an OpenType wrapper around `glyf` outlines.
    TrueType(Vec<u8>),
    /// Bare CFF (`FontFile3` Type1C / CIDFontType0C) or the `CFF ` table of an OpenType file.
    Cff(Vec<u8>),
    /// `FontFile`: the glyph names found in its CharStrings dictionary.
    Type1(HashSet<String>),
    /// Type 3: the glyph names in `CharProcs`.
    Type3(HashSet<String>),
    /// Embedded but we could not read it.
    Unreadable,
}

#[derive(Clone, Debug)]
enum Widths {
    Simple { first: u32, widths: Vec<f64>, missing: f64 },
    Cid { map: HashMap<u32, f64>, default: f64 },
}

#[derive(Clone, Debug)]
pub struct PdfFont {
    pub object_id: Option<ObjectId>,
    /// `BaseFont` as written, including any subset prefix.
    pub base_font: String,
    pub kind: FontKind,
    pub subset: bool,
    pub embedded: bool,
    /// Codes are two bytes (Type 0 with Identity or another two-byte CMap).
    pub two_byte: bool,
    /// False when the font uses a CMap we do not decode exactly; such text is read-only.
    pub cmap_supported: bool,
    pub vertical: bool,
    pub flags: u32,
    pub italic_angle: f64,
    pub font_weight: f64,
    /// Ascent and descent in 1/1000 em.
    pub ascent: f64,
    pub descent: f64,
    widths: Widths,
    to_unicode: HashMap<u32, String>,
    /// Simple fonts: glyph name per code.
    names: Vec<Option<String>>,
    cid_to_gid: Option<Vec<u16>>,
    pub program: Program,
    /// CIDFontType0 with a CID-keyed CFF: CID → GID.
    cff_cid_to_gid: Option<HashMap<u16, u16>>,
    symbolic_truetype: bool,
}

/// Family name without the `ABCDEF+` subset prefix.
pub fn strip_subset_prefix(name: &str) -> (&str, bool) {
    if let Some((prefix, rest)) = name.split_once('+') {
        if prefix.len() == 6 && prefix.bytes().all(|b| b.is_ascii_uppercase()) {
            return (rest, true);
        }
    }
    (name, false)
}

fn deref<'a>(doc: &'a Document, o: &'a Object) -> &'a Object {
    doc.dereference(o).map(|(_, o)| o).unwrap_or(o)
}

fn get<'a>(doc: &'a Document, d: &'a Dictionary, key: &[u8]) -> Option<&'a Object> {
    d.get(key).ok().map(|o| deref(doc, o)).filter(|o| !o.is_null())
}

fn get_num(doc: &Document, d: &Dictionary, key: &[u8]) -> Option<f64> {
    get(doc, d, key).and_then(|o| o.as_float().ok()).map(f64::from)
}

fn get_dict<'a>(doc: &'a Document, d: &'a Dictionary, key: &[u8]) -> Option<&'a Dictionary> {
    match get(doc, d, key)? {
        Object::Dictionary(d) => Some(d),
        Object::Stream(s) => Some(&s.dict),
        _ => None,
    }
}

fn get_stream_data(doc: &Document, d: &Dictionary, key: &[u8]) -> Option<Vec<u8>> {
    match get(doc, d, key)? {
        Object::Stream(s) => s.get_plain_content().ok(),
        _ => None,
    }
}

/// Maps a glyph name to Unicode text: the glyph list, then `uniXXXX`, `uXXXX` and `a_b` forms.
pub fn glyph_name_to_unicode(name: &str) -> Option<String> {
    let base = name.split('.').next().unwrap_or(name);
    if base.is_empty() {
        return None;
    }
    if let Ok(i) = tables::GLYPH_NAMES.binary_search_by(|(n, _)| (*n).cmp(base)) {
        return char::from_u32(tables::GLYPH_NAMES[i].1).map(String::from);
    }
    if base.contains('_') {
        let parts: Option<Vec<String>> = base.split('_').map(glyph_name_to_unicode).collect();
        return parts.map(|p| p.concat());
    }
    if let Some(hex) = base.strip_prefix("uni") {
        if hex.len() >= 4 && hex.len() % 4 == 0 {
            let units: Option<Vec<u16>> =
                (0..hex.len() / 4).map(|i| u16::from_str_radix(&hex[i * 4..i * 4 + 4], 16).ok()).collect();
            return units.and_then(|u| String::from_utf16(&u).ok());
        }
    }
    if let Some(hex) = base.strip_prefix('u') {
        if (4..=6).contains(&hex.len()) {
            return u32::from_str_radix(hex, 16).ok().and_then(char::from_u32).map(String::from);
        }
    }
    None
}

fn std14_alias(name: &str) -> Option<&'static str> {
    let n: String = name.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase();
    let bold = n.contains("bold");
    let italic = n.contains("italic") || n.contains("oblique");
    let pick = |r: &'static str, b: &'static str, i: &'static str, bi: &'static str| match (bold, italic) {
        (false, false) => r,
        (true, false) => b,
        (false, true) => i,
        (true, true) => bi,
    };
    if n.starts_with("helvetica") || n.starts_with("arial") {
        Some(pick("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"))
    } else if n.starts_with("times") {
        Some(pick("Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"))
    } else if n.starts_with("courier") {
        Some(pick("Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"))
    } else if n == "symbol" {
        Some("Symbol")
    } else if n == "zapfdingbats" {
        Some("ZapfDingbats")
    } else {
        None
    }
}

type Std14 = &'static (&'static str, i16, i16, &'static [(&'static str, u16)]);

fn std14(name: &str) -> Option<Std14> {
    let ps = std14_alias(name)?;
    tables::STD14.iter().find(|f| f.0 == ps)
}

fn std14_width(font: Std14, glyph: &str) -> Option<f64> {
    font.3.binary_search_by(|(n, _)| (*n).cmp(glyph)).ok().map(|i| font.3[i].1 as f64)
}

/// Parses a ToUnicode CMap into code → text.
fn parse_to_unicode(data: &[u8]) -> HashMap<u32, String> {
    use content::Operand;
    fn code(b: &[u8]) -> u32 {
        b.iter().fold(0u32, |a, &x| a << 8 | x as u32)
    }
    fn text(b: &[u8]) -> String {
        let units: Vec<u16> = b.chunks(2).map(|c| if c.len() == 2 { (c[0] as u16) << 8 | c[1] as u16 } else { c[0] as u16 }).collect();
        String::from_utf16_lossy(&units)
    }
    let mut map = HashMap::new();
    for op in content::parse(data) {
        let strs = |o: &Operand| match o {
            Operand::Str(s) => Some(s.clone()),
            _ => None,
        };
        if op.is(b"endbfchar") {
            for pair in op.operands.chunks(2) {
                if let [Operand::Str(c), Operand::Str(t)] = pair {
                    map.insert(code(c), text(t));
                }
            }
        } else if op.is(b"endbfrange") {
            for tri in op.operands.chunks(3) {
                let (Some(lo), Some(hi)) = (tri.first().and_then(strs), tri.get(1).and_then(strs)) else { continue };
                let (lo, hi) = (code(&lo), code(&hi));
                if hi < lo || hi - lo > 0xFFFF {
                    continue;
                }
                match tri.get(2) {
                    Some(Operand::Str(t)) => {
                        let mut units: Vec<u16> = t.chunks(2).map(|c| if c.len() == 2 { (c[0] as u16) << 8 | c[1] as u16 } else { c[0] as u16 }).collect();
                        for c in lo..=hi {
                            map.insert(c, String::from_utf16_lossy(&units));
                            if let Some(last) = units.last_mut() {
                                *last = last.wrapping_add(1);
                            }
                        }
                    }
                    Some(Operand::Array(items)) => {
                        for (i, it) in items.iter().enumerate() {
                            if let Operand::Str(t) = it {
                                map.insert(lo + i as u32, text(t));
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    map
}

/// Lists the glyph names in a Type 1 font's CharStrings (after eexec decryption).
fn type1_glyph_names(data: &[u8], len1: usize) -> HashSet<String> {
    let mut names = HashSet::new();
    let start = if len1 > 0 && len1 < data.len() {
        len1
    } else {
        match data.windows(5).position(|w| w == b"eexec") {
            Some(p) => p + 5,
            None => return names,
        }
    };
    let mut enc = &data[start..];
    while let [b, rest @ ..] = enc {
        if matches!(b, b' ' | b'\n' | b'\r' | b'\t') {
            enc = rest;
        } else {
            break;
        }
    }
    // ASCII-hex form if the first four bytes are all hex digits.
    let hex;
    if enc.len() >= 4 && enc[..4].iter().all(|b| b.is_ascii_hexdigit()) {
        let digits: Vec<u8> = enc.iter().copied().filter(|b| b.is_ascii_hexdigit()).collect();
        hex = digits
            .chunks(2)
            .filter(|c| c.len() == 2)
            .map(|c| u8::from_str_radix(std::str::from_utf8(c).unwrap_or("00"), 16).unwrap_or(0))
            .collect::<Vec<u8>>();
        enc = &hex;
    }
    let mut r: u16 = 55665;
    let mut plain = Vec::with_capacity(enc.len());
    for &c in enc {
        plain.push(c ^ (r >> 8) as u8);
        r = (c as u16).wrapping_add(r).wrapping_mul(52845).wrapping_add(22719);
    }
    let plain = plain.get(4..).unwrap_or(&[]);
    let Some(cs) = plain.windows(12).position(|w| w == b"/CharStrings") else { return names };
    let mut p = cs + 12;
    // Entries look like "/name 123 RD <123 bytes> ND".
    while p < plain.len() {
        if plain[p] == b'/' {
            let s = p + 1;
            let mut e = s;
            while e < plain.len() && !matches!(plain[e], b' ' | b'\n' | b'\r' | b'\t') {
                e += 1;
            }
            let name = String::from_utf8_lossy(&plain[s..e]).to_string();
            let mut q = e;
            while q < plain.len() && plain[q] == b' ' {
                q += 1;
            }
            let ns = q;
            while q < plain.len() && plain[q].is_ascii_digit() {
                q += 1;
            }
            let Ok(n) = std::str::from_utf8(&plain[ns..q]).unwrap_or("").parse::<usize>() else {
                p = e;
                continue;
            };
            // Skip " RD " or " -| " and the binary charstring.
            while q < plain.len() && plain[q] == b' ' {
                q += 1;
            }
            while q < plain.len() && plain[q] != b' ' {
                q += 1;
            }
            names.insert(name);
            p = q + 1 + n;
        } else if plain[p..].starts_with(b"end") {
            break;
        } else {
            p += 1;
        }
    }
    names
}

struct NullOutline(bool);
impl ttf_parser::OutlineBuilder for NullOutline {
    fn move_to(&mut self, _: f32, _: f32) {
        self.0 = true;
    }
    fn line_to(&mut self, _: f32, _: f32) {}
    fn quad_to(&mut self, _: f32, _: f32, _: f32, _: f32) {}
    fn curve_to(&mut self, _: f32, _: f32, _: f32, _: f32, _: f32, _: f32) {}
    fn close(&mut self) {}
}

fn is_blank_char(text: &str) -> bool {
    !text.is_empty() && text.chars().all(|c| c.is_whitespace() || c == '\u{a0}' || c == '\u{200b}')
}

impl PdfFont {
    /// Loads a font from its dictionary. Never fails: missing parts get safe defaults.
    pub fn load(doc: &Document, dict: &Dictionary, object_id: Option<ObjectId>) -> PdfFont {
        let subtype = get(doc, dict, b"Subtype").and_then(|o| o.as_name().ok()).unwrap_or(b"Type1").to_vec();
        let base_font = get(doc, dict, b"BaseFont")
            .and_then(|o| o.as_name().ok())
            .map(|n| String::from_utf8_lossy(n).to_string())
            .unwrap_or_default();
        let kind = match subtype.as_slice() {
            b"Type0" => FontKind::Type0,
            b"TrueType" => FontKind::TrueType,
            b"Type3" => FontKind::Type3,
            _ => FontKind::Type1,
        };
        let mut font = PdfFont {
            object_id,
            subset: strip_subset_prefix(&base_font).1,
            base_font,
            kind,
            embedded: false,
            two_byte: false,
            cmap_supported: true,
            vertical: false,
            flags: 0,
            italic_angle: 0.0,
            font_weight: 0.0,
            ascent: 0.0,
            descent: 0.0,
            widths: Widths::Simple { first: 0, widths: Vec::new(), missing: 0.0 },
            to_unicode: HashMap::new(),
            names: Vec::new(),
            cid_to_gid: None,
            program: Program::None,
            cff_cid_to_gid: None,
            symbolic_truetype: false,
        };
        if let Some(data) = get_stream_data(doc, dict, b"ToUnicode") {
            font.to_unicode = parse_to_unicode(&data);
        }
        match kind {
            FontKind::Type0 => font.load_type0(doc, dict),
            FontKind::Type3 => font.load_type3(doc, dict),
            _ => font.load_simple(doc, dict),
        }
        if font.ascent == 0.0 && font.descent == 0.0 {
            font.ascent = 880.0;
            font.descent = -220.0;
        }
        // Some producers write the descent as a positive number.
        if font.descent > 0.0 {
            font.descent = -font.descent;
        }
        font
    }

    fn load_descriptor(&mut self, doc: &Document, desc: &Dictionary) {
        self.flags = get_num(doc, desc, b"Flags").unwrap_or(0.0) as u32;
        self.italic_angle = get_num(doc, desc, b"ItalicAngle").unwrap_or(0.0);
        self.font_weight = get_num(doc, desc, b"FontWeight").unwrap_or(0.0);
        self.ascent = get_num(doc, desc, b"Ascent").unwrap_or(0.0);
        self.descent = get_num(doc, desc, b"Descent").unwrap_or(0.0);
        if let Some(data) = get_stream_data(doc, desc, b"FontFile2") {
            self.embedded = true;
            self.program = Program::TrueType(data);
        } else if let Some(Object::Stream(s)) = get(doc, desc, b"FontFile3") {
            self.embedded = true;
            let sub = s.dict.get(b"Subtype").ok().and_then(|o| o.as_name().ok()).unwrap_or(b"").to_vec();
            self.program = match s.get_plain_content() {
                Err(_) => Program::Unreadable,
                Ok(data) if sub == b"OpenType" => match ttf_parser::RawFace::parse(&data, 0) {
                    Ok(raw) => match raw.table(ttf_parser::Tag::from_bytes(b"CFF ")) {
                        Some(cff) => Program::Cff(cff.to_vec()),
                        None => Program::TrueType(data),
                    },
                    Err(_) => Program::Unreadable,
                },
                Ok(data) => Program::Cff(data),
            };
        } else if let Some(Object::Stream(s)) = get(doc, desc, b"FontFile") {
            self.embedded = true;
            let len1 = s.dict.get(b"Length1").ok().map(|o| deref(doc, o)).and_then(|o| o.as_i64().ok()).unwrap_or(0);
            self.program = match s.get_plain_content() {
                Ok(data) => {
                    let names = type1_glyph_names(&data, len1.max(0) as usize);
                    if names.is_empty() {
                        Program::Unreadable
                    } else {
                        Program::Type1(names)
                    }
                }
                Err(_) => Program::Unreadable,
            };
        }
    }

    fn load_simple(&mut self, doc: &Document, dict: &Dictionary) {
        let std = std14(strip_subset_prefix(&self.base_font).0);
        let mut missing = 0.0;
        if let Some(desc) = get_dict(doc, dict, b"FontDescriptor") {
            self.load_descriptor(doc, desc);
            missing = get_num(doc, desc, b"MissingWidth").unwrap_or(0.0);
        } else if let Some(s) = std {
            self.ascent = s.1 as f64;
            self.descent = s.2 as f64;
        }
        let symbolic = self.flags & 4 != 0 && self.flags & 32 == 0;

        // Encoding: base table plus Differences.
        let mut base: Option<&[&str; 256]> = None;
        let mut differences: Vec<(usize, String)> = Vec::new();
        let enc = get(doc, dict, b"Encoding");
        let base_by_name = |n: &[u8]| match n {
            b"WinAnsiEncoding" => Some(&tables::WIN_ANSI),
            b"MacRomanEncoding" => Some(&tables::MAC_ROMAN),
            b"StandardEncoding" => Some(&tables::STANDARD),
            _ => None,
        };
        match enc {
            Some(Object::Name(n)) => base = base_by_name(n),
            Some(Object::Dictionary(e)) => {
                base = get(doc, e, b"BaseEncoding").and_then(|o| o.as_name().ok()).and_then(base_by_name);
                if let Some(Object::Array(items)) = get(doc, e, b"Differences") {
                    let mut code = 0usize;
                    for it in items {
                        match deref(doc, it) {
                            Object::Integer(i) => code = (*i).max(0) as usize,
                            Object::Name(n) => {
                                differences.push((code, String::from_utf8_lossy(n).to_string()));
                                code += 1;
                            }
                            _ => {}
                        }
                    }
                }
            }
            _ => {}
        }
        let has_encoding = enc.is_some();
        if base.is_none() {
            let stem = strip_subset_prefix(&self.base_font).0;
            base = match std14_alias(stem) {
                Some("Symbol") => Some(&tables::SYMBOL),
                Some("ZapfDingbats") => Some(&tables::ZAPF_DINGBATS),
                _ if self.kind == FontKind::TrueType && symbolic && !has_encoding => None,
                // An embedded Type 1 or CFF font without /Encoding uses its built-in one; we
                // read that from the CFF below when we can.
                _ => Some(&tables::STANDARD),
            };
        }
        self.symbolic_truetype = self.kind == FontKind::TrueType && (symbolic || base.is_none());
        let mut names: Vec<Option<String>> = match base {
            Some(t) => t.iter().map(|n| if n.is_empty() { None } else { Some(n.to_string()) }).collect(),
            None => vec![None; 256],
        };
        if !has_encoding {
            if let Program::Cff(data) = &self.program {
                if let Some(cff) = ttf_parser::cff::Table::parse(data) {
                    for (code, slot) in names.iter_mut().enumerate() {
                        if let Some(n) = cff.glyph_index(code as u8).and_then(|g| cff.glyph_name(g)) {
                            *slot = Some(n.to_string());
                        }
                    }
                }
            }
        }
        for (code, name) in differences {
            if code < 256 {
                names[code] = Some(name);
            }
        }
        self.names = names;

        // Widths.
        let first = get_num(doc, dict, b"FirstChar").unwrap_or(0.0).max(0.0) as u32;
        let mut widths: Vec<f64> = match get(doc, dict, b"Widths") {
            Some(Object::Array(a)) => a.iter().map(|o| deref(doc, o).as_float().map(f64::from).unwrap_or(0.0)).collect(),
            _ => Vec::new(),
        };
        let mut first = first;
        if widths.is_empty() {
            first = 0;
            if let Some(s) = std {
                widths = (0..256)
                    .map(|c| self.names[c].as_deref().and_then(|n| std14_width(s, n)).unwrap_or(0.0))
                    .collect();
            } else if let Program::TrueType(data) = &self.program {
                if let Ok(face) = ttf_parser::Face::parse(data, 0) {
                    let upem = face.units_per_em() as f64;
                    widths = (0..256u32)
                        .map(|c| {
                            self.simple_truetype_gid(&face, c)
                                .and_then(|g| face.glyph_hor_advance(ttf_parser::GlyphId(g)))
                                .map(|w| w as f64 * 1000.0 / upem)
                                .unwrap_or(0.0)
                        })
                        .collect();
                }
            }
        }
        self.widths = Widths::Simple { first, widths, missing };
    }

    fn load_type3(&mut self, doc: &Document, dict: &Dictionary) {
        self.load_simple(doc, dict);
        self.embedded = true;
        let scale = match get(doc, dict, b"FontMatrix") {
            Some(Object::Array(a)) if a.len() == 6 => deref(doc, &a[0]).as_float().map(f64::from).unwrap_or(0.001),
            _ => 0.001,
        };
        // Keep widths in the 1/1000 convention used everywhere else.
        if let Widths::Simple { widths, missing, .. } = &mut self.widths {
            for w in widths.iter_mut() {
                *w *= scale * 1000.0;
            }
            *missing *= scale * 1000.0;
        }
        let mut procs = HashSet::new();
        if let Some(cp) = get_dict(doc, dict, b"CharProcs") {
            for (k, _) in cp.iter() {
                procs.insert(String::from_utf8_lossy(k).to_string());
            }
        }
        if let Some(Object::Array(bbox)) = get(doc, dict, b"FontBBox") {
            let v: Vec<f64> = bbox.iter().map(|o| deref(doc, o).as_float().map(f64::from).unwrap_or(0.0)).collect();
            if v.len() == 4 && (v[3] - v[1]).abs() > 0.0 {
                self.ascent = v[3].max(v[1]) * scale * 1000.0;
                self.descent = v[1].min(v[3]) * scale * 1000.0;
            }
        }
        self.program = Program::Type3(procs);
    }

    fn load_type0(&mut self, doc: &Document, dict: &Dictionary) {
        self.two_byte = true;
        match get(doc, dict, b"Encoding") {
            Some(Object::Name(n)) => {
                self.vertical = n.ends_with(b"-V");
                self.cmap_supported = n.starts_with(b"Identity");
            }
            _ => self.cmap_supported = false,
        }
        let mut default = 1000.0;
        let mut map = HashMap::new();
        let descendant = match get(doc, dict, b"DescendantFonts") {
            Some(Object::Array(a)) => a.first().map(|o| deref(doc, o)).and_then(|o| o.as_dict().ok()),
            _ => None,
        };
        if let Some(cid) = descendant {
            if let Some(desc) = get_dict(doc, cid, b"FontDescriptor") {
                self.load_descriptor(doc, desc);
            }
            default = get_num(doc, cid, b"DW").unwrap_or(1000.0);
            if let Some(Object::Array(w)) = get(doc, cid, b"W") {
                let mut i = 0;
                while i < w.len() {
                    let Ok(c0) = deref(doc, &w[i]).as_float() else { break };
                    let c0 = c0 as u32;
                    match w.get(i + 1).map(|o| deref(doc, o)) {
                        Some(Object::Array(list)) => {
                            for (k, o) in list.iter().enumerate() {
                                if let Ok(v) = deref(doc, o).as_float() {
                                    map.insert(c0 + k as u32, v as f64);
                                }
                            }
                            i += 2;
                        }
                        Some(o) => {
                            let (Ok(c1), Some(Ok(v))) = (o.as_float(), w.get(i + 2).map(|o| deref(doc, o).as_float())) else { break };
                            let c1 = c1 as u32;
                            if c1 >= c0 && c1 - c0 <= 0xFFFF {
                                for c in c0..=c1 {
                                    map.insert(c, v as f64);
                                }
                            }
                            i += 3;
                        }
                        None => break,
                    }
                }
            }
            if let Some(Object::Stream(s)) = get(doc, cid, b"CIDToGIDMap") {
                if let Ok(data) = s.get_plain_content() {
                    self.cid_to_gid = Some(data.chunks(2).filter(|c| c.len() == 2).map(|c| (c[0] as u16) << 8 | c[1] as u16).collect());
                }
            }
            if let Program::Cff(data) = &self.program {
                if let Some(cff) = ttf_parser::cff::Table::parse(data) {
                    let mut m = HashMap::new();
                    let mut keyed = false;
                    for g in 0..cff.number_of_glyphs() {
                        if let Some(c) = cff.glyph_cid(ttf_parser::GlyphId(g)) {
                            keyed = true;
                            m.insert(c, g);
                        }
                    }
                    if keyed {
                        self.cff_cid_to_gid = Some(m);
                    }
                }
            }
        }
        self.widths = Widths::Cid { map, default };
    }

    /// Splits a shown string into character codes with their byte length.
    pub fn decode<'a>(&self, bytes: &'a [u8]) -> impl Iterator<Item = (u32, usize)> + 'a {
        let two = self.two_byte;
        let mut i = 0;
        std::iter::from_fn(move || {
            if i >= bytes.len() {
                return None;
            }
            if two && i + 1 < bytes.len() {
                let c = (bytes[i] as u32) << 8 | bytes[i + 1] as u32;
                i += 2;
                Some((c, 2))
            } else {
                let c = bytes[i] as u32;
                i += 1;
                Some((c, 1))
            }
        })
    }

    /// Bytes for one character code.
    pub fn code_bytes(&self, code: u32) -> Vec<u8> {
        if self.two_byte {
            vec![(code >> 8) as u8, code as u8]
        } else {
            vec![code as u8]
        }
    }

    /// Advance width in 1/1000 of text space per unit of font size.
    pub fn width(&self, code: u32) -> f64 {
        match &self.widths {
            Widths::Simple { first, widths, missing } => {
                if code >= *first {
                    widths.get((code - first) as usize).copied().unwrap_or(*missing)
                } else {
                    *missing
                }
            }
            Widths::Cid { map, default } => map.get(&code).copied().unwrap_or(*default),
        }
    }

    /// Unicode text for a code, if the font tells us.
    pub fn unicode(&self, code: u32) -> Option<String> {
        if let Some(t) = self.to_unicode.get(&code) {
            if !t.is_empty() && !t.contains('\u{0}') {
                return Some(t.clone());
            }
        }
        if self.two_byte {
            return self.type0_unicode_from_program(code);
        }
        let name = self.names.get(code as usize).and_then(|n| n.as_deref());
        if let Some(u) = name.and_then(glyph_name_to_unicode) {
            return Some(u);
        }
        None
    }

    /// For a Type 0 font without ToUnicode: reverse the embedded cmap (GID → Unicode).
    fn type0_unicode_from_program(&self, code: u32) -> Option<String> {
        let Program::TrueType(data) = &self.program else { return None };
        let gid = self.gid_for(code)?;
        let face = ttf_parser::Face::parse(data, 0).ok()?;
        let cmap = face.tables().cmap?;
        let mut found = None;
        for st in cmap.subtables {
            if !st.is_unicode() {
                continue;
            }
            st.codepoints(|cp| {
                if found.is_none() && st.glyph_index(cp) == Some(ttf_parser::GlyphId(gid)) {
                    found = char::from_u32(cp);
                }
            });
            if found.is_some() {
                break;
            }
        }
        found.map(String::from)
    }

    fn simple_truetype_gid(&self, face: &ttf_parser::Face, code: u32) -> Option<u16> {
        let cmap = face.tables().cmap?;
        let name = self.names.get(code as usize).and_then(|n| n.as_deref());
        let uni = name.and_then(glyph_name_to_unicode).and_then(|s| s.chars().next());
        let mut sub30 = None;
        let mut sub31 = None;
        let mut sub10 = None;
        for st in cmap.subtables {
            match (st.platform_id, st.encoding_id) {
                (ttf_parser::PlatformId::Windows, 0) => sub30 = Some(st),
                (ttf_parser::PlatformId::Windows, 1) => sub31 = Some(st),
                (ttf_parser::PlatformId::Macintosh, 0) => sub10 = Some(st),
                _ => {}
            }
        }
        let nonzero = |g: Option<ttf_parser::GlyphId>| g.map(|g| g.0).filter(|&g| g != 0);
        if !self.symbolic_truetype {
            if let (Some(st), Some(u)) = (sub31, uni) {
                if let Some(g) = nonzero(st.glyph_index(u as u32)) {
                    return Some(g);
                }
            }
            if let (Some(st), Some(n)) = (sub10, name) {
                if let Some(mac) = tables::MAC_ROMAN.iter().position(|m| *m == n) {
                    if let Some(g) = nonzero(st.glyph_index(mac as u32)) {
                        return Some(g);
                    }
                }
            }
            if let Some(n) = name {
                if let Some(g) = face.glyph_index_by_name(n) {
                    return Some(g.0).filter(|&g| g != 0);
                }
            }
        }
        if let Some(st) = sub30 {
            for hi in [0u32, 0xF000, 0xF100, 0xF200] {
                if let Some(g) = nonzero(st.glyph_index(hi | code)) {
                    return Some(g);
                }
            }
        }
        if let Some(st) = sub10 {
            if let Some(g) = nonzero(st.glyph_index(code)) {
                return Some(g);
            }
        }
        if self.symbolic_truetype {
            if let (Some(st), Some(u)) = (sub31, uni) {
                return nonzero(st.glyph_index(u as u32));
            }
        }
        None
    }

    /// Glyph index in the embedded program for a code (TrueType and CID fonts).
    fn gid_for(&self, code: u32) -> Option<u16> {
        if self.two_byte {
            if let Some(m) = &self.cff_cid_to_gid {
                return m.get(&(code as u16)).copied();
            }
            return match &self.cid_to_gid {
                Some(m) => m.get(code as usize).copied(),
                None => Some(code as u16),
            };
        }
        match &self.program {
            Program::TrueType(data) => {
                let face = ttf_parser::Face::parse(data, 0).ok()?;
                self.simple_truetype_gid(&face, code)
            }
            _ => None,
        }
    }

    /// Whether the font can actually draw this code: `Some(true)` when the embedded program has
    /// a non-empty outline (or the code is blank by nature), `Some(false)` when it does not,
    /// `None` when we cannot tell.
    pub fn has_glyph(&self, code: u32) -> Option<bool> {
        let blank = self.unicode(code).map(|t| is_blank_char(&t)).unwrap_or(false);
        let name = || self.names.get(code as usize).and_then(|n| n.as_deref());
        match &self.program {
            Program::None => {
                if self.two_byte {
                    None
                } else {
                    Some(name().is_some())
                }
            }
            Program::Unreadable => None,
            Program::Type3(procs) | Program::Type1(procs) => Some(name().map(|n| procs.contains(n)).unwrap_or(false)),
            Program::TrueType(data) => {
                let face = ttf_parser::Face::parse(data, 0).ok()?;
                let gid = if self.two_byte { self.gid_for(code) } else { self.simple_truetype_gid(&face, code) };
                let Some(gid) = gid else {
                    // No usable cmap in the subset: we cannot map this code ourselves.
                    return if self.two_byte { Some(false) } else { None };
                };
                if gid == 0 || gid >= face.number_of_glyphs() {
                    return Some(false);
                }
                let mut b = NullOutline(false);
                let drawn = face.outline_glyph(ttf_parser::GlyphId(gid), &mut b).is_some() || b.0;
                Some(drawn || blank)
            }
            Program::Cff(data) => {
                let cff = ttf_parser::cff::Table::parse(data)?;
                let gid = if self.two_byte {
                    self.gid_for(code)
                } else {
                    name().and_then(|n| cff.glyph_index_by_name(n)).map(|g| g.0)
                };
                let Some(gid) = gid else { return Some(false) };
                if gid == 0 || gid >= cff.number_of_glyphs() {
                    return Some(false);
                }
                let mut b = NullOutline(false);
                let drawn = cff.outline(ttf_parser::GlyphId(gid), &mut b).is_ok() && b.0;
                Some(drawn || blank)
            }
        }
    }

    /// Finds a code that draws `ch` in this font and round-trips back to `ch`.
    ///
    /// `seen` holds codes already shown with this font on the page. They are known to render,
    /// so they win ties and stand in when the program cannot be checked.
    pub fn encode(&self, ch: char, seen: &HashSet<u32>) -> Option<u32> {
        if self.kind == FontKind::Type0 && !self.cmap_supported {
            return None;
        }
        let mut candidates: Vec<u32> = Vec::new();
        let mut buf = [0u8; 4];
        let target: &str = ch.encode_utf8(&mut buf);
        if self.two_byte {
            candidates.extend(self.to_unicode.iter().filter(|(_, t)| t.as_str() == target).map(|(c, _)| *c));
            if self.to_unicode.is_empty() {
                // No ToUnicode: go through the embedded Unicode cmap.
                if let Program::TrueType(data) = &self.program {
                    if let Ok(face) = ttf_parser::Face::parse(data, 0) {
                        if let Some(g) = face.glyph_index(ch) {
                            let cid = match &self.cid_to_gid {
                                Some(m) => m.iter().position(|&x| x == g.0).map(|p| p as u32),
                                None => Some(g.0 as u32),
                            };
                            candidates.extend(cid);
                        }
                    }
                }
            }
        } else {
            candidates.extend((0..256u32).filter(|&code| self.unicode(code).as_deref() == Some(target)));
        }
        candidates
            .into_iter()
            .filter_map(|code| match (seen.contains(&code), self.has_glyph(code)) {
                (_, Some(false)) => None,
                (true, _) => Some((0u8, code)),
                (false, Some(true)) => Some((1u8, code)),
                (false, None) => None,
            })
            .min()
            .map(|(_, c)| c)
    }

    /// True when the code's own advance is affected by word spacing (`Tw`).
    pub fn is_word_space(&self, code: u32, nbytes: usize) -> bool {
        code == 32 && nbytes == 1
    }

    pub fn is_bold(&self) -> bool {
        let n = self.base_font.to_ascii_lowercase();
        self.font_weight >= 600.0
            || self.flags & (1 << 18) != 0
            || ["bold", "black", "heavy", "semibold", "demi"].iter().any(|k| n.contains(k))
    }

    pub fn is_italic(&self) -> bool {
        let n = self.base_font.to_ascii_lowercase();
        self.italic_angle != 0.0 || self.flags & 64 != 0 || n.contains("italic") || n.contains("oblique")
    }

    pub fn is_serif(&self) -> bool {
        self.flags & 2 != 0
    }

    pub fn is_monospace(&self) -> bool {
        self.flags & 1 != 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glyph_names() {
        assert_eq!(glyph_name_to_unicode("Zcaron").as_deref(), Some("Ž"));
        assert_eq!(glyph_name_to_unicode("uni20B9").as_deref(), Some("₹"));
        assert_eq!(glyph_name_to_unicode("f_i").as_deref(), Some("fi"));
        assert_eq!(glyph_name_to_unicode("a.alt").as_deref(), Some("a"));
        assert_eq!(glyph_name_to_unicode("g123"), None);
    }

    #[test]
    fn subset_prefix() {
        assert_eq!(strip_subset_prefix("ABCDEF+Carlito-Bold"), ("Carlito-Bold", true));
        assert_eq!(strip_subset_prefix("Arial+Bold"), ("Arial+Bold", false));
    }

    #[test]
    fn to_unicode_ranges() {
        let cmap = b"1 beginbfchar <0003> <0020> endbfchar 2 beginbfrange <0010> <0012> <0041> <0020> <0021> [<0066 0069> <20B9>] endbfrange";
        let m = parse_to_unicode(cmap);
        assert_eq!(m[&3], " ");
        assert_eq!(m[&0x11], "B");
        assert_eq!(m[&0x20], "fi");
        assert_eq!(m[&0x21], "₹");
    }

    #[test]
    fn std14_metrics() {
        let f = std14("Arial-BoldMT").unwrap();
        assert_eq!(f.0, "Helvetica-Bold");
        assert_eq!(std14_width(std14("Helvetica").unwrap(), "A"), Some(667.0));
    }
}
