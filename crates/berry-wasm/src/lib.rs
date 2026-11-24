//! JavaScript bindings. The typed interface is in `berry-engine.d.ts` next to this crate.
//! Every method returns plain objects; failures throw the engine's error object (`{ kind, … }`).

use berry_engine::Engine;
use serde::Serialize;
use wasm_bindgen::prelude::*;

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    let ser = serde_wasm_bindgen::Serializer::json_compatible();
    value.serialize(&ser).map_err(|e| JsValue::from_str(&e.to_string()))
}

fn fail(e: berry_engine::Error) -> JsValue {
    to_js(&e).unwrap_or_else(|e| e)
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

    #[wasm_bindgen(getter, js_name = pageCount)]
    pub fn page_count(&self) -> usize {
        self.engine.page_count()
    }

    #[wasm_bindgen(js_name = pageText)]
    pub fn page_text(&mut self, page: usize) -> Result<JsValue, JsValue> {
        to_js(&self.engine.page_text(page).map_err(fail)?)
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

    #[wasm_bindgen(js_name = addFont)]
    pub fn add_font(&mut self, family: &str, bold: bool, italic: bool, bytes: &[u8]) -> bool {
        self.engine.add_font(family, bold, italic, bytes.to_vec())
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
