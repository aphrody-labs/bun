//! Installer selection and silent installation for winget manifests.
//!
//! - `portable` and `zip` (nested `portable`) are extracted under the install root,
//!   recorded file by file, and get command shims in the bin dir.
//! - `msi`/`wix`/`burn`/`inno`/`nullsoft`/`exe`/`msix` run the native installer silently.
//!   Anything that needs administrator rights is refused unless the process is
//!   elevated or `BUN_SYSTEM_ELEVATE=1`.

use super::super::value::Value;
use super::super::{Ctx, Error, InstallKind, InstallRoot, InstalledRecord, LockEntry, Result, SourceKind};

use aphrody_pkg_system::winget::{
    self as pure, Installer as Picked, default_extension, extension_of, file_name_of, needs_elevation, stem,
};

pub(super) fn host_arch(ctx: &Ctx<'_>) -> String {
    if let Some(a) = &ctx.options.arch {
        return a.to_ascii_lowercase();
    }
    pure::default_arch().to_owned()
}

fn is_elevated() -> bool {
    #[cfg(windows)]
    {
        bun_sys::windows::is_elevated()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn may_elevate(ctx: &Ctx<'_>) -> bool {
    ctx.options.elevate || is_elevated()
}

/// Picks the installer winget would: matching architecture first, then the
/// requested (or user) scope, then the requested locale.
fn pick<'a>(ctx: &Ctx<'_>, manifest: &'a Value, id: &str) -> Result<Picked<'a>> {
    let prefs = pure::Preferences {
        arch: host_arch(ctx),
        scope: ctx.options.scope.clone(),
        locale: ctx.options.locale.clone(),
        may_elevate: may_elevate(ctx),
    };
    Ok(pure::pick(manifest, id, &prefs)?)
}

fn path_str(p: &[u8]) -> String {
    super::super::lossy(p)
}

pub(super) fn install(ctx: &Ctx<'_>, entry: &LockEntry, manifest: &Value, root: &InstallRoot) -> Result<InstalledRecord> {
    let p = pick(ctx, manifest, &entry.id)?;
    let ty = p.installer_type();
    let url = p
        .str("InstallerUrl")
        .ok_or_else(|| Error::Parse(format!("winget: {} installer has no InstallerUrl", entry.id)))?;
    let sha = p
        .str("InstallerSha256")
        .ok_or_else(|| Error::Parse(format!("winget: {} installer has no InstallerSha256", entry.id)))?;
    let name = file_name_of(url);
    let ext = extension_of(name).unwrap_or_else(|| default_extension(&ty));
    let what = format!("winget installer {}@{}", entry.id, entry.version);
    let (bytes, cached_path) = ctx.fetch_verified(SourceKind::Winget, &what, url, sha, ext)?;

    let mut rec = InstalledRecord::new(SourceKind::Winget, &entry.id, &entry.version, &entry.hash, InstallKind::Files);
    rec.meta.insert("installerType".to_owned(), ty.clone());
    rec.meta.insert("installerUrl".to_owned(), url.to_owned());
    if let Some(a) = p.str("Architecture") {
        rec.meta.insert("architecture".to_owned(), a.to_owned());
    }
    if let Some(s) = p.str("Scope") {
        rec.meta.insert("scope".to_owned(), s.to_owned());
    }

    let pkg_dir = root.package_dir(SourceKind::Winget, &entry.id);
    match ty.as_str() {
        "portable" => {
            let cmd = p.portable_command(name);
            let file = format!("{cmd}{}", if ext.eq_ignore_ascii_case(".exe") { ".exe" } else { ext });
            super::super::fs::remove_tree(&pkg_dir);
            let target = super::super::join(&pkg_dir, &[file.as_bytes()]);
            super::super::fs::write(&target, &bytes)?;
            rec.files.push(path_str(&target));
            rec.files.push(path_str(&pkg_dir));
            rec.bins.extend(shim(root, &cmd, &target)?);
            Ok(rec)
        }
        "zip" => {
            let nested = p.lower("NestedInstallerType");
            super::super::fs::remove_tree(&pkg_dir);
            let files = extract_zip(&bytes, &what, &pkg_dir)?;
            rec.files.extend(files.iter().map(|f| path_str(f)));
            rec.files.push(path_str(&pkg_dir));
            let nested_files = p.nested_files();
            if nested == "portable" || nested.is_empty() {
                for (rel, alias) in &nested_files {
                    let rel = super::super::archive::safe_relative(rel.as_bytes())
                        .ok_or_else(|| Error::Parse(format!("winget: unsafe NestedInstallerFiles path \"{rel}\"")))?;
                    let target = super::super::join(&pkg_dir, &[&rel]);
                    let cmd = alias.clone().unwrap_or_else(|| stem(&path_str(&rel)).to_owned());
                    rec.bins.extend(shim(root, &cmd, &target)?);
                }
                return Ok(rec);
            }
            let (rel, _) = nested_files
                .first()
                .ok_or_else(|| Error::Parse(format!("winget: {} zip has no NestedInstallerFiles", entry.id)))?;
            let rel = super::super::archive::safe_relative(rel.as_bytes())
                .ok_or_else(|| Error::Parse(format!("winget: unsafe NestedInstallerFiles path \"{rel}\"")))?;
            let inner = super::super::join(&pkg_dir, &[&rel]);
            rec.meta.insert("nestedInstallerType".to_owned(), nested.clone());
            run_native(ctx, entry, &p, &nested, &inner, &mut rec)?;
            Ok(rec)
        }
        _ => {
            run_native(ctx, entry, &p, &ty, &cached_path, &mut rec)?;
            Ok(rec)
        }
    }
}

fn extract_zip(bytes: &[u8], what: &str, dir: &[u8]) -> Result<Vec<Vec<u8>>> {
    let mut files = Vec::new();
    let mut dirs = Vec::new();
    super::super::archive::for_each(bytes, what, &mut |item| {
        let rel = super::super::archive::safe_relative(item.path)
            .ok_or_else(|| Error::Parse(format!("{what}: unsafe entry path \"{}\"", path_str(item.path))))?;
        let path = super::super::join(dir, &[&rel]);
        if item.is_dir {
            super::super::fs::mkdir_p(&path)?;
            dirs.push(path);
        } else {
            super::super::fs::write(&path, &item.data)?;
            files.push(path);
        }
        Ok(true)
    })?;
    // Deepest directories last so `remove` can delete in reverse.
    dirs.sort_by_key(|d| core::cmp::Reverse(d.len()));
    files.extend(dirs.into_iter().rev());
    Ok(files)
}

/// Creates `<bin>/<cmd>` launching `target`; returns the shim paths.
fn shim(root: &InstallRoot, cmd: &str, target: &[u8]) -> Result<Vec<String>> {
    if cmd.is_empty() || bun_core::strings::index_of_any(cmd.as_bytes(), b"/\\:").is_some() {
        return Err(Error::Parse(format!("winget: invalid command alias \"{cmd}\"")));
    }
    #[cfg(windows)]
    {
        windows_shim(root, cmd, target)
    }
    #[cfg(not(windows))]
    {
        let _ = (root, target);
        Ok(Vec::new())
    }
}

#[cfg(windows)]
fn windows_shim(root: &InstallRoot, cmd: &str, target: &[u8]) -> Result<Vec<String>> {
    use crate::windows_shim::BinLinkingShim;

    // The shim resolves `bin_path` against the parent of the bin dir.
    let base = super::super::fs::parent(&root.bin_dir);
    let rel = target
        .strip_prefix(base)
        .and_then(|r| r.strip_prefix(b"\\").or_else(|| r.strip_prefix(b"/")))
        .ok_or_else(|| Error::Io(format!("winget: {} is outside {}", path_str(target), path_str(base))))?;
    let rel_w: Vec<u16> = path_str(rel)
        .encode_utf16()
        .map(|c| if c == u16::from(b'/') { u16::from(b'\\') } else { c })
        .collect();
    let shim = BinLinkingShim {
        bin_path: &rel_w,
        shebang: None,
    };
    #[repr(align(2))]
    struct Buf([u8; 8192]);
    let mut buf = Buf([0u8; 8192]);
    let len = shim.encoded_length();
    if len > buf.0.len() {
        return Err(Error::Io(format!("winget: shim path too long for {cmd}")));
    }
    shim.encode_into(&mut buf.0[..len])
        .map_err(|_| Error::Io(format!("winget: could not encode the shim for {cmd}")))?;
    let bunx = super::super::join(&root.bin_dir, &[format!("{cmd}.bunx").as_bytes()]);
    let exe = super::super::join(&root.bin_dir, &[format!("{cmd}.exe").as_bytes()]);
    super::super::fs::write(&bunx, &buf.0[..len])?;
    super::super::fs::write(&exe, crate::windows_shim::embedded_executable_data())?;
    Ok(vec![path_str(&bunx), path_str(&exe)])
}

fn run_native(
    ctx: &Ctx<'_>,
    entry: &LockEntry,
    p: &Picked<'_>,
    ty: &str,
    path: &[u8],
    rec: &mut InstalledRecord,
) -> Result<()> {
    if !cfg!(windows) {
        return Err(Error::Unsupported(format!("winget: {} installers only run on Windows", ty)));
    }
    if needs_elevation(p, ty) && !may_elevate(ctx) {
        return Err(Error::NeedsElevation(format!("winget:{} ({} installer)", entry.id, ty)));
    }
    rec.kind = InstallKind::Native;
    let file = path_str(path);
    let argv = pure::install_argv(p, ty, &file, &entry.id)?;
    let code = run(&argv)?;
    if !pure::is_install_success(p, code) {
        return Err(Error::InstallerFailed { id: entry.id.clone(), code });
    }
    rec.uninstall = uninstall_argv(p, ty);
    if let Some(code) = p.product_code() {
        rec.meta.insert("productCode".to_owned(), code);
    }
    Ok(())
}

fn uninstall_argv(p: &Picked<'_>, ty: &str) -> Vec<String> {
    match pure::uninstall_plan(p, ty) {
        pure::UninstallPlan::Argv(argv) => argv,
        pure::UninstallPlan::Registry { product_code } => registry_uninstall(&product_code, ty).unwrap_or_default(),
        pure::UninstallPlan::None => Vec::new(),
    }
}

/// `QuietUninstallString` (or `UninstallString` + the type's silent flag) from the
/// Apps & Features registry entry the installer created.
fn registry_uninstall(product_code: &str, ty: &str) -> Option<Vec<String>> {
    #[cfg(windows)]
    {
        pure::registry_uninstall_argv(
            reg_uninstall_value(product_code, "QuietUninstallString").as_deref(),
            reg_uninstall_value(product_code, "UninstallString").as_deref(),
            ty,
        )
    }
    #[cfg(not(windows))]
    {
        let _ = (product_code, ty);
        None
    }
}

#[cfg(windows)]
fn reg_uninstall_value(product_code: &str, value: &str) -> Option<String> {
    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn RegGetValueW(
            hkey: *mut core::ffi::c_void,
            lp_sub_key: *const u16,
            lp_value: *const u16,
            dw_flags: u32,
            pdw_type: *mut u32,
            pv_data: *mut core::ffi::c_void,
            pcb_data: *mut u32,
        ) -> i32;
    }
    const HKEY_CURRENT_USER: usize = 0x8000_0001;
    const HKEY_LOCAL_MACHINE: usize = 0x8000_0002;
    const RRF_RT_REG_SZ: u32 = 0x0000_0002;
    let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(core::iter::once(0)).collect() };
    let value_w = wide(value);
    for (hive, prefix) in [
        (HKEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\"),
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\"),
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\"),
    ] {
        let key = wide(&format!("{prefix}{product_code}"));
        let mut buf = vec![0u16; 2048];
        let mut len = (buf.len() * 2) as u32;
        // SAFETY: predefined hive handle; NUL-terminated wide strings; `buf`/`len` describe a writable buffer.
        let status = unsafe {
            RegGetValueW(
                hive as *mut core::ffi::c_void,
                key.as_ptr(),
                value_w.as_ptr(),
                RRF_RT_REG_SZ,
                core::ptr::null_mut(),
                buf.as_mut_ptr().cast(),
                &raw mut len,
            )
        };
        if status == 0 {
            let units = (len as usize / 2).min(buf.len());
            let s = String::from_utf16(&buf[..units]).ok()?;
            let s = s.trim_end_matches('\0').trim().to_owned();
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    None
}

fn run(argv: &[String]) -> Result<i64> {
    let args: Vec<&[u8]> = argv.iter().map(|a| a.as_bytes()).collect();
    match bun_core::util::spawn_sync_inherit(&args) {
        Ok(status) => Ok(i64::from(status.code())),
        Err(e) => Err(Error::Io(format!("could not run {}: {}", argv[0], e.name()))),
    }
}

pub(super) fn remove(ctx: &Ctx<'_>, rec: &InstalledRecord, root: &InstallRoot) -> Result<()> {
    let _ = root;
    if rec.kind == InstallKind::Native {
        if rec.uninstall.is_empty() {
            return Err(Error::Unsupported(format!(
                "winget:{} was installed by a native installer bun cannot uninstall silently; remove it from Apps & Features",
                rec.id
            )));
        }
        let needs = pure::uninstall_needs_elevation(
            rec.meta.get("scope").map(String::as_str),
            rec.meta.get("installerType").map(String::as_str),
        );
        if needs && !may_elevate(ctx) {
            return Err(Error::NeedsElevation(format!("uninstalling winget:{}", rec.id)));
        }
        let code = run(&rec.uninstall)?;
        if !pure::is_uninstall_success(code) {
            return Err(Error::InstallerFailed { id: rec.id.clone(), code });
        }
    }
    for bin in &rec.bins {
        super::super::fs::remove_file(bin.as_bytes());
    }
    for f in rec.files.iter().rev() {
        super::super::fs::remove_file(f.as_bytes());
    }
    for f in &rec.files {
        super::super::fs::remove_tree(f.as_bytes());
    }
    Ok(())
}
