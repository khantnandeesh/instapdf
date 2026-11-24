pub mod addtext;
#[cfg(feature = "shaping")]
mod complex;
pub mod content;
pub mod engine;
pub mod fallback;
pub mod font;
pub mod geom;
pub mod interp;
pub mod layout;
pub mod script;
mod script_tables;
// Only right-to-left text has mirrored glyphs, which need the cmap it writes.
#[cfg(feature = "shaping")]
mod sfnt;
pub mod shape;
mod tables;
mod woff;
#[cfg(feature = "shaping")]
pub use complex::{LinePreview, PreviewGlyph};
pub use engine::{Coverage, EditResult, Engine, Error, Match, PageText, SaveReport};
