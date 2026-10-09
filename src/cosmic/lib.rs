//! Native side of `bun:cosmic`: COSMIC's text stack (cosmic-text: font discovery, shaping, layout and
//! rasterization) and the freedesktop application index (freedesktop-desktop-entry).
//!
//! This crate has no JavaScriptCore dependency; `src/runtime/cosmic/` turns its results into JS values.
//! Results that are trees are returned as JSON bytes, which `src/js/bun/cosmic.ts` parses. Outside
//! Linux every entry point returns [`Error::Unsupported`].
//!
//! Nothing runs before the first call: the font database is scanned on the first text call and then
//! kept for the life of the process.

#[cfg(target_os = "linux")]
mod apps;
#[cfg(any(target_os = "linux", test))]
mod json;
#[cfg(target_os = "linux")]
mod text;

/// Why a call failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    /// Not built for Linux.
    Unsupported,
    /// The bytes passed to [`load_font`] hold no font face.
    InvalidFont,
    /// The requested or computed image is empty or larger than [`MAX_IMAGE_SIDE`].
    ImageSize,
}

impl Error {
    pub fn message(self) -> &'static str {
        match self {
            Error::Unsupported => "bun:cosmic is only available on Linux",
            Error::InvalidFont => "no font face found in the given data",
            Error::ImageSize => "image width and height must be between 1 and 16384",
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Error::Unsupported => "ERR_BUN_COSMIC_UNSUPPORTED",
            Error::InvalidFont => "ERR_BUN_COSMIC_INVALID_FONT",
            Error::ImageSize => "ERR_OUT_OF_RANGE",
        }
    }
}

/// Largest rendered image side, in pixels.
pub const MAX_IMAGE_SIDE: u32 = 16384;

/// One text request. Colors are `0xRRGGBBAA`.
#[derive(Debug, Clone, Copy)]
pub struct TextOptions<'a> {
    pub text: &'a str,
    /// Font size in pixels.
    pub font_size: f32,
    /// Line height in pixels.
    pub line_height: f32,
    /// Wrapping width; `None` lays every paragraph out on one line.
    pub width: Option<f32>,
    /// Visible height; lines below it are not laid out. `None` is unbounded.
    pub height: Option<f32>,
    /// A family name, or one of the generic `sans-serif`, `serif`, `monospace`, `cursive`, `fantasy`.
    pub family: &'a str,
    /// CSS weight, 1 to 1000.
    pub weight: u16,
    pub italic: bool,
    /// 0 none, 1 glyph, 2 word, 3 word then glyph.
    pub wrap: u8,
    /// 0 natural, 1 left, 2 right, 3 center, 4 justified, 5 end.
    pub align: u8,
    pub color: u32,
}

/// A straight (not premultiplied) RGBA8 image, rows top to bottom.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Image {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

/// Lay `options.text` out. JSON: `{ width, height, lines: [{ line, rtl, top, baseline, height, width,
/// glyphs: [{ start, end, x, y, width, fontSize, glyph, font }] }] }`, byte offsets into the
/// paragraph (`line`) the glyph belongs to.
pub fn layout(options: &TextOptions<'_>) -> Result<Vec<u8>, Error> {
    #[cfg(target_os = "linux")]
    {
        Ok(text::layout(options))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = options;
        Err(Error::Unsupported)
    }
}

/// Rasterize `options.text` over `background`. A missing `width`/`height` is the laid-out size.
pub fn render(
    options: &TextOptions<'_>,
    width: Option<u32>,
    height: Option<u32>,
    background: u32,
) -> Result<Image, Error> {
    #[cfg(target_os = "linux")]
    {
        text::render(options, width, height, background)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (options, width, height, background);
        Err(Error::Unsupported)
    }
}

/// Add a font file (TTF, OTF or collection) to the font database. JSON: the family names it added.
pub fn load_font(data: Vec<u8>) -> Result<Vec<u8>, Error> {
    #[cfg(target_os = "linux")]
    {
        text::load_font(data)
    }
    #[cfg(not(target_os = "linux"))]
    {
        drop(data);
        Err(Error::Unsupported)
    }
}

/// Every face of the font database. JSON: `[{ family, postscriptName, weight, style, monospaced }]`.
pub fn fonts() -> Result<Vec<u8>, Error> {
    #[cfg(target_os = "linux")]
    {
        Ok(text::fonts())
    }
    #[cfg(not(target_os = "linux"))]
    {
        Err(Error::Unsupported)
    }
}

/// `.desktop` files below `dirs` (the `applications` directories of the XDG data dirs, in priority
/// order); the first definition of an id wins. Localized keys use `locales` (`fr_FR`, `fr`, …).
/// JSON: `[{ id, path, type, name, genericName, comment, icon, exec, tryExec, workingDirectory,
/// terminal, noDisplay, hidden, dbusActivatable, startupWMClass, categories, keywords, mimeTypes,
/// onlyShowIn, notShowIn, actions }]`.
///
/// `freedesktop_desktop_entry::default_paths()` is not used: it panics without a home directory.
pub fn desktop_entries(
    dirs: Vec<std::path::PathBuf>,
    locales: &[String],
) -> Result<Vec<u8>, Error> {
    #[cfg(target_os = "linux")]
    {
        Ok(apps::desktop_entries(dirs, locales))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (dirs, locales);
        Err(Error::Unsupported)
    }
}

#[cfg(test)]
mod tests {
    use super::json::Json;

    #[test]
    fn json_escapes_strings() {
        let mut j = Json::default();
        j.string("a\"b\\c\nd\u{1}é");
        assert_eq!(j.finish(), b"\"a\\\"b\\\\c\\nd\\u0001\xc3\xa9\"".to_vec());
    }

    #[test]
    fn json_numbers_are_finite() {
        let mut j = Json::default();
        j.begin_array();
        j.number(1.5);
        j.number(f64::NAN);
        j.number(3.0);
        j.end_array();
        assert_eq!(j.finish(), b"[1.5,0,3]".to_vec());
    }
}
