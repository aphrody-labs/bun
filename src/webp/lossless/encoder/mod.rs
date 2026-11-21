//! Pixels to VP8L, as libwebp does it.

mod analysis;
mod bit_writer;
mod cache;
mod cheapest;
mod copies;
mod cross_color;
mod entropy;
mod groups;
mod histogram;
mod huffman;
mod image;
mod matches;
mod near_lossless;
mod palette;
mod predictor;
mod prefix;
mod residuals;
mod tiles;

use self::analysis::Transforms;
use self::bit_writer::BitWriter;
use self::palette::{Colors, Palette};
use self::predictor::HiddenColors;
use super::{
    Argb, IMAGE_SIZE_BITS, MIN_TILE_BITS, SIGNATURE, TransformType, VERSION_BITS, bundle_bits,
};
use crate::array::At;
use crate::error::{Error, Result};
use crate::vec;

/// How hard to try, from 0 to 100: libwebp's `WebPConfig::quality` of a lossless image.
#[derive(Clone, Copy, PartialEq, Eq)]
struct Quality(u8);

impl Quality {
    // https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/vp8l_enc.c#L1466
    const PALETTE: Self = Self(20);
    // https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/alpha_enc.c#L86
    const ALPHA: Self = Self(32);
    // https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/picture_enc.c#L290
    const PICTURE: Self = Self(70);

    const fn get(self) -> u32 {
        self.0 as u32
    }
}

/// What `WebPConfig` says about the lossless encoder.
#[derive(Clone, Copy)]
pub(crate) struct Params {
    /// 0 to 6.
    pub(crate) method: u8,
    /// 0 to 100.
    pub(crate) quality: u8,
    /// 0 to 100, which is off.
    pub(crate) near_lossless: u8,
    /// Whether to keep the color of fully transparent pixels.
    pub(crate) exact: bool,
}

impl Params {
    /// `WebPEncodeLosslessRGBA()`.
    pub(crate) const DEFAULT: Self = Self {
        method: 4,
        quality: Quality::PICTURE.0,
        near_lossless: 100,
        exact: false,
    };

    /// Whether to try each set of transforms, which takes the longest.
    // https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/vp8l_enc.c#L355
    const fn tries_all_transforms(self) -> bool {
        self.method == 6 && self.quality == 100
    }

    /// Whether to see what comes of not having a color cache.
    // https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/vp8l_enc.c#L395
    const fn tries_no_cache(self) -> bool {
        self.tries_all_transforms() || (self.method == 5 && self.quality >= 75)
    }
}

/// Each channel modulo 256.
#[inline(always)]
const fn sub(a: Argb, b: Argb) -> Argb {
    let alpha_green = (a | 0x00ff_00ff).wrapping_sub(b & 0xff00_ff00);
    let red_blue = (a | 0xff00_ff00).wrapping_sub(b & 0x00ff_00ff);
    (alpha_green & 0xff00_ff00) | (red_blue & 0x00ff_00ff)
}

