//! SIMD base64 helpers backed by `simdutf`.
//!
//! Replaces the scalar `base64` crate's `Engine::decode` for the three hot
//! base64 paths in rio:
//! - OSC 52 clipboard_store (small, but synchronous on every paste).
//! - iTerm2 OSC 1337 inline images.
//! - Kitty graphics protocol APC chunks (4 KB+ per chunk, very hot during
//!   image-heavy TUIs).

#[cfg(all(not(target_arch = "wasm32"), feature = "bun-simdutf"))]
use bun_simdutf_sys::simdutf::base64;

/// Decode a standard-alphabet base64 byte slice (`+` and `/`, with padding)
/// to a freshly-allocated `Vec<u8>`. Returns `None` on invalid input.
#[cfg(all(not(target_arch = "wasm32"), feature = "bun-simdutf"))]
#[inline]
pub fn decode(input: &[u8]) -> Option<Vec<u8>> {
    decode_with_options(input, false)
}

/// Decode a standard-alphabet base64 byte slice without padding.
#[cfg(all(not(target_arch = "wasm32"), feature = "bun-simdutf"))]
#[inline]
pub fn decode_no_pad(input: &[u8]) -> Option<Vec<u8>> {
    decode_with_options(input, true)
}

/// Scalar path for wasm, where the C++-backed `simdutf` cannot build. The
/// engine is padding-indifferent, standing in for both simdutf variants
/// (whose Loose handling likewise forgives a missing or present pad).
#[cfg(any(target_arch = "wasm32", not(feature = "bun-simdutf")))]
fn scalar_engine() -> base64::engine::GeneralPurpose {
    use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
    GeneralPurpose::new(
        &base64::alphabet::STANDARD,
        GeneralPurposeConfig::new()
            .with_decode_padding_mode(DecodePaddingMode::Indifferent),
    )
}

#[cfg(any(target_arch = "wasm32", not(feature = "bun-simdutf")))]
#[inline]
pub fn decode(input: &[u8]) -> Option<Vec<u8>> {
    use base64::Engine;
    scalar_engine().decode(input).ok()
}

#[cfg(any(target_arch = "wasm32", not(feature = "bun-simdutf")))]
#[inline]
pub fn decode_no_pad(input: &[u8]) -> Option<Vec<u8>> {
    decode(input)
}

#[cfg(all(not(target_arch = "wasm32"), feature = "bun-simdutf"))]
#[inline]
fn decode_with_options(input: &[u8], no_padding: bool) -> Option<Vec<u8>> {
    base64::decode_loose_vec(input, no_padding)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_empty() {
        assert_eq!(decode(b"").unwrap(), b"");
    }

    #[test]
    fn decode_basic_padded() {
        assert_eq!(decode(b"aGVsbG8gd29ybGQ=").unwrap(), b"hello world");
    }

    #[test]
    fn decode_basic_unpadded_via_no_pad() {
        assert_eq!(decode_no_pad(b"aGVsbG8gd29ybGQ").unwrap(), b"hello world");
    }

    #[test]
    fn decode_invalid() {
        assert!(decode(b"not!valid#base64").is_none());
    }

    #[test]
    fn decode_round_trip_kitty_chunk() {
        // ~4 KB payload typical of kitty graphics.
        let bytes: Vec<u8> = (0..4096).map(|i| (i & 0xff) as u8).collect();
        use ::base64::engine::general_purpose::STANDARD;
        use ::base64::Engine;
        let encoded = STANDARD.encode(&bytes);
        let decoded = decode(encoded.as_bytes()).unwrap();
        assert_eq!(decoded, bytes);
    }
}
