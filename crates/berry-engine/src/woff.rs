//! WOFF 1.0 to a plain TrueType/OpenType file, so web fonts (fontsource and similar) can be
//! registered as they are served. Each table is stored as is or zlib-compressed.

use std::io::Read;

/// Largest unpacked font accepted (the subset embedder holds it in memory).
const MAX_SFNT: usize = 64 << 20;

fn be16(d: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes(d.get(at..at + 2)?.try_into().ok()?))
}

fn be32(d: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(d.get(at..at + 4)?.try_into().ok()?))
}

/// The sfnt inside a WOFF 1.0 file, or `None` when it is not one or is damaged.
pub fn unpack(woff: &[u8]) -> Option<Vec<u8>> {
    if woff.get(0..4)? != b"wOFF" {
        return None;
    }
    let flavor = be32(woff, 4)?;
    let num = be16(woff, 12)? as usize;
    let total = be32(woff, 16)? as usize;
    if num == 0 || num > 512 || total > MAX_SFNT {
        return None;
    }
    let mut tables: Vec<([u8; 4], Vec<u8>, u32)> = Vec::with_capacity(num);
    for i in 0..num {
        let e = 44 + 20 * i;
        let tag: [u8; 4] = woff.get(e..e + 4)?.try_into().ok()?;
        let (off, comp, orig, sum) =
            (be32(woff, e + 4)? as usize, be32(woff, e + 8)? as usize, be32(woff, e + 12)? as usize, be32(woff, e + 16)?);
        if orig > MAX_SFNT || comp > orig {
            return None;
        }
        let raw = woff.get(off..off.checked_add(comp)?)?;
        let data = if comp == orig {
            raw.to_vec()
        } else {
            let mut out = Vec::with_capacity(orig);
            flate2::read::ZlibDecoder::new(raw).take(orig as u64 + 1).read_to_end(&mut out).ok()?;
            if out.len() != orig {
                return None;
            }
            out
        };
        tables.push((tag, data, sum));
    }
    tables.sort_by_key(|t| t.0);
    // Offset table and directory, then the tables on 4-byte boundaries.
    let mut out = Vec::with_capacity(total.max(12 + 16 * num));
    let pow = (num as u32 + 1).next_power_of_two() / 2;
    let pow = pow.max(1);
    let search = pow * 16;
    out.extend_from_slice(&flavor.to_be_bytes());
    out.extend_from_slice(&(num as u16).to_be_bytes());
    out.extend_from_slice(&(search as u16).to_be_bytes());
    out.extend_from_slice(&(pow.trailing_zeros() as u16).to_be_bytes());
    out.extend_from_slice(&((num as u32 * 16).saturating_sub(search) as u16).to_be_bytes());
    let mut offset = 12 + 16 * num;
    for (tag, data, sum) in &tables {
        out.extend_from_slice(tag);
        out.extend_from_slice(&sum.to_be_bytes());
        out.extend_from_slice(&(offset as u32).to_be_bytes());
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        offset += data.len().div_ceil(4) * 4;
    }
    for (_, data, _) in &tables {
        out.extend_from_slice(data);
        out.resize(out.len().div_ceil(4) * 4, 0);
    }
    (out.len() <= MAX_SFNT).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_woff_and_truncated_input() {
        assert!(unpack(b"OTTO").is_none());
        assert!(unpack(b"wOFF\0\x01\0\0").is_none());
        let mut head = b"wOFF".to_vec();
        head.resize(44, 0);
        head[13] = 1; // one table, no directory
        assert!(unpack(&head).is_none());
    }
}
