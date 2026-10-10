use bun_collections::VecExt;
use core::ffi::c_char;
use core::ptr::NonNull;
use std::io::Write as _;

use bun_alloc::Arena as Bump;
use bun_core::Global::SyncCStr;
use bun_core::MutableString;
use bun_core::{self, Environment, Global, Output, Progress, fmt as bun_fmt};
use bun_core::{ZStr, strings};
use bun_dotenv as DotEnv;
use bun_http::{self as HTTP, headers};
use bun_install::integrity::{Integrity, Tag as IntegrityTag};
use bun_jsc::{self as jsc, CallFrame, JSGlobalObject, JSValue, JsResult};
use bun_parsers::json as JSON;
use bun_paths::{self, SEP_STR};
use bun_resolver::fs;
use bun_sys as sys;
use bun_url::URL;
use bun_which::which;
use bun_wyhash::hash;

use crate::api::bun::process::Status;
use crate::api::bun::process::sync as spawn_sync;
use crate::cli::Command;

// `sync::Options.argv` is `Vec<Box<[u8]>>` (owns its rows). Helper
// to build it from borrowed slices.
#[inline]
fn build_argv(parts: &[&[u8]]) -> Vec<Box<[u8]>> {
    parts.iter().map(|p| Box::<[u8]>::from(*p)).collect()
}

#[cfg(windows)]
#[inline]
fn spawn_windows_options() -> crate::api::bun::process::WindowsOptions {
    crate::api::bun::process::WindowsOptions {
        loop_: bun_event_loop::EventLoopHandle::init_mini(
            bun_event_loop::MiniEventLoop::init_global(None, None),
        ),
        ..Default::default()
    }
}

// `bun_resolver::fs::FileSystem` (the inline canonical type surface
// in `resolver/lib.rs`) does not yet expose `tmpdir()`; the full impl lives in
// the un-exported `fs_full` module. Shim it locally — open
// `RealFS::tmpdir_path()` as a `sys::Dir`, mirroring `RealFS::open_tmp_dir`.
pub(crate) trait FileSystemTmpdirExt {
    fn tmpdir(&mut self) -> crate::Result<sys::Dir>;
}
impl FileSystemTmpdirExt for fs::FileSystem {
    fn tmpdir(&mut self) -> crate::Result<sys::Dir> {
        sys::Dir::open(fs::RealFS::tmpdir_path()).map_err(Into::into)
    }
}

// `bun.argv` is an `Argv` newtype (not `&[&[u8]]`), so
// `strings::contains_any` can't take it directly. Local helper that scans the
// process argv for an exact match.
#[inline]
fn argv_contains(target: &[u8]) -> bool {
    bun_core::argv().iter().any(|a| a == target)
}

// ──────────────────────────────────────────────────────────────────────────

/// Releases come from this GitHub repository unless `APHRODY_BUN_REPO` names another one.
const DEFAULT_REPO: &str = "aphrody-labs/bun";
/// Runtime release tags look like `aphrody-v1.4.3-aphrody.2`; other tags of the repository
/// (`n2b-v0.7.1`, …) belong to other packages.
const RELEASE_TAG_PREFIX: &[u8] = b"aphrody-v";
const UPSTREAM_TAG_PREFIX: &[u8] = b"bun-v";
const CURRENT_RELEASE_PREFIX: &str =
    if Global::display_version.len() == Global::package_json_version.len() {
        "bun-v"
    } else {
        "aphrody-v"
    };
const SUMS_FILENAME: &[u8] = b"SHA256SUMS.txt";

pub(crate) struct Version {
    pub(crate) zip_url: Box<[u8]>,
    pub(crate) sums_url: Box<[u8]>,
    pub(crate) tag: Box<[u8]>,
    pub(crate) size: u32,
    pub(crate) digest: Integrity,
}

impl Version {
    pub(crate) fn name(&self) -> Option<Vec<u8>> {
        if &*self.tag == b"canary" {
            use crate::cli as Cli;
            let mut out = Vec::new();
            let start_time = Cli::start_time();
            let bytes = &start_time.to_ne_bytes()[..];
            write!(
                &mut out,
                "bun-canary-timestamp-{}",
                bun_fmt::hex_int_lower::<16>(hash(bytes)),
            )
            .expect("oom");
            return Some(out);
        }
        for prefix in [RELEASE_TAG_PREFIX, UPSTREAM_TAG_PREFIX] {
            if self.tag.len() > prefix.len() && self.tag.starts_with(prefix) {
                return Some(self.tag[prefix.len()..].to_vec());
            }
        }
        Some(self.tag.to_vec())
    }

    // "windows" not "win32"; Android folds to "linux" (`SUFFIX_ABI` below adds
    // "-android", matching `bun-linux-aarch64-android.zip` on the release page).
    pub(crate) const PLATFORM_LABEL: &'static str = bun_core::env::OS_NAME_NPM;

    pub(crate) const ARCH_LABEL: &'static str = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x64"
    };
    pub(crate) const TRIPLET: &'static str =
        const_format::concatcp!(Version::PLATFORM_LABEL, "-", Version::ARCH_LABEL);
    const SUFFIX_ABI: &'static str = if Environment::IS_MUSL {
        "-musl"
    } else if Environment::IS_ANDROID {
        "-android"
    } else {
        ""
    };
    const SUFFIX: &'static str = Version::SUFFIX_ABI;
    pub(crate) const FOLDER_NAME: &'static str =
        const_format::concatcp!("bun-", Version::TRIPLET, Version::SUFFIX);
    pub(crate) const ZIP_FILENAME: &'static str =
        const_format::concatcp!(Version::FOLDER_NAME, ".zip");

    pub(crate) const PROFILE_FOLDER_NAME: &'static str =
        const_format::concatcp!("bun-", Version::TRIPLET, Version::SUFFIX, "-profile");
    pub(crate) const PROFILE_ZIP_FILENAME: &'static str =
        const_format::concatcp!(Version::PROFILE_FOLDER_NAME, ".zip");

    const CURRENT_TAG: &'static str = const_format::concatcp!("aphrody-v", Global::display_version);
    const CURRENT_UPSTREAM_TAG: &'static str =
        const_format::concatcp!("bun-v", Global::package_json_version);

    pub(crate) fn is_current(&self) -> bool {
        &*self.tag == Self::CURRENT_TAG.as_bytes()
            || &*self.tag == Self::CURRENT_UPSTREAM_TAG.as_bytes()
    }

    /// Lowercase hex SHA-256 of `name` in a `sha256sum`-style listing (`<hex>  <name>` or
    /// `<hex> *<name>`).
    fn digest_from_sums(sums: &[u8], name: &[u8]) -> Option<Integrity> {
        for line in strings::split(sums, b"\n") {
            let line = bun_core::trim(line, b" \r\t");
            let Some((hex, rest)) = strings::split_once_char(line, b' ') else {
                continue;
            };
            let file = bun_core::trim(rest, b" \t");
            let file = file.strip_prefix(b"*").unwrap_or(file);
            if file != name {
                continue;
            }
            let mut tagged = Vec::with_capacity(b"sha256:".len() + hex.len());
            tagged.extend_from_slice(b"sha256:");
            tagged.extend(hex.iter().map(u8::to_ascii_lowercase));
            let digest = Self::parse_asset_digest(&tagged);
            return digest.tag.is_supported().then_some(digest);
        }
        None
    }

    pub(crate) fn parse_asset_digest(buf: &[u8]) -> Integrity {
        const PREFIX: &[u8] = b"sha256:";
        const HEX_LEN: usize = 64;
        if buf.len() != PREFIX.len() + HEX_LEN || !strings::starts_with(buf, PREFIX) {
            return Integrity::default();
        }

        let mut digest = Integrity {
            tag: IntegrityTag::SHA256,
            ..Default::default()
        };
        for (i, pair) in buf[PREFIX.len()..].as_chunks::<2>().0.iter().enumerate() {
            match bun_fmt::hex_pair_value(pair[0], pair[1]) {
                Some(byte) => digest.value[i] = byte,
                None => return Integrity::default(),
            }
        }

        digest
    }
}

