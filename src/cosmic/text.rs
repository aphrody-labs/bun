//! cosmic-text: one process-wide `FontSystem`, created on first use.

use std::sync::{Mutex, PoisonError};

use cosmic_text::{
    Align, Attrs, Buffer, Color, Family, FontSystem, Metrics, Shaping, Style, SwashCache, Weight,
    Wrap, fontdb,
};

use crate::json::Json;
use crate::{Error, Image, MAX_IMAGE_SIDE, TextOptions};

/// Scanning the system fonts (fontconfig files, then every font file) is the expensive part, so it
/// happens once, on the first call that needs it.
static FONT_SYSTEM: Mutex<Option<FontSystem>> = Mutex::new(None);

fn with_font_system<R>(f: impl FnOnce(&mut FontSystem) -> R) -> R {
    let mut guard = FONT_SYSTEM.lock().unwrap_or_else(PoisonError::into_inner);
    f(guard.get_or_insert_with(FontSystem::new))
}

fn family(name: &str) -> Family<'_> {
    match name {
        "" | "sans-serif" => Family::SansSerif,
        "serif" => Family::Serif,
        "monospace" => Family::Monospace,
        "cursive" => Family::Cursive,
        "fantasy" => Family::Fantasy,
        other => Family::Name(other),
    }
}

fn wrap(mode: u8) -> Wrap {
    match mode {
        0 => Wrap::None,
        1 => Wrap::Glyph,
        2 => Wrap::Word,
        _ => Wrap::WordOrGlyph,
    }
}

fn align(mode: u8) -> Option<Align> {
    match mode {
        1 => Some(Align::Left),
        2 => Some(Align::Right),
        3 => Some(Align::Center),
        4 => Some(Align::Justified),
        5 => Some(Align::End),
        _ => None,
    }
}

fn color(rgba: u32) -> Color {
    let [r, g, b, a] = rgba.to_be_bytes();
    Color::rgba(r, g, b, a)
}

fn shaped(font_system: &mut FontSystem, o: &TextOptions<'_>) -> Buffer {
    let mut buffer = Buffer::new(font_system, Metrics::new(o.font_size, o.line_height));
    buffer.set_size(o.width, o.height);
    buffer.set_wrap(wrap(o.wrap));
    let attrs = Attrs::new()
        .family(family(o.family))
        .weight(Weight(o.weight.clamp(1, 1000)))
        .style(if o.italic {
            Style::Italic
        } else {
            Style::Normal
        });
    buffer.set_text(o.text, &attrs, Shaping::Advanced, align(o.align));
    buffer.shape_until_scroll(font_system, false);
    buffer
}

/// `(width, height)` of the laid-out text.
fn extent(buffer: &Buffer) -> (f32, f32) {
    let mut width = 0.0f32;
    let mut height = 0.0f32;
    for run in buffer.layout_runs() {
        width = width.max(run.line_w);
        height = height.max(run.line_top + run.line_height);
    }
    (width, height)
}

fn face_family(db: &fontdb::Database, id: fontdb::ID) -> Option<&str> {
    db.face(id)?.families.first().map(|(name, _)| name.as_str())
}

pub(crate) fn layout(o: &TextOptions<'_>) -> Vec<u8> {
    with_font_system(|font_system| {
        let buffer = shaped(font_system, o);
        let (width, height) = extent(&buffer);
        let db = font_system.db();
        let mut j = Json::default();
        j.begin_object();
        j.key("width");
        j.float(width);
        j.key("height");
        j.float(height);
        j.key("lines");
        j.begin_array();
        for run in buffer.layout_runs() {
            j.begin_object();
            j.key("line");
            j.number(run.line_i as f64);
            j.key("rtl");
            j.bool(run.rtl);
            j.key("top");
            j.float(run.line_top);
            j.key("baseline");
            j.float(run.line_y);
            j.key("height");
            j.float(run.line_height);
            j.key("width");
            j.float(run.line_w);
            j.key("glyphs");
            j.begin_array();
            for g in run.glyphs {
                j.begin_object();
                j.key("start");
                j.number(g.start as f64);
                j.key("end");
                j.number(g.end as f64);
                j.key("x");
                j.float(g.x);
                j.key("y");
                j.float(g.y);
                j.key("width");
                j.float(g.w);
                j.key("fontSize");
                j.float(g.font_size);
                j.key("glyph");
                j.number(f64::from(g.glyph_id));
                j.key("font");
                j.opt_string(face_family(db, g.font_id));
                j.end_object();
            }
            j.end_array();
            j.end_object();
        }
        j.end_array();
        j.end_object();
        j.finish()
    })
}

