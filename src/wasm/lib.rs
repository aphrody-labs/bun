//! C ABI over Bun's engine-free crates for `wasm32-wasip1-threads`.
//!
//! Strings cross as `(ptr, len)` UTF-8 pairs allocated with `bun_wasm_alloc`.
//! Results come back as one owned buffer packed as `ptr << 32 | len`: byte 0 is
//! the status (`0` ok, `1` error) and the rest is the payload (JSON, HTML or an
//! error message). The host frees it with `bun_wasm_free(ptr, len)`.

use core::cmp::Ordering;

use bun_semver::{SlicedString, Version, query};

const STATUS_OK: u8 = 0;
const STATUS_ERR: u8 = 1;

/// `-1`, `0` or `1` like `Bun.semver.order`; `Err` names the invalid side.
pub fn semver_order(left: &[u8], right: &[u8]) -> Result<i32, Vec<u8>> {
    if !bun_core::strings::is_all_ascii(left) || !bun_core::strings::is_all_ascii(right) {
        return Err(b"Invalid SemVer: non-ASCII input".to_vec());
    }
    let left_result = Version::parse(SlicedString::init(left, left));
    if !left_result.valid {
        return Err([b"Invalid SemVer: ".as_slice(), left].concat());
    }
    let right_result = Version::parse(SlicedString::init(right, right));
    if !right_result.valid {
        return Err([b"Invalid SemVer: ".as_slice(), right].concat());
    }
    Ok(
        match left_result
            .version
            .max()
            .order_without_build(right_result.version.max(), left, right)
        {
            Ordering::Less => -1,
            Ordering::Equal => 0,
            Ordering::Greater => 1,
        },
    )
}

/// Same answer as `Bun.semver.satisfies(version, range)`.
pub fn semver_satisfies(version: &[u8], range: &[u8]) -> Result<bool, Vec<u8>> {
    if !bun_core::strings::is_all_ascii(version) || !bun_core::strings::is_all_ascii(range) {
        return Ok(false);
    }
    let left_result = Version::parse(SlicedString::init(version, version));
    if left_result.wildcard != query::token::Wildcard::None {
        return Ok(false);
    }
    let left_version = left_result.version.min();
    let group = query::parse(range, SlicedString::init(range, range))
        .map_err(|_| b"OutOfMemory".to_vec())?;
    if let Some(exact) = group.get_exact_version() {
        return Ok(left_version.eql(exact));
    }
    Ok(group.satisfies(left_version, range, version))
}

/// Bun Shell AST as JSON (the `bun_shell_parser::json_fmt` shape).
pub fn shell_parse(src: &[u8]) -> Result<Vec<u8>, Vec<u8>> {
    let arena = bun_alloc::Arena::new();
    let src: &[u8] = arena.alloc_slice_copy(src);
    let lex_result = if bun_core::is_all_ascii(src) {
        let mut lexer = bun_shell_parser::parse::LexerAscii::new(&arena, src, &[], 0);
        lexer.lex().map_err(|e| e.to_string().into_bytes())?;
        lexer.get_result()
    } else {
        let mut lexer = bun_shell_parser::parse::LexerUnicode::new(&arena, src, &[], 0);
        lexer.lex().map_err(|e| e.to_string().into_bytes())?;
        lexer.get_result()
    };
    if !lex_result.errors.is_empty() {
        return Err(lex_result.combine_errors(&arena).to_vec());
    }
    let jsobjs: &mut [bun_shell_parser::JSValueRaw] = &mut [];
    let mut parser = bun_shell_parser::Parser::new(&arena, lex_result, jsobjs)
        .map_err(|e| e.to_string().into_bytes())?;
    match parser.parse() {
        Ok(script) => Ok(
            bun_shell_parser::json_fmt::script_json_fmt(&script)
                .to_string()
                .into_bytes(),
        ),
        Err(e) => {
            let msg = parser.combine_errors();
            Err(if msg.is_empty() {
                e.to_string().into_bytes()
            } else {
                msg.to_vec()
            })
        }
    }
}

/// `Bun.markdown.html` without options.
pub fn markdown_html(text: &[u8]) -> Result<Vec<u8>, Vec<u8>> {
    bun_md::root::render_to_html(text)
        .map(Vec::from)
        .map_err(|e| format!("{e:?}").into_bytes())
}