// Exported C symbol — null-terminated
// Moved out of `impl Version` — Rust impl blocks cannot hold `static` items.
// `*const c_char` is `!Sync`, so wrap in the `#[repr(transparent)]` `SyncCStr` newtype
// (same pattern as `Bun__userAgent` in bun_core::Global) so the C++ side still sees a
// single `const char*`-sized symbol.
#[unsafe(no_mangle)]
static Bun__githubURL: SyncCStr = SyncCStr(
    const_format::concatcp!(
        "https://github.com/",
        DEFAULT_REPO,
        "/releases/download/",
        CURRENT_RELEASE_PREFIX,
        Global::display_version,
        "/",
        Version::ZIP_FILENAME,
        "\0"
    )
    .as_ptr()
    .cast::<c_char>(),
);

// ──────────────────────────────────────────────────────────────────────────

pub(crate) struct UpgradeCommand;

impl UpgradeCommand {
    const DEFAULT_LOCAL_BUILD: &'static str =
        const_format::concatcp!("build/release/bun", UpgradeCommand::EXE_SUFFIX);

    /// `GITHUB_API_DOMAIN` points the release lookup at a GitHub proxy (and at a local server in
    /// tests).
    fn api_domain(env_loader: &DotEnv::Loader) -> &[u8] {
        match env_loader.map.get(b"GITHUB_API_DOMAIN") {
            Some(domain) if !domain.is_empty() => domain,
            _ => b"api.github.com",
        }
    }

    fn repo(env_loader: &DotEnv::Loader) -> &[u8] {
        let repo = match env_loader.map.get(b"APHRODY_BUN_REPO") {
            Some(repo) if !repo.is_empty() => repo,
            _ => return DEFAULT_REPO.as_bytes(),
        };
        let segment_ok = |s: &[u8]| {
            !s.is_empty()
                && s != b"."
                && s != b".."
                && s.iter()
                    .all(|&c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
        };
        let valid = strings::split_once_char(repo, b'/')
            .is_some_and(|(owner, name)| segment_ok(owner) && segment_ok(name));
        if !valid {
            bun_core::pretty_errorln!(
                "<r><red>error:<r> APHRODY_BUN_REPO must look like <b>owner/name<r>, got {}",
                bstr::BStr::new(repo)
            );
            Global::exit(1);
        }
        repo
    }

    fn access_token(env_loader: &DotEnv::Loader) -> Option<&[u8]> {
        const TOKEN_VARS: [&[u8]; 3] = [b"GITHUB_TOKEN", b"GH_TOKEN", b"GITHUB_ACCESS_TOKEN"];
        TOKEN_VARS
            .into_iter()
            .filter_map(|key| env_loader.map.get(key))
            .find(|token| !token.is_empty())
    }

    fn push_header(buf: &mut Vec<u8>, entries: &mut headers::EntryList, name: &[u8], value: &[u8]) {
        let offset = u32::try_from(buf.len()).expect("int cast");
        let name_len = u32::try_from(name.len()).expect("int cast");
        buf.extend_from_slice(name);
        buf.extend_from_slice(value);
        entries
            .append(headers::Entry {
                name: HTTP::ETag::StringPointer {
                    offset,
                    length: name_len,
                },
                value: HTTP::ETag::StringPointer {
                    offset: offset + name_len,
                    length: u32::try_from(value.len()).expect("int cast"),
                },
            })
            .expect("oom");
    }

    /// GET `url` into `body` and return the status. Only API requests (`api`) carry the token,
    /// so it never follows an asset download's redirect to the CDN.
    fn http_get(
        env_loader: &DotEnv::Loader,
        url: &'static [u8],
        api: bool,
        progress: Option<NonNull<Progress::Node>>,
        body: &mut MutableString,
    ) -> crate::Result<u32> {
        let mut headers_buf: Vec<u8> = Vec::new();
        let mut entries = headers::EntryList::default();
        if api {
            Self::push_header(
                &mut headers_buf,
                &mut entries,
                b"Accept",
                b"application/vnd.github+json",
            );
            if let Some(token) = Self::access_token(env_loader) {
                let mut value = Vec::with_capacity(b"Bearer ".len() + token.len());
                value.extend_from_slice(b"Bearer ");
                value.extend_from_slice(token);
                Self::push_header(&mut headers_buf, &mut entries, b"Authorization", &value);
            }
        }
        let url = URL::parse(url);
        let http_proxy = env_loader.get_http_proxy_for(&url);
        let mut async_http = Box::new(HTTP::AsyncHTTP::init_sync(
            HTTP::Method::GET,
            url,
            entries,
            &headers_buf,
            b"",
            http_proxy,
            HTTP::FetchRedirect::Follow,
        ));
        async_http.client.flags.reject_unauthorized = env_loader.get_tls_reject_unauthorized();
        async_http.client.progress_node = progress;
        let response = async_http.send_sync(body)?;
        Ok(response.status_code())
    }

    fn check_status(status: u32) -> crate::Result<()> {
        match status {
            200 => Ok(()),
            404 => Err(crate::Error::HTTP404),
            403 => Err(crate::Error::HTTPForbidden),
            429 => Err(crate::Error::HTTPTooManyRequests),
            499..=599 => Err(crate::Error::GitHubIsDown),
            _ => Err(crate::Error::HTTPError),
        }
    }

    fn string_prop(expr: &bun_ast::Expr, key: &[u8]) -> Option<Box<[u8]>> {
        let query = expr.as_property(key)?;
        query.expr.as_utf8_string_literal().map(Box::<[u8]>::from)
    }

    fn is_runtime_release(release: &bun_ast::Expr) -> bool {
        let flag = |key: &[u8]| {
            release
                .as_property(key)
                .and_then(|q| q.expr.as_bool())
                .unwrap_or(false)
        };
        Self::string_prop(release, b"tag_name").is_some_and(|tag| {
            tag.starts_with(UPSTREAM_TAG_PREFIX) || tag.starts_with(RELEASE_TAG_PREFIX)
        }) && !flag(b"draft")
            && !flag(b"prerelease")
    }

    /// Stable: the newest `aphrody-v*` release of the repository. Canary: the release tagged
    /// `canary` (the latest build of main), which may not exist.
    fn fetch_release(
        env_loader: &DotEnv::Loader,
        refresher: &mut Progress::Progress,
        progress: &mut Progress::Node,
        use_canary: bool,
        use_profile: bool,
    ) -> crate::Result<Version> {
        let repo = Self::repo(env_loader);
        let url_buf: &'static mut Vec<u8> = crate::cli::cli_arena().alloc(Vec::new());
        write!(
            url_buf,
            "https://{}/repos/{}/releases{}",
            bstr::BStr::new(Self::api_domain(env_loader)),
            bstr::BStr::new(repo),
            if use_canary {
                "/tags/canary"
            } else {
                "?per_page=20"
            },
        )
        .expect("oom");

        let metadata_body: &'static mut MutableString =
            crate::cli::cli_arena().alloc(MutableString::init(2048)?);
        let status = Self::http_get(
            env_loader,
            &url_buf[..],
            true,
            Some(NonNull::from(&mut *progress)),
            metadata_body,
        )?;

        let fail = |progress: &mut Progress::Node, refresher: &mut Progress::Progress| {
            progress.end();
            refresher.refresh();
        };

        if status == 404 && use_canary {
            fail(progress, refresher);
            bun_core::pretty_errorln!(
                "<r><red>error:<r> {} has no canary build of Bun (no release tagged <b>canary<r> built from main)\n\nInstall the latest release instead: <b><cyan>bun upgrade --stable<r>",
                bstr::BStr::new(repo)
            );
            Global::exit(1);
        }
        Self::check_status(status)?;

        let mut log = bun_ast::Log::init();
        let source =
            bun_ast::Source::init_path_string(b"releases.json", metadata_body.list.as_slice());
        bun_ast::initialize_store();
        // `JSON::parse_utf8` needs a bump arena; this is a one-shot
        // CLI path so use the process-lifetime CLI arena.
        let bump: &'static Bump = crate::cli::cli_arena();
        let expr = match JSON::parse_utf8(&source, &mut log, bump) {
            Ok(e) if log.errors == 0 => e,
            Ok(_) => {
                fail(progress, refresher);
                let _ = log.print(std::ptr::from_mut(Output::error_writer()));
                Global::exit(1);
            }
            Err(err) => {
                fail(progress, refresher);
                if log.errors > 0 {
                    let _ = log.print(std::ptr::from_mut(Output::error_writer()));
                } else {
                    bun_core::pretty_errorln!(
                        "Error parsing releases from GitHub: <r><red>{}<r>",
                        err.name()
                    );
                }
                Global::exit(1);
            }
        };

        let release = if let Some(list) = expr.data.e_array() {
            match list
                .items
                .slice()
                .iter()
                .copied()
                .find(Self::is_runtime_release)
            {
                Some(release) => release,
                None => {
                    fail(progress, refresher);
                    bun_core::pretty_errorln!(
                        "<r><red>error:<r> {} has no published Bun release (tag <b>aphrody-v*<r>)",
                        bstr::BStr::new(repo)
                    );
                    Global::exit(1);
                }
            }
        } else if expr.is_object() {
            expr
        } else {
            fail(progress, refresher);
            bun_core::pretty_errorln!(
                "JSON error - expected an object but received {:?}",
                core::mem::discriminant(&expr.data)
            );
            Global::exit(1);
        };

        let mut version = Version {
            zip_url: Box::default(),
            sums_url: Box::default(),
            tag: Self::string_prop(&release, b"tag_name").unwrap_or_default(),
            size: 0,
            digest: Integrity::default(),
        };

        if version.tag.is_empty() {
            fail(progress, refresher);
            bun_core::pretty_errorln!(
                "JSON Error parsing releases from GitHub: <r><red>tag_name<r> is missing?\n{}",
                bstr::BStr::new(metadata_body.list.as_slice())
            );
            Global::exit(1);
        }

        let filename: &[u8] = if use_profile {
            Version::PROFILE_ZIP_FILENAME.as_bytes()
        } else {
            Version::ZIP_FILENAME.as_bytes()
        };
        let assets = release
            .as_property(b"assets")
            .and_then(|q| q.expr.data.e_array());
        if let Some(assets) = assets {
            for asset in assets.items.slice() {
                let Some(name) = Self::string_prop(asset, b"name") else {
                    continue;
                };
                if &*name == SUMS_FILENAME {
                    if let Some(url) = Self::string_prop(asset, b"browser_download_url") {
                        version.sums_url = url;
                    }
                    continue;
                }
                if &*name != filename || !version.zip_url.is_empty() {
                    continue;
                }
                if Self::string_prop(asset, b"content_type")
                    .is_some_and(|content_type| &*content_type != b"application/zip")
                {
                    continue;
                }
                let Some(url) = Self::string_prop(asset, b"browser_download_url") else {
                    continue;
                };
                version.zip_url = url;
                if let Some(digest) = Self::string_prop(asset, b"digest") {
                    version.digest = Version::parse_asset_digest(&digest);
                }
                if let Some(size_) = asset.as_property(b"size") {
                    if let bun_ast::ExprData::ENumber(n) = &size_.expr.data {
                        version.size = u32::try_from(((n.value().ceil()) as i32).max(0)).unwrap();
                    }
                }
            }
        }

        if version.zip_url.is_empty() {
            fail(progress, refresher);
            bun_core::pretty_errorln!(
                "Bun {} is out, but not for this platform ({}) yet.",
                bstr::BStr::new(&version.tag),
                Version::TRIPLET
            );
            Global::exit(0);
        }

        Ok(version)
    }

    /// `bun upgrade --local [path]`: the path after `--local` (or `--local=path`), else the
    /// release build of the checkout in the current directory.
    fn local_build_arg() -> Option<&'static [u8]> {
        let mut args = bun_core::argv().into_iter().skip(2);
        while let Some(arg) = args.next() {
            if arg == b"--local" {
                return Some(match args.next() {
                    Some(path) if !path.starts_with(b"--") => path,
                    _ => Self::DEFAULT_LOCAL_BUILD.as_bytes(),
                });
            }
            if let Some(path) = arg.strip_prefix(b"--local=") {
                return Some(path);
            }
        }
        None
    }

