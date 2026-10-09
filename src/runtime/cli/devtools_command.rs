//! `bun rename`, `bun docs`, `bun parse` and `bun bench`: the embedded `src/js/eval/devtools.ts`,
//! booted like `bun -e` through [`super::toolchain_command::ToolchainCommand`].

pub(crate) const NAMES: [&[u8]; 4] = [b"rename", b"docs", b"parse", b"bench"];

/// Whether `bun <name>` keeps running the project's `<name>` script or file (`bench.ts`,
/// `docs/index.js`...), as it did before these were commands.
#[cold]
#[inline(never)]
pub(crate) fn is_project_entry(name: &[u8]) -> bool {
    use bun_paths::platform::Auto;
    use bun_paths::resolve_path::join_abs_string;
    if super::toolchain_command::is_package_script(name) {
        return true;
    }
    const EXTENSIONS: [&[u8]; 8] = [b".ts", b".tsx", b".js", b".jsx", b".mjs", b".cjs", b".mts", b".cts"];
    let cwd = super::check_command::working_directory();
    let mut stems: [Vec<u8>; 2] = [name.to_vec(), name.to_vec()];
    stems[1].extend_from_slice(b"/index");
    stems.iter().any(|stem| {
        EXTENSIONS.iter().any(|ext| {
            let mut file = stem.clone();
            file.extend_from_slice(ext);
            bun_sys::exists(join_abs_string::<Auto>(&cwd, &[&file[..]]))
        })
    })
}

/// The first argument naming one of [`NAMES`] (before any other command name) selects this script.
pub(crate) fn is_devtools_invocation() -> bool {
    bun_core::argv()
        .into_iter()
        .skip(1)
        .find(|arg| {
            !arg.starts_with(b"-")
                && (NAMES.contains(arg) || super::toolchain_command::is_toolchain_name(arg))
        })
        .is_some_and(|arg| NAMES.contains(&arg))
}
