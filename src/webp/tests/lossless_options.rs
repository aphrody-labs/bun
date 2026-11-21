//! What the settings of `Lossless` do, through the codec's own decoder.

use bun_highway::webp::{LumaCandidates, Macroblock};
use bun_webp::{Compression, Lossless, encode};

/// The kernels of the lossy codec ask for nothing that lossless images need, and are not linked. Those that undo the
/// predictor and the cross-color transform are, as plain as they can be.
mod native_test_shims {
    use super::{LumaCandidates, Macroblock};

    type P = *const u8;

    macro_rules! do_nothing {
        ($(fn $name:ident($($argument:ty),*) $(-> $result:ty)?;)*) => {$(
            #[unsafe(no_mangle)]
            extern "C" fn $name($(_: $argument),*) $(-> $result)? {
                Default::default()
            }
        )*};
    }

    do_nothing! {
        fn highway_webp_inverse_dct(P, u32);
        fn highway_webp_reconstruct_subblocks(P, P, P, P, P, P);
        fn highway_webp_filter_normally(P, usize, P, P, usize, P, usize, bool);
        fn highway_webp_filter_simply(P, usize, P, usize, bool);
        fn highway_webp_upsample(P, P, P, P, usize);
        fn highway_webp_analyze(P, P, P, P);
        fn highway_webp_try_straight_modes(u64, u64, u8, usize, P, P, i32, P) -> u8;
        fn highway_webp_try_diagonal_modes(u64, u64, u8, usize, P, P, i32, P) -> u8;
        fn highway_webp_try_chroma_modes(P, P, u64, P, P, P) -> bool;
    }

    #[unsafe(no_mangle)]
    unsafe extern "C" fn highway_webp_yuv_to_rgba(_: P, _: P, _: P, _: P, _: *mut [u8; 4], _: usize) {}

    #[unsafe(no_mangle)]
    extern "C" fn highway_webp_convert(
        _: &[&[[u8; 4]; 16]; 16],
        _: P,
        _: P,
        _: &mut Macroblock,
    ) {
    }

    #[unsafe(no_mangle)]
    extern "C" fn highway_webp_try_luma_modes(
        _: &Macroblock,
        _: P,
        _: u64,
        _: u8,
        _: P,
        _: P,
        _: P,
        _: &mut LumaCandidates,
    ) -> u8 {
        0
    }

    fn average(a: u8, b: u8) -> u8 {
        ((u16::from(a) + u16::from(b)) / 2) as u8
    }

    fn clamp(value: i32) -> u8 {
        value.clamp(0, 255) as u8
    }

    fn predict(mode: u8, left: [u8; 4], above: [[u8; 4]; 3]) -> [u8; 4] {
        let [top_left, top, top_right] = above;
        let each = |f: &dyn Fn(usize) -> u8| core::array::from_fn(f);
        let at = |a: [u8; 4], b: [u8; 4], f: fn(u8, u8) -> u8| each(&|i| f(a[i], b[i]));
        match mode {
            1 => left,
            2 => top,
            3 => top_right,
            4 => top_left,
            5 => at(at(left, top_right, average), top, average),
            6 => at(left, top_left, average),
            7 => at(left, top, average),
            8 => at(top_left, top, average),
            9 => at(top, top_right, average),
            10 => at(
                at(left, top_left, average),
                at(top, top_right, average),
                average,
            ),
            11 => {
                let distance = |a: [u8; 4]| -> i32 {
                    (0..4).map(|i| (i32::from(a[i]) - i32::from(top_left[i])).abs()).sum()
                };
                if distance(left) <= distance(top) { top } else { left }
            }
            12 => each(&|i| clamp(i32::from(left[i]) + i32::from(top[i]) - i32::from(top_left[i]))),
            13 => {
                let mean = at(left, top, average);
                each(&|i| clamp(i32::from(mean[i]) + (i32::from(mean[i]) - i32::from(top_left[i])) / 2))
            }
            _ => [0, 0, 0, 255],
        }
    }

    #[unsafe(no_mangle)]
    unsafe extern "C" fn highway_webp_undo_prediction(
        row: *mut [u8; 4],
        above: *const [u8; 4],
        width: usize,
        tiles: *const [u8; 4],
        tile_bits: u32,
    ) {
        // SAFETY: the caller has `width` pixels in both rows, and the tiles that go with them.
        let (row, above) = unsafe {
            (
                std::slice::from_raw_parts_mut(row, width),
                std::slice::from_raw_parts(above, width),
            )
        };
        // SAFETY: as above.
        let tiles = unsafe { std::slice::from_raw_parts(tiles, ((width - 1) >> tile_bits) + 1) };
        for x in 0..width {
            let mode = tiles[x >> tile_bits][1];
            let predicted = if x == 0 {
                above[0]
            } else {
                let top_right = above.get(x + 1).copied().unwrap_or(row[0]);
                predict(mode, row[x - 1], [above[x - 1], above[x], top_right])
            };
            row[x] = core::array::from_fn(|i| row[x][i].wrapping_add(predicted[i]));
        }
    }

    #[unsafe(no_mangle)]
    unsafe extern "C" fn highway_webp_undo_cross_color(
        row: *mut [u8; 4],
        width: usize,
        tiles: *const [u8; 4],
        tile_bits: u32,
    ) {
        // SAFETY: the caller has `width` pixels and the tiles that go with them.
        let row = unsafe { std::slice::from_raw_parts_mut(row, width) };
        // SAFETY: as above.
        let tiles = unsafe { std::slice::from_raw_parts(tiles, width.div_ceil(1 << tile_bits)) };
        let delta = |multiplier: u8, color: u8| (i32::from(multiplier as i8) * i32::from(color as i8)) >> 5;
        for (x, pixel) in row.iter_mut().enumerate() {
            let [red_to_blue, green_to_blue, green_to_red, _] = tiles[x >> tile_bits];
            let [red, green, blue, alpha] = *pixel;
            let red = red.wrapping_add(delta(green_to_red, green) as u8);
            let blue = blue
                .wrapping_add(delta(green_to_blue, green) as u8)
                .wrapping_add(delta(red_to_blue, red) as u8);
            *pixel = [red, green, blue, alpha];
        }
    }
}

