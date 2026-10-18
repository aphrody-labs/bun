// SPDX-License-Identifier: Apache-2.0
pub(crate) struct Invocation;

impl Invocation {
    pub(crate) fn from_argv(
        argv0: &[u8],
        first_arg: Option<&[u8]>,
        be_bun: impl FnOnce() -> bool,
    ) -> Option<Self> {
        if first_arg != Some(b"docker") {
            return None;
        }
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        (super::msvc_command::is_bun_argv0(name) || be_bun()).then_some(Self)
    }
}

#[cold]
pub(crate) fn exec(_: Invocation) -> ! {
    let args: Vec<_> = bun_core::os_args().into_iter().skip(2).collect();
    if args.iter().any(|arg| arg == "--apply")
        && bun_core::env_var::feature_flag::BUN_FEATURE_FLAG_EXPERIMENTAL_DOCKER_MUTATIONS::get()
            != Some(true)
    {
        super::msvc_command::fail(format_args!(
            "bun docker: mutations are experimental; set BUN_FEATURE_FLAG_EXPERIMENTAL_DOCKER_MUTATIONS=1 to enable them"
        ));
    }
    super::plugin_command::exec("docker", args);
}