/// Source-over blend of a straight-alpha color into a straight-alpha pixel.
fn blend(dst: &mut [u8], src: Color) {
    let sa = f32::from(src.a()) / 255.0;
    if sa <= 0.0 {
        return;
    }
    let da = f32::from(dst[3]) / 255.0;
    let out_a = sa + da * (1.0 - sa);
    let channel = |s: u8, d: u8| -> u8 {
        let v = (f32::from(s) * sa + f32::from(d) * da * (1.0 - sa)) / out_a;
        v.round().clamp(0.0, 255.0) as u8
    };
    dst[0] = channel(src.r(), dst[0]);
    dst[1] = channel(src.g(), dst[1]);
    dst[2] = channel(src.b(), dst[2]);
    dst[3] = (out_a * 255.0).round().clamp(0.0, 255.0) as u8;
}

pub(crate) fn render(
    o: &TextOptions<'_>,
    width: Option<u32>,
    height: Option<u32>,
    background: u32,
) -> Result<Image, Error> {
    with_font_system(|font_system| {
        let mut buffer = shaped(font_system, o);
        let (text_w, text_h) = extent(&buffer);
        let w = width.unwrap_or(text_w.ceil() as u32);
        let h = height.unwrap_or(text_h.ceil() as u32);
        if w == 0 || h == 0 || w > MAX_IMAGE_SIDE || h > MAX_IMAGE_SIDE {
            return Err(Error::ImageSize);
        }
        let mut rgba = Vec::with_capacity(w as usize * h as usize * 4);
        let bg = background.to_be_bytes();
        for _ in 0..(w as usize * h as usize) {
            rgba.extend_from_slice(&bg);
        }
        let stride = w as usize * 4;
        let mut cache = SwashCache::new();
        buffer.draw(
            font_system,
            &mut cache,
            color(o.color),
            |x, y, rw, rh, c| {
                let x0 = x.max(0) as u32;
                let y0 = y.max(0) as u32;
                let x1 = (i64::from(x) + i64::from(rw)).clamp(0, i64::from(w)) as u32;
                let y1 = (i64::from(y) + i64::from(rh)).clamp(0, i64::from(h)) as u32;
                for py in y0..y1 {
                    let row = py as usize * stride;
                    for px in x0..x1 {
                        let i = row + px as usize * 4;
                        blend(&mut rgba[i..i + 4], c);
                    }
                }
            },
        );
        Ok(Image {
            width: w,
            height: h,
            rgba,
        })
    })
}

pub(crate) fn load_font(data: Vec<u8>) -> Result<Vec<u8>, Error> {
    with_font_system(|font_system| {
        let before = font_system.db().len();
        font_system.db_mut().load_font_data(data);
        let db = font_system.db();
        if db.len() == before {
            return Err(Error::InvalidFont);
        }
        let mut names: Vec<&str> = Vec::new();
        for face in db.faces().skip(before) {
            if let Some((name, _)) = face.families.first() {
                if !names.contains(&name.as_str()) {
                    names.push(name);
                }
            }
        }
        let mut j = Json::default();
        j.strings(names);
        Ok(j.finish())
    })
}

pub(crate) fn fonts() -> Vec<u8> {
    with_font_system(|font_system| {
        let mut j = Json::default();
        j.begin_array();
        for face in font_system.db().faces() {
            j.begin_object();
            j.key("family");
            j.opt_string(face.families.first().map(|(name, _)| name.as_str()));
            j.key("postscriptName");
            j.string(&face.post_script_name);
            j.key("weight");
            j.number(f64::from(face.weight.0));
            j.key("style");
            j.string(match face.style {
                Style::Normal => "normal",
                Style::Italic => "italic",
                Style::Oblique => "oblique",
            });
            j.key("monospaced");
            j.bool(face.monospaced);
            j.end_object();
        }
        j.end_array();
        j.finish()
    })
}