    /// Copies a locally built Bun over the running one. On Windows the running executable is
    /// first renamed to `<exe>.old`, which the next launch deletes.
    fn install_local(filesystem: &fs::FileSystem, source: &[u8]) -> crate::Result<()> {
        let mut source_buf = bun_paths::path_buffer_pool::get();
        let source_z = bun_paths::join_abs_string_buf_z::<bun_paths::platform::Auto>(
            filesystem.top_level_dir,
            &mut source_buf[..],
            &[source],
        );
        if !sys::exists(source_z.as_bytes()) {
            bun_core::pretty_errorln!(
                "<r><red>error:<r> No Bun build at {} (build one with <b><cyan>bun run build:release<r>, or pass its path: <b>bun upgrade --local \\<path\\><r>)",
                bstr::BStr::new(source_z.as_bytes())
            );
            Global::exit(1);
        }

        let target_z: &ZStr =
            bun_core::self_exe_path().map_err(|_| crate::Error::UpgradeFailedMissingExecutable)?;
        let target = target_z.as_bytes();
        let same_file = if cfg!(windows) {
            strings::eql_case_insensitive_asciii_check_length(source_z.as_bytes(), target)
        } else {
            source_z.as_bytes() == target
        };
        if same_file {
            bun_core::pretty_errorln!(
                "<r><red>error:<r> {} is the Bun that is running",
                bstr::BStr::new(target)
            );
            Global::exit(1);
        }

        let verify_argv: [&[u8]; 2] = [source_z.as_bytes(), b"--version"];
        let result = match spawn_sync::spawn(&spawn_sync::Options {
            argv: build_argv(&verify_argv),
            envp: None,
            cwd: Box::<[u8]>::from(filesystem.top_level_dir),
            stdout: spawn_sync::SyncStdio::Buffer,
            stderr: spawn_sync::SyncStdio::Ignore,
            stdin: spawn_sync::SyncStdio::Ignore,
            #[cfg(windows)]
            windows: spawn_windows_options(),
            ..Default::default()
        }) {
            Ok(Ok(result)) if result.status.is_ok() => result,
            _ => {
                bun_core::pretty_errorln!(
                    "<r><red>error:<r> {} --version failed; not installing it",
                    bstr::BStr::new(source_z.as_bytes())
                );
                Global::exit(1);
            }
        };
        let stdout = result.stdout.as_slice();
        let new_version = bun_core::trim(&stdout[..stdout.len().min(128)], b" \n\r\t");

        let mut staged = Vec::with_capacity(target.len() + 5);
        staged.extend_from_slice(target);
        staged.extend_from_slice(b".new");
        let staged_z = bun_core::ZBox::from_vec(staged);
        let copied: sys::Maybe<()> = (|| {
            let input = sys::open(source_z, sys::O::RDONLY, 0)?;
            let output = match sys::open(
                staged_z.as_zstr(),
                sys::O::WRONLY | sys::O::CREAT | sys::O::TRUNC,
                0o755,
            ) {
                Ok(fd) => fd,
                Err(err) => {
                    let _ = sys::close(input);
                    return Err(err);
                }
            };
            let r = sys::copy_file(input, output);
            #[cfg(unix)]
            let r = r.and_then(|()| sys::fchmod(output, 0o755));
            let _ = sys::close(input);
            let _ = sys::close(output);
            r
        })();
        if let Err(err) = copied {
            let _ = sys::unlink(staged_z.as_zstr());
            bun_core::pretty_errorln!(
                "<r><red>error:<r> Failed to copy {} next to {}: {}",
                bstr::BStr::new(source_z.as_bytes()),
                bstr::BStr::new(target),
                bstr::BStr::new(err.name())
            );
            Global::exit(1);
        }

        #[cfg(windows)]
        {
            let mut old = Vec::with_capacity(target.len() + 5);
            old.extend_from_slice(target);
            old.extend_from_slice(b".old");
            let old_z = bun_core::ZBox::from_vec(old);
            let _ = sys::unlink(old_z.as_zstr());
            if let Err(err) = sys::rename(target_z, old_z.as_zstr()) {
                let _ = sys::unlink(staged_z.as_zstr());
                bun_core::pretty_errorln!(
                    "<r><red>error:<r> Failed to rename the running executable {}: {}",
                    bstr::BStr::new(target),
                    bstr::BStr::new(err.name())
                );
                Global::exit(1);
            }
            if let Err(err) = sys::rename(staged_z.as_zstr(), target_z) {
                let _ = sys::rename(old_z.as_zstr(), target_z);
                let _ = sys::unlink(staged_z.as_zstr());
                bun_core::pretty_errorln!(
                    "<r><red>error:<r> Failed to install {}: {}",
                    bstr::BStr::new(target),
                    bstr::BStr::new(err.name())
                );
                Global::exit(1);
            }
        }
        #[cfg(not(windows))]
        if let Err(err) = sys::rename(staged_z.as_zstr(), target_z) {
            let _ = sys::unlink(staged_z.as_zstr());
            bun_core::pretty_errorln!(
                "<r><red>error:<r> Failed to install {}: {}",
                bstr::BStr::new(target),
                bstr::BStr::new(err.name())
            );
            Global::exit(1);
        }

        bun_core::pretty_errorln!(
            "<r><green>Installed<r> Bun <b>{}<r> from {} to {}",
            bstr::BStr::new(new_version),
            bstr::BStr::new(source_z.as_bytes()),
            bstr::BStr::new(target)
        );
        Output::flush();
        Ok(())
    }

