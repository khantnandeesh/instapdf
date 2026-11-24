//! Browser bindings for the font matcher (see berry-fontmatch.d.ts for the interface).
//!
//! Plain typed arrays in and out, no serde: the module stays small and loads only when the
//! editor needs a match.

use berry_fontmatch as fm;
use js_sys::{Float32Array, Object, Reflect, Uint8Array};
use wasm_bindgen::prelude::*;

fn print_to_js(fp: &fm::Fingerprint) -> JsValue {
    let out = Object::new();
    let _ = Reflect::set(&out, &"coarse".into(), &Uint8Array::from(&fp.coarse[..]));
    let _ = Reflect::set(&out, &"glyphs".into(), &Uint8Array::from(fm::encode_signatures(&fp.glyphs).as_slice()));
    let _ = Reflect::set(&out, &"count".into(), &JsValue::from(fp.glyphs.len() as u32));
    out.into()
}

/// Fingerprint of a TrueType or OpenType file. `chars` adds characters beyond the Latin
/// letters and digits (e.g. a script's letters). Null when the bytes are not a font.
#[wasm_bindgen(js_name = fingerprintFile)]
pub fn fingerprint_file(bytes: &[u8], chars: Option<String>) -> JsValue {
    let Some(src) = fm::OpenTypeSource::parse(bytes) else { return JsValue::NULL };
    let all = format!("{}{}", fm::ALPHABET, chars.unwrap_or_default());
    print_to_js(&fm::fingerprint_chars(&src, &all))
}

/// Fingerprint of a font program embedded in a PDF, from the engine's fontProgram(): the three
/// arrays are parallel (character, glyph index, advance in 1/1000 em). Falls back to the widths
/// alone when the program cannot be read.
#[wasm_bindgen(js_name = fingerprintProgram)]
pub fn fingerprint_program(format: &str, bytes: &[u8], cps: &[u32], gids: &[u16], widths: &[f32]) -> JsValue {
    let glyphs: Vec<(char, u16, f32)> =
        cps.iter().zip(gids).zip(widths).filter_map(|((cp, gid), w)| Some((char::from_u32(*cp)?, *gid, *w))).collect();
    let print = fm::fingerprint_program(format, bytes, &glyphs).unwrap_or_else(|| {
        let widths: Vec<(char, f32)> = glyphs.iter().map(|g| (g.0, g.2)).collect();
        fm::fingerprint_widths(&widths)
    });
    print_to_js(&print)
}

/// The `top` faces of an index closest to `coarse`, best first, as [face, distance, face,
/// distance…]. `allow`, when given, has one byte a face: 0 leaves the face out.
#[wasm_bindgen]
pub fn rank(coarse: &[u8], index: &[u8], top: usize, allow: Option<Vec<u8>>) -> Float32Array {
    let ok = |i: usize| allow.as_ref().is_none_or(|a| a.get(i).copied().unwrap_or(0) != 0);
    let flat: Vec<f32> = fm::rank(coarse, index, top, &ok).into_iter().flat_map(|(i, d)| [i as f32, d]).collect();
    Float32Array::from(flat.as_slice())
}

/// Compares two fonts glyph by glyph (the `glyphs` bytes of two fingerprints) and grades the
/// match: [glyph distance or -1 when they share no character, characters compared, grade], with
/// grade 0 = exact, 1 = very close, 2 = close, 3 = loose.
#[wasm_bindgen]
pub fn compare(a: &[u8], b: &[u8], coarse_distance: f32) -> Float32Array {
    let d = fm::glyph_distance(&fm::decode_signatures(a), &fm::decode_signatures(b));
    let grade = match fm::closeness(d.map(|x| x.0), coarse_distance) {
        fm::Closeness::Exact => 0.0,
        fm::Closeness::VeryClose => 1.0,
        fm::Closeness::Close => 2.0,
        fm::Closeness::Loose => 3.0,
    };
    Float32Array::from(&[d.map(|x| x.0).unwrap_or(-1.0), d.map(|x| x.1 as f32).unwrap_or(0.0), grade][..])
}

/// Distance of two coarse vectors, 0 to 1, or -1 when they share too little to compare.
#[wasm_bindgen(js_name = coarseDistance)]
pub fn coarse_distance(a: &[u8], b: &[u8]) -> f32 {
    fm::coarse_distance(a, b).unwrap_or(-1.0)
}
