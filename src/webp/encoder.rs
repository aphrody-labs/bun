//! 8-bit RGBA to WebP, with the settings of libwebp's `WebPEncodeRGBA()` and `WebPEncodeLosslessRGBA()`.

use crate::error::{Error, Result};
use crate::riff::{self, Bitstream};
use crate::{alpha, lossless, lossy, slice};

// https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/webp/encode.h#L298
const MAX_DIMENSION: u32 = 16383;

/// The lossless encoder's settings, which are those of libwebp's `WebPConfig` with `lossless` set.
///
/// `Lossless::DEFAULT` is what `Compression::Lossless` stands for: method 4 and quality 70 are `WebPEncodeLosslessRGBA()`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Lossless {
    /// 0 to 6: libwebp's `method`. A higher one tries more of what may make for fewer bytes, and takes longer.
    pub effort: u8,
    /// 0 to 100: libwebp's `quality` for a lossless image, and `cwebp -q` with `-lossless`. Higher is slower and smaller.
    /// With `effort` 6, 100 also tries every set of transforms. Qualities of 90 and more cluster the tiles' histograms more
    /// closely, and those of more than 75 look for copies in the whole image.
    pub quality: u8,
    /// 0 to 100: libwebp's `near_lossless`. 100 is off. Less moves the colors of pixels that are not in a smooth area
    /// by up to 31 (0 to 19), 15 (20 to 39), 7 (40 to 59), 3 (60 to 79) or 1 (80 to 99).
    pub near_lossless: u8,
    /// Keeps the color of fully transparent pixels, which is otherwise lost to make them cheaper.
    pub exact: bool,
}

impl Lossless {
    pub const DEFAULT: Self = Self {
        effort: 4,
        quality: 70,
        near_lossless: 100,
        exact: false,
    };

    /// What `cwebp -lossless -z` pairs with `effort` 0 to 6, which are -z 0, 1, 2, 4, 6, 8 and 9: libwebp's method and the
    /// quality of its preset (`kLosslessPresets`), (0, 0), (1, 20), (2, 25), (3, 50), (4, 75), (5, 90) and (6, 100).
    /// The presets (3, 30), (4, 50) and (4, 90) are `-z 3`, `-z 5` and `-z 7`; one has them by the `quality` of an `effort`.
    /// An `effort` above 6 is 6.
    pub const fn from_effort(effort: u8) -> Self {
        let effort = if effort > 6 { 6 } else { effort };
        let quality = match effort {
            0 => 0,
            1 => 20,
            2 => 25,
            3 => 50,
            4 => 75,
            5 => 90,
            _ => 100,
        };
        Self {
            effort,
            quality,
            ..Self::DEFAULT
        }
    }

    const fn params(self) -> lossless::encoder::Params {
        lossless::encoder::Params {
            method: if self.effort > 6 { 6 } else { self.effort },
            quality: if self.quality > 100 {
                100
            } else {
                self.quality
            },
            near_lossless: if self.near_lossless > 100 {
                100
            } else {
                self.near_lossless
            },
            exact: self.exact,
        }
    }
}

impl Default for Lossless {
    fn default() -> Self {
        Self::DEFAULT
    }
}

#[derive(Clone, Copy)]
pub enum Compression {
    /// Keeps every pixel but the color of the fully transparent ones: `Lossless::DEFAULT`.
    Lossless,
    /// As `Lossless`, with the settings.
    LosslessWith(Lossless),
    /// `quality` is 0 to 100. The alpha channel stays lossless.
    Lossy { quality: u8 },
}

pub fn encode(
    rgba: &[u8],
    width: u32,
    height: u32,
    compression: Compression,
    icc_profile: Option<&[u8]>,
) -> Result<Vec<u8>> {
    if !(1..=MAX_DIMENSION).contains(&width) || !(1..=MAX_DIMENSION).contains(&height) {
        return Err(Error::InvalidDimensions);
    }
    let (width, height) = (width as usize, height as usize);
    let (pixels, rest) = rgba.as_chunks::<4>();
    if pixels.len() != width * height || !rest.is_empty() {
        return Err(Error::InvalidBufferSize);
    }
    let has_alpha = pixels.chunks(256).any(|run| {
        let all = run.iter().map(|&it| u32::from_le_bytes(it));
        all.fold(u32::MAX, |all, it| all & it) >> 24 != 255
    });
    let icc_profile = icc_profile.filter(|profile| !profile.is_empty());
    slice::checked(|| match compression {
        Compression::Lossless | Compression::LosslessWith(_) => {
            let params = match compression {
                Compression::LosslessWith(settings) => settings.params(),
                _ => Lossless::DEFAULT.params(),
            };
            let image = lossless::encoder::encode(pixels, width, height, has_alpha, params)?;
            let bitstream = Bitstream::Lossless { image: &image };
            riff::write(width, height, has_alpha, bitstream, icc_profile)
        }
        Compression::Lossy { quality } => {
            let image = lossy::encoder::encode(pixels, width, height, has_alpha, quality.min(100))?;
            let alpha = has_alpha
                .then(|| alpha::encoder::encode(pixels, width, height))
                .transpose()?;
            let bitstream = Bitstream::Lossy {
                image: &image,
                alpha: alpha.as_deref(),
            };
            riff::write(width, height, has_alpha, bitstream, icc_profile)
        }
    })
}