    const EXE_SUFFIX: &'static str = if cfg!(windows) { ".exe" } else { "" };

    const EXE_SUBPATH: &'static str = const_format::concatcp!(
        Version::FOLDER_NAME,
        SEP_STR,
        "bun",
        UpgradeCommand::EXE_SUFFIX
    );
    const PROFILE_EXE_SUBPATH: &'static str = const_format::concatcp!(
        Version::PROFILE_FOLDER_NAME,
        SEP_STR,
        "bun-profile",
        UpgradeCommand::EXE_SUFFIX
    );

    const MANUAL_UPGRADE_COMMAND: &'static str = {
        #[cfg(any(target_os = "linux", target_os = "android", target_os = "macos"))]
        {
            "curl -fsSL https://raw.githubusercontent.com/aphrody-labs/bun/main/scripts/aphrody/install.sh | bash"
        }
        #[cfg(target_os = "windows")]
        {
            "powershell -c \"irm https://raw.githubusercontent.com/aphrody-labs/bun/main/scripts/aphrody/install.ps1|iex\""
        }
        #[cfg(not(any(
            target_os = "linux",
            target_os = "android",
            target_os = "macos",
            target_os = "windows"
        )))]
        {
            "(no install script for this platform — see https://github.com/aphrody-labs/bun/releases)"
        }
    };

    #[cold]
    pub(crate) fn exec(ctx: Command::Context) -> crate::Result<()> {
        let args = bun_core::argv();
        if args.len() > 2 {
            let mut after_local = false;
            for arg in args.iter().skip(2) {
                let is_local_path = after_local && !strings::contains(arg, b"--");
                after_local = arg == b"--local";
                if !is_local_path && !strings::contains(arg, b"--") {
                    bun_core::pretty_error!(
                        "<r><red>error<r><d>:<r> This command updates Bun itself, and does not take package names.\n<blue>note<r><d>:<r> Use `bun update"
                    );
                    for arg_err in args.iter().skip(2) {
                        bun_core::pretty_error!(" {}", bstr::BStr::new(arg_err));
                    }
                    bun_core::pretty_errorln!("` instead.");
                    Global::exit(1);
                }
            }
        }

        if let Err(err) = Self::_exec(ctx) {
            bun_core::pretty_errorln!(
                "<r>Bun upgrade failed with error: <red><b>{}<r>\n\n<cyan>Please upgrade manually<r>:\n  <b>{}<r>\n\n",
                err.name(),
                Self::MANUAL_UPGRADE_COMMAND
            );
            Global::exit(1);
        }
        Ok(())
    }

    fn _exec(ctx: Command::Context) -> crate::Result<()> {
        // SAFETY: FileSystem::init returns the process-global singleton; valid for 'static.
        let filesystem = unsafe { &mut *fs::FileSystem::init(None)? };
        if let Some(source) = Self::local_build_arg() {
            return Self::install_local(filesystem, source);
        }

        HTTP::http_thread::init(&Default::default());
        let mut env_loader = DotEnv::Loader::init();
        env_loader.load_process()?;
        let repo: Vec<u8> = Self::repo(&env_loader).to_vec();

        let use_canary: bool = 'brk: {
            let default_use_canary = Environment::IS_CANARY;

            if default_use_canary && argv_contains(b"--stable") {
                break 'brk false;
            }

            break 'brk (env_loader.map.get(b"BUN_CANARY").unwrap_or(b"0") == b"1")
                || argv_contains(b"--canary")
                || default_use_canary;
        };

        let use_profile = argv_contains(b"--profile");

        let mut version: Version = {
            // `Progress::start` returns `&mut Node` borrowing `refresher`;
            // leak the Progress and use raw pointers so we can pass both
            // `&mut refresher` and `&mut progress` to `fetch_release`.
            let refresher: *mut Progress::Progress =
                bun_core::heap::into_raw(Box::new(Progress::Progress::default()));
            // SAFETY: refresher is a fresh leaked allocation.
            let progress: *mut Progress::Node =
                unsafe { (*refresher).start(b"Fetching version tags", 0) };

            let version = Self::fetch_release(
                &env_loader,
                // SAFETY: refresher/progress point into the same leaked allocation;
                // `fetch_release` only touches them on its error paths.
                unsafe { &mut *refresher },
                // SAFETY: progress points into the same leaked allocation (see above).
                unsafe { &mut *progress },
                use_canary,
                use_profile,
            )?;

            // SAFETY: see above.
            unsafe { (*progress).end() };
            // SAFETY: refresher is a leaked Box (process-lifetime); no other &mut is live.
            unsafe { (*refresher).refresh() };

            if !use_canary {
                let name = version.name().unwrap_or_default();
                if !Environment::IS_CANARY && version.is_current() {
                    bun_core::pretty_errorln!(
                        "<r><green>Congrats!<r> You're already on the latest version of Bun <d>(which is v{})<r>",
                        bstr::BStr::new(&name)
                    );
                    Global::exit(0);
                }

                if !Environment::IS_CANARY {
                    bun_core::pretty_errorln!(
                        "<r><b>Bun <cyan>v{}<r> is out<r>! You're on <blue>v{}<r>\n",
                        bstr::BStr::new(&name),
                        Global::display_version
                    );
                } else {
                    bun_core::pretty_errorln!(
                        "<r><b>Downgrading from Bun <blue>{}-canary<r> to Bun <cyan>v{}<r><r>\n",
                        Global::package_json_version,
                        bstr::BStr::new(&name)
                    );
                }
                Output::flush();
            }

            version
        };

        let zip_url_bytes = core::mem::take(&mut version.zip_url);
        let zip_url = URL::parse(&zip_url_bytes);
        let http_proxy = env_loader.get_http_proxy_for(&zip_url);

        {
            let refresher: *mut Progress::Progress =
                bun_core::heap::into_raw(Box::new(Progress::Progress::default()));
            // SAFETY: refresher is a fresh leaked allocation.
            let progress: *mut Progress::Node =
                unsafe { (*refresher).start(b"Downloading", version.size as usize) };
            // SAFETY: see above.
            unsafe { (*progress).unit = Progress::Unit::Bytes };
            // SAFETY: refresher is a leaked Box (process-lifetime); no other &mut is live.
            unsafe { (*refresher).refresh() };
            // Store in the process-lifetime CLI arena.
            let zip_file_buffer: &'static mut MutableString = crate::cli::cli_arena()
                .alloc(MutableString::init(version.size.max(1024) as usize)?);

            let mut async_http = Box::new(HTTP::AsyncHTTP::init_sync(
                HTTP::Method::GET,
                zip_url,
                headers::EntryList::default(),
                b"",
                b"",
                http_proxy,
                HTTP::FetchRedirect::Follow,
            ));
            // `progress` is intentionally leaked (process-lifetime), so the
            // untracked NonNull stored in `progress_node` can never dangle.
            async_http.client.progress_node =
                Some(NonNull::new(progress).expect("leaked Box is non-null"));
            async_http.client.flags.reject_unauthorized = env_loader.get_tls_reject_unauthorized();

            let response = async_http.send_sync(zip_file_buffer)?;

            Self::check_status(response.status_code())?;
            // Release the immutable borrow of `env_loader` (via `http_proxy`)
            // before the map mutations below.
            drop(async_http);

            let bytes = zip_file_buffer.slice();

            // SAFETY: refresher/progress are leaked allocations.
            unsafe { (*progress).end() };
            // SAFETY: refresher is a leaked Box (process-lifetime); no other &mut is live.
            unsafe { (*refresher).refresh() };

            if bytes.is_empty() {
                bun_core::pretty_errorln!(
                    "<r><red>error:<r> Failed to download the latest version of Bun. Received empty content"
                );
                Global::exit(1);
            }

            if version.digest.tag.is_supported() && !version.digest.verify(bytes) {
                bun_core::pretty_errorln!(
                    "<r><red>error:<r> The file downloaded from {} did not match the checksum reported by the GitHub API for this release.\n<r>note: run <b>bun upgrade<r> again to retry the download",
                    bstr::BStr::new(&zip_url_bytes)
                );
                Global::exit(1);
            }

            if !version.sums_url.is_empty() {
                let sums_url: &'static [u8] = crate::cli::cli_dupe(&version.sums_url);
                let sums_body: &'static mut MutableString =
                    crate::cli::cli_arena().alloc(MutableString::init(4096)?);
                Self::check_status(Self::http_get(
                    &env_loader,
                    sums_url,
                    false,
                    None,
                    sums_body,
                )?)?;
                let filename = if use_profile {
                    Version::PROFILE_ZIP_FILENAME
                } else {
                    Version::ZIP_FILENAME
                };
                match Version::digest_from_sums(sums_body.slice(), filename.as_bytes()) {
                    Some(digest) if digest.verify(bytes) => {}
                    Some(_) => {
                        bun_core::pretty_errorln!(
                            "<r><red>error:<r> The file downloaded from {} does not match its SHA256SUMS.txt entry.\n<r>note: run <b>bun upgrade<r> again to retry the download",
                            bstr::BStr::new(&zip_url_bytes)
                        );
                        Global::exit(1);
                    }
                    None => {
                        bun_core::pretty_errorln!(
                            "<r><red>error:<r> SHA256SUMS.txt of release {} has no entry for {}",
                            bstr::BStr::new(&version.tag),
                            filename
                        );
                        Global::exit(1);
                    }
                }
            }

            let version_name = version.name().unwrap();

            if version_name.is_empty()
                || version_name.as_slice() == b"."
                || version_name.as_slice() == b".."
                || strings::index_of_char(&version_name, 0).is_some()
                || strings::index_of_char(&version_name, b'/').is_some()
                || strings::index_of_char(&version_name, b'\\').is_some()
            {
                Output::err_generic(
                    "Refusing to use release tag as a directory name: {}",
                    (bstr::BStr::new(&version_name),),
                );
                Global::exit(1);
            }

            let save_dir_: sys::Dir = match filesystem.tmpdir() {
                Ok(d) => d,
                Err(err) => {
                    Output::err_generic("Failed to open temporary directory: {}", (err.name(),));
                    Global::exit(1);
                }
            };

            let _ = save_dir_.delete_tree(&version_name);
            let version_name_z = bun_core::ZBox::from_bytes(&version_name);
            if let Err(err) = sys::mkdirat(&save_dir_, version_name_z.as_zstr(), 0o700) {
                Output::err_generic(
                    "Failed to create temporary directory: {}",
                    (bstr::BStr::new(err.name()),),
                );
                Global::exit(1);
            }
            let save_dir_it = match save_dir_.open_at(&version_name) {
                Ok(d) => d,
                Err(err) => {
                    Output::err_generic(
                        "Failed to open temporary directory: {}",
                        (bstr::BStr::new(err.name()),),
                    );
                    Global::exit(1);
                }
            };
            let save_dir: sys::Dir = save_dir_it;

            // Reshaped for borrowck — use a stack-local PathBuffer instead of thread_local
            let mut tmpdir_path_buf = bun_paths::path_buffer_pool::get();
            let tmpdir_path = match sys::get_fd_path(save_dir.fd(), &mut tmpdir_path_buf) {
                Ok(p) => p,
                Err(err) => {
                    Output::err_generic(
                        "Failed to read temporary directory: {}",
                        (bstr::BStr::new(err.name()),),
                    );
                    Global::exit(1);
                }
            };

            let tmpdir_path_len = tmpdir_path.len();
            tmpdir_path_buf[tmpdir_path_len] = 0;
            // SAFETY: buf[tmpdir_path_len] == 0 written above
            let tmpdir_z = ZStr::from_buf(&tmpdir_path_buf[..], tmpdir_path_len);
            let _ = sys::chdir(tmpdir_z);

            // SAFETY: literal ends with NUL.
            let tmpname: &ZStr = ZStr::from_static(b"bun.zip\0");
            let exe: &[u8] = if use_profile {
                Self::PROFILE_EXE_SUBPATH.as_bytes()
            } else {
                Self::EXE_SUBPATH.as_bytes()
            };

            let zip_file = match save_dir.open_file(
                tmpname.as_bytes(),
                sys::O::WRONLY | sys::O::CREAT | sys::O::TRUNC,
                0o644,
            ) {
                Ok(f) => f,
                Err(err) => {
                    bun_core::pretty_errorln!(
                        "<r><red>error:<r> Failed to open temp file {}",
                        bstr::BStr::new(err.name())
                    );
                    Global::exit(1);
                }
            };

            {
                if let Err(err) = zip_file.write_all(bytes) {
                    let _ = sys::unlinkat(&save_dir, tmpname);
                    bun_core::pretty_errorln!(
                        "<r><red>error:<r> Failed to write to temp file {}",
                        bstr::BStr::new(err.name())
                    );
                    Global::exit(1);
                }
                let _ = zip_file.close();
            }

            {
                scopeguard::defer! {
                    let _ = sys::unlinkat(&save_dir, tmpname);
                }

                #[cfg(unix)]
                {
                    let mut unzip_path_buf = bun_paths::path_buffer_pool::get();
                    let Some(unzip_exe) = which(
                        &mut unzip_path_buf,
                        env_loader.map.get(b"PATH").unwrap_or(b""),
                        filesystem.top_level_dir,
                        b"unzip",
                    ) else {
                        let _ = sys::unlinkat(&save_dir, tmpname);
                        bun_core::pretty_errorln!(
                            "<r><red>error:<r> Failed to locate \"unzip\" in PATH. bun upgrade needs \"unzip\" to work."
                        );
                        Global::exit(1);
                    };

                    // We could just embed libz2
                    // however, we want to be sure that xattrs are preserved
                    // xattrs are used for codesigning
                    // it'd be easy to mess that up
                    let unzip_argv: [&[u8]; 4] =
                        [unzip_exe.as_bytes(), b"-q", b"-o", tmpname.as_bytes()];

                    let unzip_result = match spawn_sync::spawn(&spawn_sync::Options {
                        argv: build_argv(&unzip_argv),
                        envp: None,
                        cwd: Box::<[u8]>::from(&tmpdir_path_buf[..tmpdir_path_len]),
                        stdin: spawn_sync::SyncStdio::Inherit,
                        stdout: spawn_sync::SyncStdio::Inherit,
                        stderr: spawn_sync::SyncStdio::Inherit,
                        ..Default::default()
                    }) {
                        Ok(Ok(r)) => r,
                        Ok(Err(err)) => {
                            let _ = sys::unlinkat(&save_dir, tmpname);
                            bun_core::pretty_errorln!(
                                "<r><red>error:<r> Failed to spawn unzip due to {}.",
                                bstr::BStr::new(err.name())
                            );
                            Global::exit(1);
                        }
                        Err(err) => {
                            let _ = sys::unlinkat(&save_dir, tmpname);
                            bun_core::pretty_errorln!(
                                "<r><red>error:<r> Failed to spawn unzip due to {}.",
                                err.name()
                            );
                            Global::exit(1);
                        }
                    };

                    match unzip_result.status {
                        Status::Exited(e) if e.code == 0 => {}
                        Status::Exited(e) => {
                            bun_core::pretty_errorln!(
                                "<r><red>Unzip failed<r> (exit code: {})",
                                e.code
                            );
                            let _ = sys::unlinkat(&save_dir, tmpname);
                            Global::exit(1);
                        }
                        other => {
                            bun_core::pretty_errorln!("<r><red>Unzip failed<r> ({})", other);
                            let _ = sys::unlinkat(&save_dir, tmpname);
                            Global::exit(1);
                        }
                    }
                }
                #[cfg(windows)]
                {
                    // Run a powershell script to unzip the file
                    let mut unzip_script = Vec::new();
                    write!(
                        &mut unzip_script,
                        "$global:ProgressPreference='SilentlyContinue';Expand-Archive -Path \"{}\" \"{}\" -Force",
                        bun_fmt::escape_powershell(bstr::BStr::new(tmpname.as_bytes())),
                        bun_fmt::escape_powershell(bstr::BStr::new(&tmpdir_path_buf[..tmpdir_path_len])),
                    )
                    .expect("oom");

                    let mut buf = bun_paths::path_buffer_pool::get();
                    // Separate fallback buffer — borrowck holds `buf` for the lifetime
                    // of `which`'s returned `Option<&ZStr>` even across the `None` arm.
                    let mut buf2 = bun_paths::path_buffer_pool::get();
                    let powershell_path: &ZStr = match which(
                        &mut buf,
                        bun_core::env_var::PATH.get().unwrap_or(b""),
                        b"",
                        b"powershell",
                    ) {
                        Some(p) => p,
                        None => {
                            let system_root = bun_core::env_var::SYSTEMROOT
                                .get()
                                .unwrap_or(b"C:\\Windows");
                            let hardcoded_system_powershell =
                                bun_paths::join_abs_string_buf_z::<bun_paths::platform::Windows>(
                                    system_root,
                                    &mut buf2[..],
                                    &[
                                        system_root,
                                        b"System32\\WindowsPowerShell\\v1.0\\powershell.exe",
                                    ],
                                );
                            if !sys::exists(hardcoded_system_powershell.as_bytes()) {
                                bun_core::pretty_errorln!(
                                    "<r><red>error:<r> Failed to unzip {} due to PowerShell not being installed.",
                                    bstr::BStr::new(tmpname.as_bytes())
                                );
                                Global::exit(1);
                            }
                            hardcoded_system_powershell
                        }
                    };

                    let unzip_argv: [&[u8]; 6] = [
                        powershell_path.as_bytes(),
                        b"-NoProfile",
                        b"-ExecutionPolicy",
                        b"Bypass",
                        b"-Command",
                        &unzip_script,
                    ];

                    let spawn_res = spawn_sync::spawn(&spawn_sync::Options {
                        argv: build_argv(&unzip_argv),
                        envp: None,
                        cwd: Box::<[u8]>::from(&tmpdir_path_buf[..tmpdir_path_len]),
                        stderr: spawn_sync::SyncStdio::Inherit,
                        stdout: spawn_sync::SyncStdio::Inherit,
                        stdin: spawn_sync::SyncStdio::Inherit,
                        windows: spawn_windows_options(),
                        ..Default::default()
                    });
                    let spawn_res = match spawn_res {
                        Ok(r) => r,
                        Err(err) => {
                            bun_core::pretty_errorln!(
                                "<r><red>error:<r> Failed to spawn Expand-Archive on {} due to error {}",
                                bstr::BStr::new(tmpname.as_bytes()),
                                err.name()
                            );
                            Global::exit(1);
                        }
                    };
                    if let Err(err) = spawn_res {
                        bun_core::pretty_errorln!(
                            "<r><red>error:<r> Failed to run Expand-Archive on {} due to error {}",
                            bstr::BStr::new(tmpname.as_bytes()),
                            bstr::BStr::new(err.name())
                        );
                        Global::exit(1);
                    }
                }
            }
            {
                let verify_argv: [&[u8]; 2] = [
                    exe,
                    if use_canary {
                        b"--revision"
                    } else {
                        b"--version"
                    },
                ];

                // Diagnostic output is capped at 512 bytes by slicing the captured
                // stdout below (`..min(len, 512)`).
                let result: spawn_sync::Result = 'spawn: {
                    let spawned = spawn_sync::spawn(&spawn_sync::Options {
                        argv: build_argv(&verify_argv),
                        envp: None,
                        cwd: Box::<[u8]>::from(&tmpdir_path_buf[..tmpdir_path_len]),
                        stdout: spawn_sync::SyncStdio::Buffer,
                        stderr: spawn_sync::SyncStdio::Ignore,
                        stdin: spawn_sync::SyncStdio::Ignore,
                        #[cfg(windows)]
                        windows: spawn_windows_options(),
                        ..Default::default()
                    });
                    // Any spawn-time failure (allocator/OOM surfaces as
                    // `crate::Error`, posix_spawn surfaces as
                    // `bun_sys::Error`) → same diagnostic + cleanup.
                    let err_name: &'static [u8] = match spawned {
                        Ok(Ok(r)) => break 'spawn r,
                        Ok(Err(sys_err)) => sys_err.name(),
                        Err(core_err) => core_err.name().as_bytes(),
                    };

                    scopeguard::defer! {
                        let _ = save_dir_.delete_tree(&version_name);
                    }

                    // The spawn path may report a missing file as either
                    // `FileNotFound` or `ENOENT`; accept both.
                    if err_name == b"FileNotFound" || err_name == b"ENOENT" {
                        // We already chdir'd to tmpdir, so the relative `exe` path works.
                        if sys::exists(exe) {
                            // On systems like NixOS, the FileNotFound is actually the system-wide linker,
                            // as they do not have one (most systems have it at a known path). This is how
                            // ChildProcess returns FileNotFound despite the actual
                            //
                            // In these cases, prebuilt binaries from GitHub will never work without
                            // extra patching, so we will print a message deferring them to their system
                            // package manager.
                            bun_core::pretty_errorln!(
                                "<r><red>error<r><d>:<r> 'bun upgrade' is unsupported on systems without ld\n\nYou are likely on an immutable system such as NixOS, where dynamic\nlibraries are stored in a global cache.\n\nPlease use your system's package manager to properly upgrade bun.\n"
                            );
                            Global::exit(1);
                        }
                    }

                    bun_core::pretty_errorln!(
                        "<r><red>error<r><d>:<r> Failed to verify Bun (code: {})<r>",
                        bstr::BStr::new(err_name)
                    );
                    Global::exit(1);
                };

                if !result.status.is_ok() {
                    let _ = save_dir_.delete_tree(&version_name);
                    let exit_code: u32 = match &result.status {
                        Status::Exited(e) => u32::from(e.code),
                        Status::Signaled(sig) => 128 + u32::from(*sig),
                        _ => 1,
                    };
                    bun_core::pretty_errorln!(
                        "<r><red>error<r><d>:<r> failed to verify Bun<r> (exit code: {})",
                        exit_code
                    );
                    Global::exit(1);
                }

                // It should run successfully
                // but we don't care about the version number if we're doing a canary build
                if use_canary {
                    let version_string = result.stdout.as_slice();
                    if let Some(i) = strings::index_of_char(version_string, b'+') {
                        version.tag = version_string[(i as usize + 1)..].into();
                    }
                } else {
                    let mut version_string = result.stdout.as_slice();
                    if let Some(i) = strings::index_of_char(version_string, b' ') {
                        version_string = &version_string[..i as usize];
                    }

                    let trimmed = bun_core::trim(version_string, b" \n\r\t");
                    if trimmed != version_name.as_slice() {
                        let _ = save_dir_.delete_tree(&version_name);

                        bun_core::pretty_errorln!(
                            "<r><red>error<r>: The downloaded version of Bun (<red>{}<r>) doesn't match the expected version (<b>{}<r>)<r>. Cancelled upgrade",
                            bstr::BStr::new(&version_string[..version_string.len().min(512)]),
                            bstr::BStr::new(&version_name)
                        );
                        Global::exit(1);
                    }
                }
            }

            // Keep the `&ZStr` form for Windows `sys::rename` (needs
            // a NUL-terminated path); `destination_executable` (bytes view) is
            // used everywhere else.
            let destination_executable_z: &ZStr = bun_core::self_exe_path()
                .map_err(|_| crate::Error::UpgradeFailedMissingExecutable)?;
            let destination_executable: &[u8] = destination_executable_z.as_bytes();
            if destination_executable.len() >= bun_paths::MAX_PATH_BYTES {
                return Err(crate::Error::PathTooLong);
            }
            // Reshaped for borrowck — use stack-local buffer.
            // Stacked Borrows: take ONE `*mut u8` over the buffer up front and
            // route every read/write through it. Indexing the `PathBuffer`
            // directly (via Deref/DerefMut) would materialize a fresh `&[u8]`
            // or `&mut [u8]` over the *whole* array, retagging it and
            // invalidating the raw-pointer-derived `&ZStr` views below. The
            // single `buf_ptr` is the shared provenance root.
            let mut current_executable_buf = bun_paths::path_buffer_pool::get();
            let buf_ptr: *mut u8 = current_executable_buf.as_mut_ptr();
            // SAFETY: `buf_ptr` covers `MAX_PATH_BYTES`; `destination_executable`
            // came from `self_exe_path()` which is bounded by that.
            unsafe {
                core::ptr::copy_nonoverlapping(
                    destination_executable.as_ptr(),
                    buf_ptr,
                    destination_executable.len(),
                );
                *buf_ptr.add(destination_executable.len()) = 0;
            }

            let target_filename_ = bun_paths::basename(destination_executable);
            // SAFETY: buf[destination_executable.len()] == 0 written above; the
            // view is derived from `buf_ptr` so later disjoint writes through
            // `buf_ptr` (at `target_dir_len`, outside this range) don't pop it.
            let target_filename = unsafe {
                ZStr::from_raw(
                    buf_ptr.add(destination_executable.len() - target_filename_.len()),
                    target_filename_.len(),
                )
            };
            let target_dir_ = bun_core::dirname(destination_executable)
                .ok_or(crate::Error::UpgradeFailedBecauseOfMissingExecutableDir)?;
            // safe because the slash will no longer be in use
            let target_dir_len = target_dir_.len();
            // SAFETY: in-bounds; write is at the separator byte between dirname
            // and basename, disjoint from both `&ZStr` views' ranges.
            unsafe { *buf_ptr.add(target_dir_len) = 0 };
            // SAFETY: buf[target_dir_len]==0 (just written). Derived from
            // `buf_ptr`; the Windows block below toggles the byte at
            // `target_dir_len` (outside `[0, target_dir_len)`) through the same
            // raw pointer, so this view's provenance stays valid across those
            // writes. Each mutation re-establishes the NUL before
            // `target_dirname` is read again.
            let target_dirname = unsafe { ZStr::from_raw(buf_ptr, target_dir_len) };
            let target_dir_it = match sys::Dir::open(target_dirname.as_bytes()) {
                Ok(d) => d,
                Err(err) => {
                    let _ = save_dir_.delete_tree(&version_name);
                    bun_core::pretty_errorln!(
                        "<r><red>error:<r> Failed to open Bun's install directory {}",
                        bstr::BStr::new(err.name())
                    );
                    Global::exit(1);
                }
            };
            let target_dir: sys::Dir = target_dir_it;

            // `move_file_z` wants `&ZStr`; pre-compute a NUL-terminated
            // copy of `exe`.
            let mut exe_z_buf = bun_paths::path_buffer_pool::get();
            exe_z_buf[..exe.len()].copy_from_slice(exe);
            exe_z_buf[exe.len()] = 0;
            // SAFETY: NUL written above.
            let exe_z: &ZStr = ZStr::from_buf(&exe_z_buf[..], exe.len());

            if use_canary {
                // Check if the versions are the same
                let target_stat = match sys::fstatat(&target_dir, target_filename) {
                    Ok(s) => s,
                    Err(err) => {
                        let _ = save_dir_.delete_tree(&version_name);
                        bun_core::pretty_errorln!(
                            "<r><red>error:<r> {} while trying to stat target {} ",
                            bstr::BStr::new(err.name()),
                            bstr::BStr::new(target_filename.as_bytes())
                        );
                        Global::exit(1);
                    }
                };

                let dest_stat = match sys::fstatat(&save_dir, exe_z) {
                    Ok(s) => s,
                    Err(err) => {
                        let _ = save_dir_.delete_tree(&version_name);
                        bun_core::pretty_errorln!(
                            "<r><red>error:<r> {} while trying to stat source {}",
                            bstr::BStr::new(err.name()),
                            bstr::BStr::new(exe)
                        );
                        Global::exit(1);
                    }
                };

                if target_stat.st_size == dest_stat.st_size && target_stat.st_size > 0 {
                    let mut input_buf = vec![0u8; target_stat.st_size as usize];

                    let target_hash = hash(
                        match target_dir
                            .open_file(target_filename.as_bytes(), sys::O::RDONLY, 0)
                            .and_then(|f| {
                                let n = f.read_all(&mut input_buf);
                                let _ = f.close(); // close error is non-actionable
                                n
                            }) {
                            Ok(n) => &input_buf[..n],
                            Err(err) => {
                                let _ = save_dir_.delete_tree(&version_name);
                                bun_core::pretty_errorln!(
                                    "<r><red>error:<r> Failed to read target bun {}",
                                    bstr::BStr::new(err.name())
                                );
                                Global::exit(1);
                            }
                        },
                    );

                    let source_hash = hash(
                        match save_dir.open_file(exe, sys::O::RDONLY, 0).and_then(|f| {
                            let n = f.read_all(&mut input_buf);
                            let _ = f.close(); // close error is non-actionable
                            n
                        }) {
                            Ok(n) => &input_buf[..n],
                            Err(err) => {
                                let _ = save_dir_.delete_tree(&version_name);
                                bun_core::pretty_errorln!(
                                    "<r><red>error:<r> Failed to read source bun {}",
                                    bstr::BStr::new(err.name())
                                );
                                Global::exit(1);
                            }
                        },
                    );

                    if target_hash == source_hash {
                        let _ = save_dir_.delete_tree(&version_name);
                        bun_core::pretty_errorln!(
                            "<r><green>Congrats!<r> You're already on the latest <b>canary<r><green> build of Bun\n\nTo downgrade to the latest stable release, run <b><cyan>bun upgrade --stable<r>\n"
                        );
                        Global::exit(0);
                    }
                }
            }

            #[cfg(windows)]
            let mut outdated_filename: Option<bun_core::ZBox> = None;
            #[cfg(not(windows))]
            let outdated_filename: Option<()> = None;

            if env_loader.map.get(b"BUN_DRY_RUN").is_none() {
                #[cfg(windows)]
                {
                    // On Windows, we cannot replace the running executable directly.
                    // we rename the old executable to a temporary name, and then move the new executable to the old name.
                    // This is because Windows locks the executable while it's running.
                    // SAFETY: see `buf_ptr` note above — write through the shared
                    // raw provenance root, not via DerefMut (which would retag
                    // the whole buffer and invalidate `target_filename`/`target_dirname`).
                    unsafe { *buf_ptr.add(target_dir_len) = b'\\' };
                    let mut buf = Vec::new();
                    write!(
                        &mut buf,
                        "{}\\{}.old",
                        bstr::BStr::new(target_dirname.as_bytes()),
                        bstr::BStr::new(target_filename.as_bytes())
                    )
                    .expect("oom");
                    // Owned NUL-terminated string.
                    outdated_filename = Some(bun_core::ZBox::from_vec(buf));
                    let _ = sys::unlink(outdated_filename.as_deref().unwrap());
                    if let Err(err) = sys::rename(
                        destination_executable_z,
                        outdated_filename.as_deref().unwrap(),
                    ) {
                        let _ = save_dir_.delete_tree(&version_name);
                        bun_core::pretty_errorln!(
                            "<r><red>error:<r> Failed to rename current executable {}",
                            bstr::BStr::new(err.name())
                        );
                        Global::exit(1);
                    }
                    // SAFETY: restore NUL via `buf_ptr` (see aliasing note above).
                    unsafe { *buf_ptr.add(target_dir_len) = 0 };
                }

                if let Err(err) =
                    sys::move_file_z(save_dir.fd(), exe_z, target_dir.fd(), target_filename)
                {
                    scopeguard::defer! {
                        let _ = save_dir_.delete_tree(&version_name);
                    }

                    #[cfg(windows)]
                    {
                        // Attempt to restore the old executable. If this fails, the user will be left without a working copy of bun.
                        if sys::rename(
                            outdated_filename.as_deref().unwrap(),
                            destination_executable_z,
                        )
                        .is_err()
                        {
                            Output::err_generic(
                                "Failed to move new version of Bun to {} due to {}",
                                (
                                    bstr::BStr::new(destination_executable),
                                    bstr::BStr::new(err.name()),
                                ),
                            );
                            Output::err_generic(
                                "Failed to restore the working copy of Bun. The installation is now corrupt.\n\nPlease reinstall Bun manually with the following command:\n   {}\n",
                                (Self::MANUAL_UPGRADE_COMMAND,),
                            );
                            Global::exit(1);
                        }
                    }

                    Output::err_generic(
                        "Failed to move new version of Bun to {} to {}\n\nPlease reinstall Bun manually with the following command:\n   {}\n",
                        (
                            bstr::BStr::new(destination_executable),
                            bstr::BStr::new(err.name()),
                            Self::MANUAL_UPGRADE_COMMAND,
                        ),
                    );
                    Global::exit(1);
                }
            }

            // Ensure completions are up to date.
            {
                let completions_argv: [&[u8]; 2] = [target_filename.as_bytes(), b"completions"];

                let _ = env_loader.map.put(b"IS_BUN_AUTO_UPDATE", b"true");
                // `spawn_sync` takes the C-style `[*:null]?[*:0]const u8` envp
                // directly, so build it from the DotEnv map. Output is buffered and
                // silently dropped along with any spawn error.
                if let Ok(envp) = env_loader.map.create_null_delimited_env_map() {
                    let _ = spawn_sync::spawn(&spawn_sync::Options {
                        argv: build_argv(&completions_argv),
                        envp: Some(envp.as_ptr().cast::<*const c_char>()),
                        cwd: Box::<[u8]>::from(target_dirname.as_bytes()),
                        stdout: spawn_sync::SyncStdio::Buffer,
                        stderr: spawn_sync::SyncStdio::Buffer,
                        stdin: spawn_sync::SyncStdio::Ignore,
                        #[cfg(windows)]
                        windows: spawn_windows_options(),
                        ..Default::default()
                    });
                }

                // The agent plugin carried by the new executable replaces the installed one, if any
                // (`bun agent-plugin install --update` does nothing when it was never installed).
                let agent_plugin_argv: [&[u8]; 5] = [
                    target_filename.as_bytes(),
                    b"agent-plugin",
                    b"install",
                    b"--update",
                    b"--quiet",
                ];
                if let Ok(envp) = env_loader.map.create_null_delimited_env_map() {
                    let _ = spawn_sync::spawn(&spawn_sync::Options {
                        argv: build_argv(&agent_plugin_argv),
                        envp: Some(envp.as_ptr().cast::<*const c_char>()),
                        cwd: Box::<[u8]>::from(target_dirname.as_bytes()),
                        stdout: spawn_sync::SyncStdio::Buffer,
                        stderr: spawn_sync::SyncStdio::Buffer,
                        stdin: spawn_sync::SyncStdio::Ignore,
                        #[cfg(windows)]
                        windows: spawn_windows_options(),
                        ..Default::default()
                    });
                }
            }

            Output::print_start_end(ctx.start_time, bun_core::time::nano_timestamp());

            if use_canary {
                bun_core::pretty_errorln!(
                    "<r> Upgraded.\n\n<b><green>Welcome to Bun's latest canary build!<r>\n\nReport any bugs:\n\n    https://github.com/{}/issues\n\nChangelog:\n\n    https://github.com/{}/compare/{}...{}\n",
                    bstr::BStr::new(&repo),
                    bstr::BStr::new(&repo),
                    Environment::GIT_SHA_SHORT,
                    bstr::BStr::new(&*version.tag)
                );
            } else {
                let current_tag = Version::CURRENT_TAG;

                bun_core::pretty_errorln!(
                    "<r> Upgraded.\n\n<b><green>Welcome to Bun v{}!<r>\n\nRelease notes:\n\n    <cyan>https://github.com/{}/releases/tag/{}<r>\n\nReport any bugs:\n\n    https://github.com/{}/issues\n\nCommit log:\n\n    https://github.com/{}/compare/{}...{}\n",
                    bstr::BStr::new(&version_name),
                    bstr::BStr::new(&repo),
                    bstr::BStr::new(&*version.tag),
                    bstr::BStr::new(&repo),
                    bstr::BStr::new(&repo),
                    current_tag,
                    bstr::BStr::new(&*version.tag)
                );
            }

            Output::flush();

            // On Windows the running executable cannot be deleted; `<exe>.old` is removed by the
            // next launch (`bin_entry::remove_replaced_executable`).
            let _ = outdated_filename;
        }

        Ok(())
    }
}

