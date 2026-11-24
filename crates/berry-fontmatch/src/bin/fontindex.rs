//! Builds the matching index of the font library from font files.
//!
//!   fontindex <manifest.tsv> <out-dir>
//!
//! The manifest has one face a line: `<face id>\t<path to a TrueType or OpenType file>`. Writes
//! `features.bin` (one coarse vector a face, in manifest order), `faces.txt` (the face ids in
//! that order, with the number of characters measured) and `sig/<face id>.bin` (glyph
//! signatures). Faces that cannot be read are listed on stderr and left out.

use berry_fontmatch::{encode_signatures, fingerprint_bytes};
use std::io::Write;

fn main() -> std::io::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let (Some(manifest), Some(out)) = (args.get(1), args.get(2)) else {
        eprintln!("usage: fontindex <manifest.tsv> <out-dir>");
        std::process::exit(2);
    };
    std::fs::create_dir_all(format!("{out}/sig"))?;
    let mut features = Vec::new();
    let mut faces = String::new();
    let (mut kept, mut skipped) = (0usize, 0usize);
    for line in std::fs::read_to_string(manifest)?.lines() {
        let Some((id, path)) = line.split_once('\t') else { continue };
        // Ids become file names: letters, digits, '-' and '_' only.
        if id.is_empty() || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
            eprintln!("skip (bad id): {id}");
            skipped += 1;
            continue;
        }
        let print = std::fs::read(path).ok().and_then(|bytes| fingerprint_bytes(&bytes));
        // A face with no Latin letters or digits has nothing this index can compare.
        let Some(fp) = print.filter(|fp| !fp.glyphs.is_empty()) else {
            eprintln!("skip (unreadable or no letters): {id}");
            skipped += 1;
            continue;
        };
        features.extend_from_slice(&fp.coarse);
        faces.push_str(&format!("{id}\t{}\n", fp.glyphs.len()));
        std::fs::write(format!("{out}/sig/{id}.bin"), encode_signatures(&fp.glyphs))?;
        kept += 1;
    }
    std::fs::write(format!("{out}/features.bin"), &features)?;
    std::fs::write(format!("{out}/faces.txt"), faces)?;
    writeln!(std::io::stdout(), "{kept} faces indexed, {skipped} skipped, features.bin {} bytes", features.len())
}
