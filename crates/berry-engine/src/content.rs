//! Content-stream tokenizer that remembers the byte span of every operator.
//!
//! Editing never re-serialises a stream. We keep the original bytes and splice replacement
//! bytes over the span of the few operators that change, so everything else stays byte-identical.

/// One operand of a content-stream operator.
#[derive(Clone, Debug, PartialEq)]
pub enum Operand {
    Num(f64),
    /// A string, already unescaped (literal) or decoded (hex).
    Str(Vec<u8>),
    Name(Vec<u8>),
    Array(Vec<Operand>),
    /// An inline dictionary (marked-content properties), keys without the slash.
    Dict(Vec<(Vec<u8>, Operand)>),
    /// Booleans, null and anything past the nesting limit: kept only so parsing stays in sync.
    Other,
}

impl Operand {
    pub fn num(&self) -> Option<f64> {
        match self {
            Operand::Num(n) => Some(*n),
            _ => None,
        }
    }
    /// Value of a key in an inline dictionary.
    pub fn get(&self, key: &[u8]) -> Option<&Operand> {
        match self {
            Operand::Dict(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn name(&self) -> Option<&[u8]> {
        match self {
            Operand::Name(n) => Some(n),
            _ => None,
        }
    }
}

/// An operator with its operands and its byte span `[start, end)` in the stream.
/// The span starts at the first operand and ends after the operator keyword.
#[derive(Clone, Debug)]
pub struct Op {
    pub name: Vec<u8>,
    pub operands: Vec<Operand>,
    pub start: usize,
    pub end: usize,
}

impl Op {
    pub fn is(&self, name: &[u8]) -> bool {
        self.name == name
    }
    pub fn num(&self, i: usize) -> f64 {
        self.operands.get(i).and_then(Operand::num).unwrap_or(0.0)
    }
}

fn is_ws(b: u8) -> bool {
    matches!(b, 0 | 9 | 10 | 12 | 13 | 32)
}

fn is_delim(b: u8) -> bool {
    matches!(b, b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' | b'/' | b'%')
}

/// Deeper array or dictionary nesting than this is treated as junk (no real stream needs it,
/// and unbounded recursion would overflow the stack on hostile input).
const MAX_NESTING: usize = 32;

struct Lexer<'a> {
    d: &'a [u8],
    p: usize,
    depth: usize,
}

enum Tok {
    Operand(Operand),
    Keyword(Vec<u8>),
    ArrayEnd,
    DictEnd,
    Eof,
}

impl<'a> Lexer<'a> {
    fn skip_ws(&mut self) {
        while self.p < self.d.len() {
            let b = self.d[self.p];
            if is_ws(b) {
                self.p += 1;
            } else if b == b'%' {
                while self.p < self.d.len() && !matches!(self.d[self.p], b'\n' | b'\r') {
                    self.p += 1;
                }
            } else {
                break;
            }
        }
    }

    fn literal_string(&mut self) -> Vec<u8> {
        // self.p is just past '('
        let mut out = Vec::new();
        let mut depth = 1;
        while self.p < self.d.len() {
            let b = self.d[self.p];
            self.p += 1;
            match b {
                b'(' => {
                    depth += 1;
                    out.push(b);
                }
                b')' => {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                    out.push(b);
                }
                b'\\' => {
                    let Some(&e) = self.d.get(self.p) else { break };
                    self.p += 1;
                    match e {
                        b'n' => out.push(b'\n'),
                        b'r' => out.push(b'\r'),
                        b't' => out.push(b'\t'),
                        b'b' => out.push(8),
                        b'f' => out.push(12),
                        b'0'..=b'7' => {
                            let mut v = (e - b'0') as u32;
                            for _ in 0..2 {
                                match self.d.get(self.p) {
                                    Some(&o @ b'0'..=b'7') => {
                                        v = v * 8 + (o - b'0') as u32;
                                        self.p += 1;
                                    }
                                    _ => break,
                                }
                            }
                            out.push(v as u8);
                        }
                        b'\r' => {
                            if self.d.get(self.p) == Some(&b'\n') {
                                self.p += 1;
                            }
                        }
                        b'\n' => {}
                        other => out.push(other),
                    }
                }
                b'\r' => {
                    // An unescaped end-of-line inside a string reads as a single \n.
                    if self.d.get(self.p) == Some(&b'\n') {
                        self.p += 1;
                    }
                    out.push(b'\n');
                }
                _ => out.push(b),
            }
        }
        out
    }

    fn hex_string(&mut self) -> Vec<u8> {
        // self.p is just past '<'
        let mut out = Vec::new();
        let mut hi: Option<u8> = None;
        while self.p < self.d.len() {
            let b = self.d[self.p];
            self.p += 1;
            if b == b'>' {
                break;
            }
            let v = match b {
                b'0'..=b'9' => b - b'0',
                b'a'..=b'f' => b - b'a' + 10,
                b'A'..=b'F' => b - b'A' + 10,
                _ => continue,
            };
            match hi.take() {
                Some(h) => out.push(h << 4 | v),
                None => hi = Some(v),
            }
        }
        if let Some(h) = hi {
            out.push(h << 4);
        }
        out
    }

    fn name(&mut self) -> Vec<u8> {
        // self.p is just past '/'
        let mut out = Vec::new();
        while self.p < self.d.len() {
            let b = self.d[self.p];
            if is_ws(b) || is_delim(b) {
                break;
            }
            self.p += 1;
            if b == b'#' && self.p + 1 < self.d.len() {
                let h = std::str::from_utf8(&self.d[self.p..self.p + 2]).ok().and_then(|s| u8::from_str_radix(s, 16).ok());
                if let Some(h) = h {
                    out.push(h);
                    self.p += 2;
                    continue;
                }
            }
            out.push(b);
        }
        out
    }

    fn next(&mut self) -> Tok {
        self.skip_ws();
        let Some(&b) = self.d.get(self.p) else { return Tok::Eof };
        match b {
            b'(' => {
                self.p += 1;
                Tok::Operand(Operand::Str(self.literal_string()))
            }
            b'<' if self.d.get(self.p + 1) == Some(&b'<') => {
                self.p += 2;
                if self.depth >= MAX_NESTING {
                    return Tok::Operand(Operand::Other);
                }
                self.depth += 1;
                let mut entries = Vec::new();
                let mut key: Option<Vec<u8>> = None;
                loop {
                    match self.next() {
                        Tok::DictEnd | Tok::Eof => break,
                        Tok::Operand(o) => match (key.take(), o) {
                            (None, Operand::Name(k)) => key = Some(k),
                            (Some(k), v) => entries.push((k, v)),
                            (None, _) => {}
                        },
                        // true, false, null: kept as values the writer refuses to drop.
                        Tok::Keyword(_) if key.is_some() => entries.push((key.take().unwrap(), Operand::Other)),
                        _ => key = None,
                    }
                }
                self.depth -= 1;
                Tok::Operand(Operand::Dict(entries))
            }
            b'<' => {
                self.p += 1;
                Tok::Operand(Operand::Str(self.hex_string()))
            }
            b'>' if self.d.get(self.p + 1) == Some(&b'>') => {
                self.p += 2;
                Tok::DictEnd
            }
            b'/' => {
                self.p += 1;
                Tok::Operand(Operand::Name(self.name()))
            }
            b'[' => {
                self.p += 1;
                if self.depth >= MAX_NESTING {
                    return Tok::Operand(Operand::Other);
                }
                self.depth += 1;
                let mut items = Vec::new();
                loop {
                    match self.next() {
                        Tok::Operand(o) => items.push(o),
                        Tok::ArrayEnd | Tok::Eof => break,
                        // Keywords inside arrays (true/false/null or junk) hold their place.
                        Tok::Keyword(_) => items.push(Operand::Other),
                        Tok::DictEnd => {}
                    }
                }
                self.depth -= 1;
                Tok::Operand(Operand::Array(items))
            }
            b']' => {
                self.p += 1;
                Tok::ArrayEnd
            }
            b'+' | b'-' | b'.' | b'0'..=b'9' => {
                let s = self.p;
                self.p += 1;
                while self.p < self.d.len() && matches!(self.d[self.p], b'0'..=b'9' | b'.' | b'-' | b'+') {
                    self.p += 1;
                }
                let txt = std::str::from_utf8(&self.d[s..self.p]).unwrap_or("0");
                Tok::Operand(Operand::Num(parse_num(txt)))
            }
            _ => {
                let s = self.p;
                self.p += 1;
                if !is_delim(b) {
                    while self.p < self.d.len() && !is_ws(self.d[self.p]) && !is_delim(self.d[self.p]) {
                        self.p += 1;
                    }
                }
                Tok::Keyword(self.d[s..self.p].to_vec())
            }
        }
    }
}

fn parse_num(txt: &str) -> f64 {
    // Out-of-range numbers (e.g. 400 digits) would overflow to infinity in matrix products and
    // poison every position. No real page needs coordinates beyond a billion units.
    let finite = |v: f64| if v.is_finite() { v.clamp(-1e9, 1e9) } else { 0.0 };
    if let Ok(v) = txt.parse::<f64>() {
        return finite(v);
    }
    // Tolerate junk such as "--5" or "1.2.3" the way viewers do: read the longest valid prefix.
    let mut end = 0;
    let mut seen_dot = false;
    for (i, c) in txt.char_indices() {
        let ok = match c {
            '+' | '-' => i == 0,
            '.' if !seen_dot => {
                seen_dot = true;
                true
            }
            '0'..='9' => true,
            _ => false,
        };
        if !ok {
            break;
        }
        end = i + 1;
    }
    finite(txt[..end].parse::<f64>().unwrap_or(0.0))
}

/// Finds the end of inline image data that starts at `p` (just after `ID` and one whitespace).
/// Returns the position just past the closing `EI`.
fn inline_image_end(d: &[u8], p: usize) -> usize {
    let mut i = p;
    while i + 1 < d.len() {
        if d[i] == b'E' && d[i + 1] == b'I' && (i == p || is_ws(d[i - 1])) && (i + 2 >= d.len() || is_ws(d[i + 2])) {
            // Guard against "EI" inside binary data: what follows must look like content.
            let tail = &d[(i + 2).min(d.len())..(i + 12).min(d.len())];
            if tail.iter().all(|&b| b == b'\n' || b == b'\r' || b == b'\t' || (32..127).contains(&b)) {
                return i + 2;
            }
        }
        i += 1;
    }
    d.len()
}

/// Splits a content stream into operators. Never fails: unknown bytes are skipped.
pub fn parse(data: &[u8]) -> Vec<Op> {
    let mut lx = Lexer { d: data, p: 0, depth: 0 };
    let mut ops = Vec::new();
    let mut operands: Vec<Operand> = Vec::new();
    let mut start: Option<usize> = None;
    loop {
        lx.skip_ws();
        let tok_start = lx.p;
        match lx.next() {
            Tok::Eof => break,
            Tok::Operand(o) => {
                start.get_or_insert(tok_start);
                operands.push(o);
            }
            Tok::ArrayEnd | Tok::DictEnd => {}
            Tok::Keyword(k) => {
                if matches!(k.as_slice(), b"true" | b"false" | b"null") {
                    start.get_or_insert(tok_start);
                    operands.push(Operand::Other);
                    continue;
                }
                let s = start.take().unwrap_or(tok_start);
                if k == b"BI" {
                    // Inline image: skip the dictionary up to ID, then the raw data up to EI.
                    loop {
                        match lx.next() {
                            Tok::Keyword(k2) if k2 == b"ID" => break,
                            Tok::Eof => break,
                            _ => {}
                        }
                    }
                    let data_start = (lx.p + 1).min(data.len());
                    lx.p = inline_image_end(data, data_start);
                    ops.push(Op { name: k, operands: Vec::new(), start: s, end: lx.p });
                    operands.clear();
                    continue;
                }
                ops.push(Op { name: k, operands: std::mem::take(&mut operands), start: s, end: lx.p });
            }
        }
    }
    ops
}

/// Writes a number the short way PDF producers do (no exponent, at most 4 decimals).
pub fn fmt_num(v: f64) -> String {
    if !v.is_finite() {
        return "0".into();
    }
    let r = (v * 10000.0).round() / 10000.0;
    if r == r.trunc() && r.abs() < 1e15 {
        return format!("{}", r as i64);
    }
    let mut s = format!("{r:.4}");
    while s.ends_with('0') {
        s.pop();
    }
    if s.ends_with('.') {
        s.pop();
    }
    s
}

/// Writes a string operand. Literal form unless more than a quarter of it is binary.
pub fn fmt_string(bytes: &[u8], out: &mut Vec<u8>) {
    let binary = bytes.iter().filter(|&&b| !(32..127).contains(&b)).count();
    if binary * 4 > bytes.len() {
        out.push(b'<');
        for b in bytes {
            out.extend_from_slice(format!("{b:02X}").as_bytes());
        }
        out.push(b'>');
        return;
    }
    out.push(b'(');
    for &b in bytes {
        match b {
            b'(' | b')' | b'\\' => {
                out.push(b'\\');
                out.push(b);
            }
            b'\n' => out.extend_from_slice(b"\\n"),
            b'\r' => out.extend_from_slice(b"\\r"),
            32..=126 => out.push(b),
            _ => out.extend_from_slice(format!("\\{b:03o}").as_bytes()),
        }
    }
    out.push(b')');
}

/// Writes a name operand with `#xx` escapes where needed.
pub fn fmt_name(name: &[u8], out: &mut Vec<u8>) {
    out.push(b'/');
    for &b in name {
        if b <= 32 || b >= 127 || is_delim(b) || b == b'#' {
            out.extend_from_slice(format!("#{b:02X}").as_bytes());
        } else {
            out.push(b);
        }
    }
}

/// Writes an operand back out. `None` when it holds a value the parser did not keep
/// (booleans, null, past the nesting limit), so a rewrite would lose it.
pub fn fmt_operand(op: &Operand, out: &mut Vec<u8>) -> Option<()> {
    match op {
        Operand::Num(n) => out.extend_from_slice(fmt_num(*n).as_bytes()),
        Operand::Str(b) => fmt_string(b, out),
        Operand::Name(n) => fmt_name(n, out),
        Operand::Array(items) => {
            out.push(b'[');
            for (i, it) in items.iter().enumerate() {
                if i > 0 {
                    out.push(b' ');
                }
                fmt_operand(it, out)?;
            }
            out.push(b']');
        }
        Operand::Dict(entries) => {
            out.extend_from_slice(b"<<");
            for (k, v) in entries {
                fmt_name(k, out);
                out.push(b' ');
                fmt_operand(v, out)?;
            }
            out.extend_from_slice(b">>");
        }
        Operand::Other => return None,
    }
    Some(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spans_cover_operands_and_operator() {
        let src = b"q 1 0 0 1 72 720 cm\nBT /F1 12 Tf (Hi \\(x\\)) Tj [(a) -120 <4142>] TJ ET Q";
        let ops = parse(src);
        let names: Vec<_> = ops.iter().map(|o| String::from_utf8_lossy(&o.name).to_string()).collect();
        assert_eq!(names, ["q", "cm", "BT", "Tf", "Tj", "TJ", "ET", "Q"]);
        assert_eq!(&src[ops[1].start..ops[1].end], b"1 0 0 1 72 720 cm");
        assert_eq!(&src[ops[4].start..ops[4].end], b"(Hi \\(x\\)) Tj");
        assert_eq!(ops[4].operands[0], Operand::Str(b"Hi (x)".to_vec()));
        match &ops[5].operands[0] {
            Operand::Array(a) => {
                assert_eq!(a.len(), 3);
                assert_eq!(a[2], Operand::Str(b"AB".to_vec()));
            }
            _ => panic!(),
        }
    }

    #[test]
    fn inline_image_is_one_op() {
        let src = b"q BI /W 2 /H 1 /BPC 8 /CS /G ID \x00EI\xff EI Q (x) Tj";
        let ops = parse(src);
        let names: Vec<_> = ops.iter().map(|o| String::from_utf8_lossy(&o.name).to_string()).collect();
        assert_eq!(names, ["q", "BI", "Q", "Tj"]);
    }

    #[test]
    fn marked_content_dict_and_comments() {
        let ops = parse(b"/P <</MCID 0 /X [1 2]>> BDC % note (\n(a) Tj EMC");
        assert_eq!(ops.len(), 3);
        assert_eq!(ops[0].operands.len(), 2);
    }

    #[test]
    fn hostile_input_is_bounded() {
        let mut deep = vec![b'['; 300_000];
        deep.extend_from_slice(b" (x) Tj");
        // Unclosed arrays swallow the rest, as in viewers. What matters is that it returns.
        let _ = parse(&deep);
        let mut dicts = b"<<".repeat(100_000);
        dicts.extend_from_slice(b" Q");
        let _ = parse(&dicts);
        let big = format!("{} 0 Td", "9".repeat(400));
        assert_eq!(parse(big.as_bytes())[0].num(0), 0.0);
        assert_eq!(parse(b"2000000000000 0 Td")[0].num(0), 1e9);
    }

    #[test]
    fn number_and_string_formatting() {
        assert_eq!(fmt_num(12.0), "12");
        assert_eq!(fmt_num(-0.50004), "-0.5");
        assert_eq!(fmt_num(1.23456), "1.2346");
        let mut out = Vec::new();
        fmt_string(b"a(b)\\", &mut out);
        assert_eq!(out, b"(a\\(b\\)\\\\)");
        let mut out = Vec::new();
        fmt_string(&[0, 1, 0, 2], &mut out);
        assert_eq!(out, b"<00010002>");
    }
}