// ──────────────────────────────────────────────────────────────────────────

pub(crate) mod upgrade_js_bindings {
    use super::*;

    // Process-global, not threadlocal: if open/close are invoked from different
    // threads (main vs worker VM) a `thread_local!` would make the close see
    // `None` and leak the HANDLE. Use a `RacyCell`; access is test-only and
    // effectively single-threaded.
    #[cfg(windows)]
    static TEMPDIR_FD: bun_core::RacyCell<Option<sys::Fd>> = bun_core::RacyCell::new(None);

    pub(crate) fn generate(global: &JSGlobalObject) -> JSValue {
        let obj = JSValue::create_empty_object(global, 2);
        obj.put(
            global,
            b"openTempDirWithoutSharingDelete",
            jsc::JSFunction::create(
                global,
                "openTempDirWithoutSharingDelete",
                // `#[bun_jsc::host_fn]` emits the C-ABI shim with a
                // `__jsc_host_` prefix.
                __jsc_host_js_open_temp_dir_without_sharing_delete,
                1,
                Default::default(),
            ),
        );
        obj.put(
            global,
            b"closeTempDirHandle",
            jsc::JSFunction::create(
                global,
                "closeTempDirHandle",
                __jsc_host_js_close_temp_dir_handle,
                1,
                Default::default(),
            ),
        );
        obj
    }

