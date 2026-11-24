//! Adds a small Unicode `cmap` to a subset font. The subsetter drops the cmap, but readers use
//! it to tell a mirrored bracket glyph from the bracket its ToUnicode names (see
//! `PdfFont::program_maps`), so the embedded subsets of registered faces carry one for the
//! characters their glyphs draw.

fn be16(d: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes(d.get(at..at + 2)?.try_into().ok()?))
}

fn be32(d: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(d.get(at..at + 4)?.try_into().ok()?))
}

fn checksum(data: &[u8]) -> u32 {
    data.chunks(4).fold(0u32, |sum, c| {
        let mut w = [0u8; 4];
        w[..c.len()].copy_from_slice(c);
        sum.wrapping_add(u32::from_be_bytes(w))
    })
}

/// A format 4 cmap (Windows Unicode BMP) mapping each character to its glyph.
fn cmap_table(map: &[(u16, u16)]) -> Vec<u8> {
    let mut pairs: Vec<(u16, u16)> = map.iter().copied().filter(|&(c, _)| c != 0xFFFF).collect();
    pairs.sort_unstable();
    pairs.dedup_by_key(|p| p.0);
    // One segment per character keeps it simple: the map holds a few hundred at most.
    let seg_count = pairs.len() + 1;
    let mut ends = Vec::new();
    let mut starts = Vec::new();
    let mut deltas = Vec::new();
    for &(c, g) in &pairs {
        ends.push(c);
        starts.push(c);
        deltas.push(g.wrapping_sub(c));
    }
    ends.push(0xFFFF);
    starts.push(0xFFFF);
    deltas.push(1);
    let pow = (seg_count as u32).next_power_of_two() / if (seg_count as u32).is_power_of_two() { 1 } else { 2 };
    let search = 2 * pow;
    let mut sub = Vec::new();
    let len = 16 + 8 * seg_count;
    for v in [4u16, len as u16, 0, (2 * seg_count) as u16, search as u16, pow.trailing_zeros() as u16] {
        sub.extend_from_slice(&v.to_be_bytes());
    }
    sub.extend_from_slice(&((2 * seg_count) as u16).wrapping_sub(search as u16).to_be_bytes());
    ends.iter().for_each(|v| sub.extend_from_slice(&v.to_be_bytes()));
    sub.extend_from_slice(&0u16.to_be_bytes());
    starts.iter().for_each(|v| sub.extend_from_slice(&v.to_be_bytes()));
    deltas.iter().for_each(|v| sub.extend_from_slice(&v.to_be_bytes()));
    (0..seg_count).for_each(|_| sub.extend_from_slice(&0u16.to_be_bytes()));
    let mut out = Vec::with_capacity(12 + sub.len());
    for v in [0u16, 1, 3, 1] {
        out.extend_from_slice(&v.to_be_bytes());
    }
    out.extend_from_slice(&12u32.to_be_bytes());
    out.extend(sub);
    out
}

/// The font with its `cmap` table replaced by one for `map` (character, glyph id), or `None`
/// when the font cannot be read or `map` has nothing in the BMP.
pub fn with_cmap(font: &[u8], map: &[(char, u16)]) -> Option<Vec<u8>> {
    let bmp: Vec<(u16, u16)> = map.iter().filter_map(|&(c, g)| u16::try_from(c as u32).ok().map(|c| (c, g))).collect();
    if bmp.is_empty() {
        return None;
    }
    let flavor = be32(font, 0)?;
    let num = be16(font, 4)? as usize;
    let mut tables: Vec<([u8; 4], Vec<u8>)> = Vec::with_capacity(num + 1);
    for i in 0..num {
        let e = 12 + 16 * i;
        let tag: [u8; 4] = font.get(e..e + 4)?.try_into().ok()?;
        let (off, len) = (be32(font, e + 8)? as usize, be32(font, e + 12)? as usize);
        if &tag != b"cmap" {
            tables.push((tag, font.get(off..off.checked_add(len)?)?.to_vec()));
        }
    }
    tables.push((*b"cmap", cmap_table(&bmp)));
    tables.sort_by_key(|t| t.0);
    let n = tables.len() as u32;
    let pow = if n.is_power_of_two() { n } else { n.next_power_of_two() / 2 };
    let search = pow * 16;
    let mut out = Vec::new();
    out.extend_from_slice(&flavor.to_be_bytes());
    for v in [n as u16, search as u16, pow.trailing_zeros() as u16, (n * 16 - search) as u16] {
        out.extend_from_slice(&v.to_be_bytes());
    }
    let mut offset = 12 + 16 * tables.len();
    let mut head_at = None;
    for (tag, data) in &tables {
        // head's checkSumAdjustment is left out of its own checksum.
        let mut sum_data = data.clone();
        if tag == b"head" && sum_data.len() >= 12 {
            sum_data[8..12].fill(0);
            head_at = Some(offset);
        }
        out.extend_from_slice(tag);
        out.extend_from_slice(&checksum(&sum_data).to_be_bytes());
        out.extend_from_slice(&(offset as u32).to_be_bytes());
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        offset += data.len().div_ceil(4) * 4;
    }
    for (tag, data) in &tables {
        let start = out.len();
        out.extend_from_slice(data);
        if tag == b"head" && data.len() >= 12 {
            out[start + 8..start + 12].fill(0);
        }
        out.resize(out.len().div_ceil(4) * 4, 0);
    }
    if let Some(h) = head_at {
        let adjust = 0xB1B0_AFBAu32.wrapping_sub(checksum(&out));
        out[h + 8..h + 12].copy_from_slice(&adjust.to_be_bytes());
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cmap_reads_back() {
        let data =
            std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/parity/editor/fonts/NotoNaskhArabic-Regular.ttf"))
                .unwrap();
        let out = with_cmap(&data, &[('«', 7), ('»', 9), ('a', 3), ('😀', 5)]).unwrap();
        let f = ttf_parser::Face::parse(&out, 0).unwrap();
        assert_eq!(f.glyph_index('«').map(|g| g.0), Some(7));
        assert_eq!(f.glyph_index('»').map(|g| g.0), Some(9));
        assert_eq!(f.glyph_index('a').map(|g| g.0), Some(3));
        assert_eq!(f.glyph_index('b'), None);
        assert_eq!(f.number_of_glyphs(), ttf_parser::Face::parse(&data, 0).unwrap().number_of_glyphs());
        assert_eq!(checksum(&out), 0xB1B0_AFBA);
    }
}