/// `paint` gets x, y and noise.
type Paint = fn(u32, u32, [u8; 4]) -> [u8; 4];

fn picture(width: u32, height: u32, paint: Paint) -> Vec<u8> {
    let mut state = 1u32;
    let mut noise = || {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        state.to_le_bytes()
    };
    let positions = (0..height).flat_map(|y| (0..width).map(move |x| (x, y)));
    positions.flat_map(|(x, y)| paint(x, y, noise())).collect()
}

/// A sprite sheet: a few tiles of many colors, repeated in a mostly transparent area. Hidden colors are there.
fn sprites(x: u32, y: u32, [n, m, ..]: [u8; 4]) -> [u8; 4] {
    let (column, row) = (x / 24, y / 24);
    if (column + row) % 5 > 1 || x % 24 >= 20 || y % 24 >= 20 {
        // What is not seen is not always black.
        return [n, m, 200, 0];
    }
    let (u, v) = (x % 24, y % 24);
    let kind = (column * 3 + row) % 4;
    [
        (u * 9 + kind * 40) as u8,
        (v * 7 + u * kind) as u8 ^ (n & 3),
        (u + v) as u8 * 3,
        255,
    ]
}

fn gradient(x: u32, y: u32, [n, ..]: [u8; 4]) -> [u8; 4] {
    [(x * 3 + y) as u8, (y * 2) as u8 ^ (n & 7), (x + y) as u8, 255]
}

fn noise(_: u32, _: u32, [r, g, b, a]: [u8; 4]) -> [u8; 4] {
    [r, g, b, a | 128]
}

fn few_colors(x: u32, y: u32, [n, ..]: [u8; 4]) -> [u8; 4] {
    [(x / 5 + y / 3) as u8 % 5 + u8::from(n < 9), 0, 0, 255]
}

fn many_palette_colors(x: u32, y: u32, [n, ..]: [u8; 4]) -> [u8; 4] {
    [(x + y) as u8 / 2, n % 3, 7, 255]
}

/// The length and a hash of what `Compression::Lossless` gave for each of them before it had settings.
const GOLDEN: [(usize, u64); 5] = [
    (5646, 0x0dd2_1c77_4a58_93f3),
    (3594, 0x0f3f_e60b_f525_c4fc),
    (17500, 0xce24_5683_f521_943e),
    (246, 0x1fc9_c5b0_1c34_5838),
    (2302, 0x0069_2360_eb25_b00a),
];

const PICTURES: [(u32, u32, Paint); 5] = [
    (192, 160, sprites),
    (96, 70, gradient),
    (70, 64, noise),
    (40, 48, few_colors),
    (100, 80, many_palette_colors),
];

fn encode_with(rgba: &[u8], width: u32, height: u32, settings: Lossless) -> Vec<u8> {
    encode(rgba, width, height, Compression::LosslessWith(settings), None).unwrap()
}

fn fnv(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(0x100_0000_01b3))
}

#[test]
fn the_default_is_what_it_was() {
    // Lengths and hashes of what `Compression::Lossless` gave before it had settings.
    for ((width, height, paint), golden) in PICTURES.into_iter().zip(GOLDEN) {
        let rgba = picture(width, height, paint);
        let default = encode(&rgba, width, height, Compression::Lossless, None).unwrap();
        assert_eq!((default.len(), fnv(&default)), golden, "{width}x{height}");
        let same = encode_with(&rgba, width, height, Lossless::DEFAULT);
        assert_eq!(same, default);
    }
}

#[test]
fn a_higher_effort_makes_a_sprite_sheet_smaller() {
    let (width, height) = (192, 160);
    let rgba = picture(width, height, sprites);
    let size = |effort| encode_with(&rgba, width, height, Lossless::from_effort(effort)).len();
    let by_effort: Vec<usize> = (0..=6).map(size).collect();
    assert!(by_effort[6] < by_effort[4], "{by_effort:?}");
    assert!(by_effort[4] < by_effort[0], "{by_effort:?}");
    let default = encode_with(&rgba, width, height, Lossless::DEFAULT).len();
    let best = encode_with(&rgba, width, height, Lossless { quality: 90, ..Lossless::DEFAULT }).len();
    assert!(best <= default, "{best} {default}");
}

#[test]
fn an_effort_stands_for_the_method_and_quality_of_a_preset() {
    let presets = [(0, 0), (1, 20), (2, 25), (3, 50), (4, 75), (5, 90), (6, 100)];
    for (effort, (method, quality)) in (0..).zip(presets) {
        let settings = Lossless::from_effort(effort);
        assert_eq!((settings.effort, settings.quality), (method, quality));
        assert_eq!((settings.near_lossless, settings.exact), (100, false));
    }
    assert_eq!(Lossless::from_effort(200), Lossless::from_effort(6));
    assert_eq!(Lossless::default(), Lossless::DEFAULT);
    // What is out of range is the end of it.
    let (width, height) = (40, 48);
    let rgba = picture(width, height, few_colors);
    let far = Lossless { effort: 99, quality: 255, near_lossless: 255, exact: false };
    let near = Lossless { effort: 6, quality: 100, near_lossless: 100, exact: false };
    assert_eq!(encode_with(&rgba, width, height, far), encode_with(&rgba, width, height, near));
}