/// The payload of a `VP8L` chunk.
// Out of line, so that the lossy encoder does not run on top of its stack frame.
#[inline(never)]
pub(crate) fn encode(
    rgba: &[[u8; 4]],
    width: usize,
    height: usize,
    has_alpha: bool,
    params: Params,
) -> Result<Vec<u8>> {
    let hidden = if has_alpha && !params.exact {
        HiddenColors::Replaced
    } else {
        HiddenColors::Kept
    };
    let mut stream = Stream::new(width, height, Quality(params.quality), params.method, hidden);
    stream.tries_no_cache = params.tries_no_cache();
    let writer = &mut stream.writer;
    writer.append(SIGNATURE.into(), 8);
    writer.append(width as u64 - 1, IMAGE_SIZE_BITS);
    writer.append(height as u64 - 1, IMAGE_SIZE_BITS);
    writer.append_flag(has_alpha);
    writer.append(0, VERSION_BITS);

    let to_argb = |[red, green, blue, alpha]: [u8; 4]| match alpha {
        0 if !params.exact => 0,
        _ => Argb::from_le_bytes([blue, green, red, alpha]),
    };
    let mut best = None;
    if let Some((bytes, colors, used)) = palette::index(rgba, to_argb)? {
        if !params.tries_no_cache() {
            return stream.finish_with_bytes(&bytes, &colors, used, false);
        }
        let others = vec::copied(&used)?;
        let with_palette = stream.try_clone()?.finish_with_bytes(&bytes, &colors, others, false)?;
        let predicted = stream.try_clone()?.finish_with_bytes(&bytes, &colors, used, true)?;
        let smaller = if predicted.len() < with_palette.len() {
            predicted
        } else {
            with_palette
        };
        if !params.tries_all_transforms() {
            return Ok(smaller);
        }
        best = Some(smaller);
    }
    let mut pixels = vec::with_room(rgba.len())?;
    pixels.extend(rgba.iter().map(|&pixel| to_argb(pixel)));
    // An image of few colors is not preprocessed, as the palette stands for its colors.
    if params.near_lossless < 100 && best.is_none() {
        near_lossless::apply(&mut pixels, width, height, params.near_lossless)?;
    }
    let bits = stream.tile_bits(best.is_some());
    let tiles = tiles::count(width, height, bits.of_transforms);
    let candidates = if params.method == 0 {
        // No guessing which transforms suit the image.
        let mut sets = vec::with_room(1)?;
        sets.push(Transforms {
            subtract_green: true,
            predictor: true,
            cross_color: false,
        });
        sets
    } else {
        analysis::for_colors(&pixels, width, tiles, params.tries_all_transforms())?
    };
    let mut candidates = candidates.into_iter();
    while let Some(transforms) = candidates.next() {
        let is_last = candidates.len() == 0;
        let copy = if is_last {
            core::mem::take(&mut pixels)
        } else {
            vec::copied(&pixels)?
        };
        let encoded = stream.try_clone()?.finish_with_colors(copy, transforms, bits)?;
        if best.as_ref().is_none_or(|best| encoded.len() < best.len()) {
            best = Some(encoded);
        }
    }
    best.ok_or(Error::Internal)
}

/// An image without a header, of which all channels but `green` are zero. `is_used` tells which values it has.
pub(crate) fn encode_green(
    green: &[u8],
    width: usize,
    height: usize,
    is_used: &[bool; 256],
) -> Result<Vec<u8>> {
    let mut colors = vec::array(0)?;
    for (color, green) in colors.iter_mut().zip(0..) {
        *color = green << 8;
    }
    let mut used = vec::with_room(is_used.len())?;
    used.extend((0..=u8::MAX).filter(|&green| *is_used.at(green.into())));
    let stream = Stream::new(
        width,
        height,
        Quality::ALPHA,
        Params::DEFAULT.method,
        HiddenColors::Kept,
    );
    stream.finish_with_bytes(green, &colors, used, false)
}

#[derive(Clone, Copy)]
struct TileBits {
    of_groups: u32,
    of_transforms: u32,
}

struct Stream {
    writer: BitWriter,
    width: usize,
    height: usize,
    quality: Quality,
    method: u8,
    hidden: HiddenColors,
    tries_no_cache: bool,
}

impl Stream {
    fn new(
        width: usize,
        height: usize,
        quality: Quality,
        method: u8,
        hidden: HiddenColors,
    ) -> Self {
        Self {
            writer: BitWriter::default(),
            width,
            height,
            quality,
            method,
            hidden,
            tries_no_cache: false,
        }
    }

    fn try_clone(&self) -> Result<Self> {
        Ok(Self {
            writer: self.writer.try_clone()?,
            ..*self
        })
    }

    // https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/vp8l_enc.c#L275
    fn tile_bits(&self, has_few_colors: bool) -> TileBits {
        const MAX_TILES: usize = 2600;
        let method = u32::from(self.method);
        let bits = (if has_few_colors { 9u32 } else { 7 }).saturating_sub(method);
        let of_groups = tiles::fitted(bits.max(MIN_TILE_BITS), self.width, self.height, MAX_TILES);
        let max_of_transforms = match method {
            ..4 => cross_color::MAX_TILE_BITS,
            4 => 5,
            _ => 4,
        };
        TileBits {
            of_groups,
            of_transforms: of_groups.min(max_of_transforms),
        }
    }

