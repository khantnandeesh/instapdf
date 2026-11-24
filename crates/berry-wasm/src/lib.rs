//! JavaScript bindings. The typed interface is in `berry-engine.d.ts` next to this crate.
//! Every method returns plain objects; failures throw the engine's error object (`{ kind, … }`).

use berry_engine::fallback::FontRequest;
use berry_engine::Engine;
use serde::Serialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    let ser = serde_wasm_bindgen::Serializer::json_compatible();
    value.serialize(&ser).map_err(|e| JsValue::from_str(&e.to_string()))
}

fn fail(e: berry_engine::Error) -> JsValue {
    to_js(&e).unwrap_or_else(|e| e)
}

/// A bad argument throws like the engine does: `{ kind: "unsupported", reason }`.
fn bad(what: &str) -> JsValue {
    fail(berry_engine::Error::Unsupported { reason: format!("invalid {what}") })
}

/// `{ families: string[], bold?: boolean, italic?: boolean }`, read field by field (a serde
/// deserializer would add to the module size).
fn font_request(v: JsValue) -> Result<FontRequest, JsValue> {
    let get = |k: &str| js_sys::Reflect::get(&v, &k.into()).map_err(|_| bad("font"));
    let families = get("families")?.dyn_into::<js_sys::Array>().map_err(|_| bad("font.families"))?;
    let families = families.iter().map(|f| f.as_string().ok_or_else(|| bad("font.families"))).collect::<Result<_, _>>()?;
    Ok(FontRequest { families, bold: get("bold")?.is_truthy(), italic: get("italic")?.is_truthy() })
}

/// `[r, g, b]`, 0–255 each.
fn rgb(v: JsValue) -> Result<[u8; 3], JsValue> {
    let a = v.dyn_into::<js_sys::Array>().map_err(|_| bad("color"))?;
    if a.length() != 3 {
        return Err(bad("color"));
    }
    let mut out = [0u8; 3];
    for (i, c) in out.iter_mut().enumerate() {
        let x = a.get(i as u32).as_f64().ok_or_else(|| bad("color"))?;
        *c = if x.is_finite() { x.round().clamp(0.0, 255.0) as u8 } else { 0 };
    }
    Ok(out)
}

#[wasm_bindgen]
pub struct BerryDocument {
    engine: Engine,
}

#[wasm_bindgen]
impl BerryDocument {
    /// Opens a PDF from its bytes.
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8], password: Option<String>) -> Result<BerryDocument, JsValue> {
        Engine::open(bytes.to_vec(), password.as_deref()).map(|engine| BerryDocument { engine }).map_err(fail)
    }

    /// Objects numbered above this were made by this engine's own edits (a trust boundary).
    #[wasm_bindgen(js_name = madeAfter)]
    pub fn made_after(&self) -> u32 {
        self.engine.made_after()
    }

    /// Restores `madeAfter` after reopening the editor's own output; clamped to the document.
    #[wasm_bindgen(js_name = setMadeAfter)]
    pub fn set_made_after(&mut self, n: u32) {
        self.engine.set_made_after(n)
    }

    #[wasm_bindgen(getter, js_name = pageCount)]
    pub fn page_count(&self) -> usize {
        self.engine.page_count()
    }

    #[wasm_bindgen(js_name = pageText)]
    pub fn page_text(&mut self, page: usize) -> Result<JsValue, JsValue> {
        to_js(&self.engine.page_text(page).map_err(fail)?)
    }

    /// Every font in the document, once each.
    pub fn fonts(&mut self) -> Result<JsValue, JsValue> {
        to_js(&self.engine.fonts())
    }

    /// Which characters of `text` a font (by PDF object number) can draw.
    pub fn coverage(&mut self, font_object: u32, text: &str) -> Result<JsValue, JsValue> {
        to_js(&self.engine.coverage(font_object, text).map_err(fail)?)
    }

    pub fn find(&mut self, page: usize, needle: &str, match_case: bool) -> Result<JsValue, JsValue> {
        to_js(&self.engine.find(page, needle, match_case).map_err(fail)?)
    }

    #[wasm_bindgen(js_name = replaceLine)]
    pub fn replace_line(&mut self, page: usize, line: usize, text: &str) -> Result<JsValue, JsValue> {
        to_js(&self.engine.replace_line(page, line, text).map_err(fail)?)
    }

    #[wasm_bindgen(js_name = replaceRange)]
    pub fn replace_range(&mut self, page: usize, line: usize, start: usize, end: usize, text: &str) -> Result<JsValue, JsValue> {
        to_js(&self.engine.replace_range(page, line, start, end, text).map_err(fail)?)
    }

    /// How a complex-script line would look with `text` (nothing is changed): `{ paths, glyphs }`.
    #[wasm_bindgen(js_name = previewLine)]
    pub fn preview_line(&mut self, page: usize, line: usize, text: &str) -> Result<JsValue, JsValue> {
        #[cfg(feature = "shaping")]
        return to_js(&self.engine.preview_line(page, line, text).map_err(fail)?);
        #[cfg(not(feature = "shaping"))]
        {
            let _ = (page, line, text);
            Err(fail(berry_engine::Error::ReadOnly { reason: "needs-shaping".into() }))
        }
    }

    /// Lays out one line of new text with the registered fonts.
    pub fn shape(&mut self, text: &str, font: JsValue, size: f64) -> Result<JsValue, JsValue> {
        to_js(&self.engine.shape_text(text, &font_request(font)?, size).map_err(fail)?)
    }

    /// Draws one line of new text; `(x, y)` is the left end of its baseline.
    #[wasm_bindgen(js_name = addText)]
    #[allow(clippy::too_many_arguments)]
    pub fn add_text(
        &mut self,
        page: usize,
        text: &str,
        font: JsValue,
        size: f64,
        x: f64,
        y: f64,
        angle: f64,
        color: JsValue,
    ) -> Result<JsValue, JsValue> {
        let (font, color) = (font_request(font)?, rgb(color)?);
        to_js(&self.engine.add_text(page, text, &font, size, x, y, angle, color).map_err(fail)?)
    }

    #[wasm_bindgen(js_name = addFont)]
    pub fn add_font(&mut self, family: &str, bold: bool, italic: bool, bytes: &[u8]) -> bool {
        self.engine.add_font(family, bold, italic, bytes.to_vec())
    }

    /// Returns `{ bytes: Uint8Array, format, complete, glyphs }`.
    #[wasm_bindgen(js_name = fontProgram)]
    pub fn font_program(&mut self, font_object: u32, chars: &str) -> Result<JsValue, JsValue> {
        let program = self.engine.font_program(font_object, chars).map_err(fail)?;
        let out = to_js(&program)?;
        js_sys::Reflect::set(&out, &"bytes".into(), &js_sys::Uint8Array::from(program.bytes.as_slice()))?;
        Ok(out)
    }

    /// Returns `{ bytes: Uint8Array, report }`.
    pub fn save(&mut self) -> Result<JsValue, JsValue> {
        let (bytes, report) = self.engine.save().map_err(fail)?;
        let out = js_sys::Object::new();
        js_sys::Reflect::set(&out, &"bytes".into(), &js_sys::Uint8Array::from(bytes.as_slice()))?;
        js_sys::Reflect::set(&out, &"report".into(), &to_js(&report)?)?;
        Ok(out.into())
    }
}