fn pack(status: u8, payload: &[u8]) -> u64 {
    let mut out = Vec::with_capacity(payload.len() + 1);
    out.push(status);
    out.extend_from_slice(payload);
    let out = out.into_boxed_slice();
    let len = out.len() as u64;
    let ptr = bun_core::heap::into_raw(out).cast::<u8>() as usize as u64;
    (ptr << 32) | len
}

fn pack_result(result: Result<Vec<u8>, Vec<u8>>) -> u64 {
    match result {
        Ok(bytes) => pack(STATUS_OK, &bytes),
        Err(msg) => pack(STATUS_ERR, &msg),
    }
}

/// # Safety
/// `(ptr, len)` must be a live buffer from `bun_wasm_alloc` (or null/0).
unsafe fn input<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if ptr.is_null() || len == 0 {
        return &[];
    }
    // SAFETY: caller contract above.
    unsafe { core::slice::from_raw_parts(ptr, len) }
}

/// Allocates `len` zeroed bytes the host fills before a call.
#[unsafe(no_mangle)]
pub extern "C" fn bun_wasm_alloc(len: usize) -> *mut u8 {
    let buf = vec![0u8; len].into_boxed_slice();
    bun_core::heap::into_raw(buf).cast::<u8>()
}

/// # Safety
/// `(ptr, len)` must come from `bun_wasm_alloc` or a packed result, freed once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_wasm_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() {
        return;
    }
    let slice = core::ptr::slice_from_raw_parts_mut(ptr, len);
    // SAFETY: caller contract above; the buffer was a `Box<[u8]>` of `len` bytes.
    drop(unsafe { bun_core::heap::take(slice) });
}

/// Packed result whose payload is the Bun version string.
#[unsafe(no_mangle)]
pub extern "C" fn bun_wasm_version() -> u64 {
    pack(STATUS_OK, bun_core::package_json_version.as_bytes())
}

/// # Safety
/// Both inputs follow the `input` contract.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_wasm_semver_order(
    a: *const u8,
    a_len: usize,
    b: *const u8,
    b_len: usize,
) -> u64 {
    // SAFETY: forwarded caller contract.
    let (a, b) = unsafe { (input(a, a_len), input(b, b_len)) };
    pack_result(semver_order(a, b).map(|o| o.to_string().into_bytes()))
}

/// # Safety
/// Both inputs follow the `input` contract.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_wasm_semver_satisfies(
    v: *const u8,
    v_len: usize,
    r: *const u8,
    r_len: usize,
) -> u64 {
    // SAFETY: forwarded caller contract.
    let (v, r) = unsafe { (input(v, v_len), input(r, r_len)) };
    pack_result(semver_satisfies(v, r).map(|ok| if ok { b"true".to_vec() } else { b"false".to_vec() }))
}

/// # Safety
/// The input follows the `input` contract.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_wasm_shell_parse(src: *const u8, len: usize) -> u64 {
    // SAFETY: forwarded caller contract.
    pack_result(shell_parse(unsafe { input(src, len) }))
}

/// # Safety
/// The input follows the `input` contract.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_wasm_markdown_html(src: *const u8, len: usize) -> u64 {
    // SAFETY: forwarded caller contract.
    pack_result(markdown_html(unsafe { input(src, len) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver() {
        assert_eq!(semver_order(b"1.2.3", b"1.10.0"), Ok(-1));
        assert_eq!(semver_order(b"2.0.0", b"2.0.0"), Ok(0));
        assert!(semver_order(b"nope", b"1.0.0").is_err());
        assert_eq!(semver_satisfies(b"1.4.0", b"^1.2.0"), Ok(true));
        assert_eq!(semver_satisfies(b"2.0.0", b"^1.2.0"), Ok(false));
    }

    #[test]
    fn shell() {
        let json = shell_parse(b"echo hi | wc -c").expect("parse");
        assert!(bun_core::strings::contains(&json, b"echo"));
        assert!(shell_parse(b"echo 'unterminated").is_err());
    }

    #[test]
    fn markdown() {
        let html = markdown_html(b"# Title").expect("render");
        assert!(bun_core::strings::contains(&html, b"<h1>"));
    }
}