    fn start_transform(&mut self, transform_type: TransformType) {
        self.writer.append_flag(true);
        self.writer.append(transform_type as u64, 2);
    }

    /// For an image that has a byte for each pixel, which stands for one of `colors`. Those that are `used` are sorted by it.
    fn finish_with_bytes(
        mut self,
        bytes: &[u8],
        colors: &Colors,
        used: Vec<u8>,
        with_predictor: bool,
    ) -> Result<Vec<u8>> {
        let bits = self.tile_bits(true);
        let is_bundled = bundle_bits(used.len()) > 0;
        let tiles = tiles::count(self.width, self.height, bits.of_transforms);
        if !is_bundled
            && !with_predictor
            && self.method != 0
            && let Some(transforms) =
                analysis::for_bytes(bytes, colors, self.width, tiles, used.len())?
        {
            let mut pixels = vec::with_room(bytes.len())?;
            pixels.extend(bytes.iter().map(|&byte| *colors.at(byte.into())));
            return self.finish_with_colors(pixels, transforms, bits);
        }

        let palette = Palette::new(colors, used)?;
        let stored = palette.stored()?;
        self.start_transform(TransformType::ColorIndexing);
        self.writer.append(stored.len().saturating_sub(1) as u64, 8);
        image::write_subimage(&stored, stored.len(), Quality::PALETTE, &mut self.writer)?;
        let (mut pixels, width) = palette.apply(bytes, self.width)?;
        if with_predictor {
            self.apply_predictor(&mut pixels, width, bits)?;
        }
        let options = image::Options {
            quality: self.quality,
            tile_bits: bits.of_groups,
            max_cache_bits: usize::BITS - palette.len().leading_zeros(),
            tries_near_copies: is_bundled,
            tries_no_cache: self.tries_no_cache,
        };
        self.finish(&pixels, width, options)
    }

    /// Replaces the pixels by their residuals, and writes the transform.
    // https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/vp8l_enc.c#L1101
    fn apply_predictor(&mut self, pixels: &mut [Argb], width: usize, bits: TileBits) -> Result<()> {
        // https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/predictor_enc.c#L32
        const LOW_EFFORT_MODE: u8 = 11;
        let modes = if self.method == 0 {
            let bits = bits.of_transforms;
            let mode = LOW_EFFORT_MODE;
            predictor::apply_mode(pixels, width, self.height, bits, mode, HiddenColors::Kept)?
        } else {
            let sizes_below = 2 * u32::from(self.method).saturating_sub(4);
            let bits = bits.of_transforms;
            predictor::apply(pixels, width, self.height, bits, sizes_below, self.hidden)?
        };
        self.start_transform(TransformType::Predictor);
        image::write_tiles(&modes, self.quality, &mut self.writer)
    }

    // https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/vp8l_enc.c#L1512
    fn finish_with_colors(
        mut self,
        mut pixels: Vec<Argb>,
        transforms: Transforms,
        bits: TileBits,
    ) -> Result<Vec<u8>> {
        let (width, height, quality) = (self.width, self.height, self.quality);
        if transforms.subtract_green {
            self.start_transform(TransformType::SubtractGreen);
            for pixel in &mut pixels {
                let green = (*pixel >> 8) & 0xff;
                *pixel = sub(*pixel, green << 16 | green);
            }
        }
        if transforms.predictor {
            self.apply_predictor(&mut pixels, width, bits)?;
        }
        if transforms.cross_color {
            let tiles = cross_color::apply(&mut pixels, width, height, bits.of_transforms)?;
            self.start_transform(TransformType::CrossColor);
            image::write_tiles(&tiles, quality, &mut self.writer)?;
        }
        let options = image::Options {
            quality,
            tile_bits: bits.of_groups,
            max_cache_bits: cache::MAX_BITS,
            tries_near_copies: false,
            tries_no_cache: self.tries_no_cache,
        };
        self.finish(&pixels, width, options)
    }

    fn finish(mut self, pixels: &[Argb], width: usize, options: image::Options) -> Result<Vec<u8>> {
        self.writer.append_flag(false);
        image::finish_with(self.writer, pixels, width, self.height, options)
    }
}
