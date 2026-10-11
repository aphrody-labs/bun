//! `bun vpn` forwards one command to Bun's native Mullvad management client.

use bun_core::Global;

pub(crate) struct Invocation;

impl Invocation {
    pub(crate) fn from_argv(
        argv0: &[u8],
        first_arg: Option<&[u8]>,
        be_bun: impl FnOnce() -> bool,
    ) -> Option<Self> {
        if first_arg != Some(b"vpn") {
            return None;
        }
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        (super::msvc_command::is_bun_argv0(name) || be_bun()).then_some(Self)
    }
}

#[cold]
pub(crate) fn exec(_: Invocation) -> ! {
    let args = bun_core::os_args()
        .into_iter()
        .skip(2)
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    let code = bun_vpn::cli(&args);
    Global::exit(code.clamp(0, 255) as u32);
}
