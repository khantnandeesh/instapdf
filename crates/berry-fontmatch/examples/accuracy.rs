//! Matcher accuracy on a folder of font files (AC-284).
//!
//!   cargo run --release -p berry-fontmatch --example accuracy -- <dir> [letters-kept] [second-pass size]
//!
//! Every font is fingerprinted whole to build the index. Then each is measured again as a subset
//! would show it (a pseudo-random choice of letters, the file name hidden) and matched back.
//! Prints how often the true face (or one with identical outlines) is ranked first after the coarse pass and after the glyph pass.

use berry_fontmatch::*;

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dir = args.get(1).expect("usage: accuracy <dir> [letters-kept] [second-pass size]");
    let keep_n: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(24);
    let top_n: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(50);
    let mut names: Vec<String> =
        std::fs::read_dir(dir).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    let mut faces: Vec<(String, Vec<u8>, Fingerprint)> = Vec::new();
    for n in names {
        let bytes = std::fs::read(format!("{dir}/{n}")).unwrap();
        if let Some(fp) = fingerprint_bytes(&bytes) {
            if fp.glyphs.len() >= 40 {
                faces.push((n, bytes, fp));
            }
        }
    }
    let index: Vec<u8> = faces.iter().flat_map(|f| f.2.coarse).collect();
    let (mut coarse_first, mut coarse_top20, mut final_first, mut family_first) = (0, 0, 0, 0);
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut misses = Vec::new();
    for (i, (name, bytes, _)) in faces.iter().enumerate() {
        let mut letters: Vec<char> = ALPHABET.chars().collect();
        for k in (1..letters.len()).rev() {
            letters.swap(k, (rng.next() % (k as u64 + 1)) as usize);
        }
        letters.truncate(keep_n);
        let src = OpenTypeSource::parse(bytes).unwrap();
        let target = fingerprint_with(&src, &|c| letters.contains(&c));
        let top = rank(&target.coarse, &index, top_n, &|_| true);
        if top.first().map(|t| t.0) == Some(i) {
            coarse_first += 1;
        }
        if top.iter().any(|t| t.0 == i) {
            coarse_top20 += 1;
        }
        let mut second: Vec<(usize, f32)> = top
            .iter()
            .map(|(j, d)| (*j, glyph_distance(&target.glyphs, &faces[*j].2.glyphs).map(|g| g.0).unwrap_or(1.0) + 0.25 * d))
            .collect();
        second.sort_by(|a, b| a.1.total_cmp(&b.1));
        let Some(&(best, best_score)) = second.first() else {
            misses.push(format!("{name} -> (too few letters to compare)"));
            continue;
        };
        // A different face with the very same outlines (a sibling family sharing its Latin) is
        // as good as the true one: nobody can see the difference.
        let own = second.iter().find(|s| s.0 == i).map(|s| s.1);
        if best == i || own.is_some_and(|o| o - best_score < 1e-6) {
            final_first += 1;
        } else {
            misses.push(format!("{name} -> {}", faces[best].0));
        }
        let family = |n: &str| n.split("__").next().unwrap_or("").to_string();
        if family(&faces[best].0) == family(name) {
            family_first += 1;
        }
    }
    let n = faces.len();
    let pct = |k: usize| 100.0 * k as f32 / n as f32;
    println!("faces {n}, letters kept {keep_n}");
    println!("coarse pass: first {:.1}%, in top N {:.1}%", pct(coarse_first), pct(coarse_top20));
    println!("after glyph pass: face first {:.1}%, family first {:.1}%", pct(final_first), pct(family_first));
    for m in misses.iter().take(25) {
        println!("  miss: {m}");
    }
}
