//! Moves pixels to values that are cheaper to code, by no more than an amount that depends on the quality.

use crate::error::Result;
use crate::lossless::Argb;
use crate::slice::InBounds;
use crate::vec;

/// Smaller images are not worth it.
const MIN_SIDE: usize = 64;

/// How many bits of a channel may be shaved off.
// https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/dsp/lossless_common.h#L60
const fn limit_bits(quality: u8) -> u32 {
    5 - (quality / 20) as u32
}

/// The multiple of `1 << bits`, or 255, that is closest to `value`. A tie goes to the even multiple.
// https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/near_lossless_enc.c#L28
fn discretized(value: u8, bits: u32) -> u8 {
    let mask = (1u32 << bits) - 1;
    let value = u32::from(value);
    let biased = value + (mask >> 1) + ((value >> bits) & 1);
    if biased > 0xff { 0xff } else { (biased & !mask) as u8 }
}

fn is_near(a: Argb, b: Argb, limit: i32) -> bool {
    let channels = a.to_le_bytes().into_iter().zip(b.to_le_bytes());
    channels
        .map(|(a, b)| (i32::from(a) - i32::from(b)).abs())
        .all(|difference| difference < limit)
}

/// One pass over the pixels that have all four neighbors. Those that are not smooth are moved. `pixels` is `source`.
// https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/near_lossless_enc.c#L75
fn pass(pixels: &mut [Argb], source: &[Argb], width: usize, height: usize, bits: u32) {
    let limit = 1 << bits;
    for y in 1..height.saturating_sub(1) {
        for x in 1..width.saturating_sub(1) {
            let at = y * width + x;
            let current = source.value(at);
            let neighbors = [at - 1, at + 1, at - width, at + width].map(|at| source.value(at));
            if !neighbors.iter().all(|&other| is_near(current, other, limit)) {
                let channels = current.to_le_bytes().map(|channel| discretized(channel, bits));
                pixels.set(at, Argb::from_le_bytes(channels));
            }
        }
    }
}

// https://github.com/webmproject/libwebp/blob/4fa21912338357f89e4fd51cf2368325b59e9bd9/src/enc/near_lossless_enc.c#L113
pub(super) fn apply(pixels: &mut [Argb], width: usize, height: usize, quality: u8) -> Result<()> {
    if (width < MIN_SIDE && height < MIN_SIDE) || height < 3 {
        return Ok(());
    }
    let first_bits = limit_bits(quality);
    let mut source = vec::copied(pixels)?;
    pass(pixels, &source, width, height, first_bits);
    for bits in (1..first_bits).rev() {
        crate::slice::copy(pixels, &mut source);
        pass(pixels, &source, width, height, bits);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_go_to_the_nearest_multiple() {
        assert_eq!([0, 1, 2, 3, 4, 5, 6].map(|value| discretized(value, 2)), [0, 0, 0, 4, 4, 4, 8]);
        assert_eq!(discretized(254, 3), 255);
    }

    #[test]
    fn no_pixel_moves_by_more_than_the_bits_say() -> Result<()> {
        const SIDE: usize = 64;
        let original: Vec<Argb> = (0..SIDE * SIDE)
            .map(|i| (i as u32).wrapping_mul(0x9e37_79b1) ^ 0xff00_0000)
            .collect();
        for quality in [0, 20, 40, 60, 80, 99] {
            let mut moved = original.clone();
            apply(&mut moved, SIDE, SIDE, quality)?;
            // The passes with fewer bits come after, and each moves by at most half of its step.
            let bound = (1 << limit_bits(quality)) - 1;
            for (a, b) in original.iter().zip(&moved) {
                let channels = a.to_le_bytes().into_iter().zip(b.to_le_bytes());
                assert!(channels.into_iter().all(|(a, b)| i32::from(a).abs_diff(i32::from(b)) as i32 <= bound));
            }
        }
        Ok(())
    }
}