    /// For testing upgrades when the temp directory has an open handle without FILE_SHARE_DELETE.
    /// Windows only
    #[bun_jsc::host_fn]
    fn js_open_temp_dir_without_sharing_delete(
        _global: &JSGlobalObject,
        _frame: &CallFrame,
    ) -> JsResult<JSValue> {
        #[cfg(not(windows))]
        {
            return Ok(JSValue::UNDEFINED);
        }
        #[cfg(windows)]
        {
            use sys::windows as w;

            let mut buf = bun_paths::w_path_buffer_pool::get();
            let tmpdir_path = fs::RealFS::get_default_temp_dir();
            let mut wtmp = bun_paths::w_path_buffer_pool::get();
            let tmpdir_w = bun_core::convert_utf8_to_utf16_in_buffer(&mut wtmp[..], tmpdir_path);
            let path = match sys::normalize_path_windows(sys::Fd::INVALID, tmpdir_w, &mut buf[..]) {
                sys::Result::Err(_) => return Ok(JSValue::UNDEFINED),
                sys::Result::Ok(norm) => norm,
            };

            let path_len_bytes: u16 = (path.len() * 2) as u16;
            let mut nt_name = w::UNICODE_STRING {
                Length: path_len_bytes,
                MaximumLength: path_len_bytes,
                Buffer: path.as_ptr().cast_mut().cast::<u16>(),
            };

            let mut attr = w::OBJECT_ATTRIBUTES {
                Length: core::mem::size_of::<w::OBJECT_ATTRIBUTES>() as u32,
                RootDirectory: core::ptr::null_mut(),
                Attributes: 0,
                ObjectName: &mut nt_name,
                SecurityDescriptor: core::ptr::null_mut(),
                SecurityQualityOfService: core::ptr::null_mut(),
            };

            let flags: u32 = w::STANDARD_RIGHTS_READ
                | w::FILE_READ_ATTRIBUTES
                | w::FILE_READ_EA
                | w::SYNCHRONIZE
                | w::FILE_TRAVERSE;

            let mut fd: w::HANDLE = w::INVALID_HANDLE_VALUE;
            let mut io: w::IO_STATUS_BLOCK = bun_core::ffi::zeroed();

            // SAFETY: FFI call to NtCreateFile with valid pointers
            let rc = unsafe {
                w::ntdll::NtCreateFile(
                    &mut fd,
                    flags,
                    &mut attr,
                    &mut io,
                    core::ptr::null_mut(),
                    0,
                    w::FILE_SHARE_READ | w::FILE_SHARE_WRITE,
                    w::FILE_OPEN,
                    w::FILE_DIRECTORY_FILE
                        | w::FILE_SYNCHRONOUS_IO_NONALERT
                        | w::FILE_OPEN_FOR_BACKUP_INTENT,
                    core::ptr::null_mut(),
                    0,
                )
            };

            match sys::windows::Win32Error::from_nt_status(rc) {
                sys::windows::Win32Error::SUCCESS => {
                    // System-kind handle on Windows.
                    // SAFETY: test-only helper; access is single-threaded (JS thread).
                    unsafe {
                        TEMPDIR_FD.write(Some(sys::Fd::from_system(fd)));
                    }
                }
                _ => {}
            }

            Ok(JSValue::UNDEFINED)
        }
    }

    #[bun_jsc::host_fn]
    fn js_close_temp_dir_handle(_global: &JSGlobalObject, _frame: &CallFrame) -> JsResult<JSValue> {
        #[cfg(not(windows))]
        {
            return Ok(JSValue::UNDEFINED);
        }
        #[cfg(windows)]
        {
            use bun_sys::FdExt as _;
            // SAFETY: test-only helper; access is single-threaded (JS thread).
            // Consume (`take`) the stored fd so a repeat call cannot
            // `CloseHandle` a stale, possibly-reissued HANDLE value.
            if let Some(fd) = unsafe { core::mem::take(&mut *TEMPDIR_FD.get()) } {
                fd.close();
            }

            Ok(JSValue::UNDEFINED)
        }
    }
}
