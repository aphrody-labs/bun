//! Installer selection and silent installation for winget manifests.
//!
//! - `portable` and `zip` (nested `portable`) are extracted under the install root,
//!   recorded file by file, and get command shims in the bin dir.
//! - `msi`/`wix`/`burn`/`inno`/`nullsoft`/`exe`/`msix` run the native installer silently.
//!   Anything that needs administrator rights is refused unless the process is
//!   elevated or `BUN_SYSTEM_ELEVATE=1`.

use std::collections::BTreeMap;

use super::super::value::Value;
use super::super::{Ctx, Error, InstallKind, InstallRoot, InstalledRecord, LockEntry, Result, SourceKind};

/// A manifest installer with root-level defaults applied.
struct Picked<'a> {
    node: &'a Value,
    root: &'a Value,
}

impl<'a> Picked<'a> {
    fn get(&self, key: &str) -> Option<&'a Value> {
        self.node.get_ci(key).or_else(|| self.root.get_ci(key))
    }
    fn str(&self, key: &str) -> Option<&'a str> {
        self.get(key).and_then(Value::as_str)
    }
    fn lower(&self, key: &str) -> String {
        self.str(key).unwrap_or("").to_ascii_lowercase()
    }
    fn installer_type(&self) -> String {
        self.lower("InstallerType")
    }
    fn switch(&self, name: &str) -> Option<&'a str> {
        self.node
            .get_ci("InstallerSwitches")
            .and_then(|s| s.str_ci(name))
            .or_else(|| self.root.get_ci("InstallerSwitches").and_then(|s| s.str_ci(name)))
    }
}

pub(super) fn host_arch(ctx: &Ctx<'_>) -> String {
    if let Some(a) = &ctx.options.arch {
        return a.to_ascii_lowercase();
    }
    if cfg!(target_arch = "aarch64") {
        "arm64".to_owned()
    } else if cfg!(target_arch = "x86") {
        "x86".to_owned()
    } else {
        "x64".to_owned()
    }
}

fn arch_rank(host: &str, arch: &str) -> Option<u8> {
    match (host, arch) {
        (h, a) if h == a => Some(0),
        (_, "neutral") => Some(1),
        ("arm64", "x64") => Some(2),
        ("x64" | "arm64", "x86") => Some(3),
        _ => None,
    }
}

const SUPPORTED_TYPES: &[&str] = &["portable", "zip", "msi", "wix", "burn", "inno", "nullsoft", "exe", "msix", "appx"];

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
    let host = host_arch(ctx);
    let want_scope = ctx.options.scope.as_deref().map(str::to_ascii_lowercase);
    let want_locale = ctx.options.locale.as_deref().map(str::to_ascii_lowercase);
    let elevate = may_elevate(ctx);
    let mut best: Option<((u8, u8, u8, u8), Picked<'a>)> = None;
    for node in manifest.array_ci("Installers") {
        let p = Picked { node, root: manifest };
        let Some(arch_score) = arch_rank(&host, &p.lower("Architecture")) else {
            continue;
        };
        let ty = p.installer_type();
        if !SUPPORTED_TYPES.contains(&ty.as_str()) {
            continue;
        }
        let scope = p.lower("Scope");
        let scope_score = match (&want_scope, scope.as_str()) {
            (Some(w), s) if w == s => 0,
            (Some(_), "") => 1,
            (Some(_), _) => continue,
            (None, "user") => 0,
            (None, "") => 1,
            (None, _) if elevate => 2,
            (None, _) => 3,
        };
        let locale = p.lower("InstallerLocale");
        let locale_score = match &want_locale {
            Some(w) if *w == locale => 0,
            Some(w) if !locale.is_empty() && locale.split_at(2.min(locale.len())).0 == w.split_at(2.min(w.len())).0 => 1,
            _ if locale.is_empty() || locale == "en-us" => 2,
            _ => 3,
        };
        let type_score = if matches!(ty.as_str(), "portable" | "zip") { 0 } else { 1 };
        let key = (arch_score, scope_score, locale_score, type_score);
        if best.as_ref().is_none_or(|(k, _)| key < *k) {
            best = Some((key, p));
        }
    }
    best.map(|(_, p)| p).ok_or_else(|| {
        Error::Unsupported(format!("winget: {id} has no installer for {host} that bun can run"))
    })
}

fn file_name_of(url: &str) -> &str {
    let path = url.split_at(bun_core::strings::index_of_any(url.as_bytes(), b"?#").unwrap_or(url.len())).0;
    let start = bun_core::strings::last_index_of_char(path.as_bytes(), b'/').map_or(0, |i| i + 1);
    &path[start..]
}

fn extension_of(name: &str) -> Option<&str> {
    let dot = bun_core::strings::last_index_of_char(name.as_bytes(), b'.')?;
    let ext = &name[dot..];
    (ext.len() > 1 && ext.len() <= 8 && ext.bytes().skip(1).all(|c| c.is_ascii_alphanumeric())).then_some(ext)
}

fn default_extension(ty: &str) -> &'static str {
    match ty {
        "msi" | "wix" => ".msi",
        "zip" => ".zip",
        "msix" | "appx" => ".msix",
        _ => ".exe",
    }
}

/// Splits a switch string the way `CommandLineToArgvW` does for simple cases.
pub(super) fn split_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    let mut has = false;
    for c in s.chars() {
        match c {
            '"' => {
                in_quotes = !in_quotes;
                has = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                if has {
                    out.push(core::mem::take(&mut cur));
                    has = false;
                }
            }
            c => {
                cur.push(c);
                has = true;
            }
        }
    }
    if has {
        out.push(cur);
    }
    out
}

/// PowerShell single-quoted literal.
fn ps_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\x27');
    for c in s.chars() {
        if c == '\x27' {
            out.push('\x27');
        }
        out.push(c);
    }
    out.push('\x27');
    out
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
            let cmd = p
                .get("Commands")
                .and_then(|c| c.as_array().first())
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| stem(name).to_owned());
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
            let nested_files: Vec<(String, Option<String>)> = p
                .get("NestedInstallerFiles")
                .map(|v| {
                    v.as_array()
                        .iter()
                        .filter_map(|f| {
                            Some((f.str_ci("RelativeFilePath")?.to_owned(), f.str_ci("PortableCommandAlias").map(str::to_owned)))
                        })
                        .collect()
                })
                .unwrap_or_default();
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

fn stem(name: &str) -> &str {
    let base = &name[bun_core::strings::last_index_of_char(name.as_bytes(), b'/')
        .or_else(|| bun_core::strings::last_index_of_char(name.as_bytes(), b'\\'))
        .map_or(0, |i| i + 1)..];
    match extension_of(base) {
        Some(ext) => &base[..base.len() - ext.len()],
        None => base,
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

fn needs_elevation(p: &Picked<'_>, ty: &str) -> bool {
    let req = p.lower("ElevationRequirement");
    if matches!(req.as_str(), "elevationrequired" | "elevatesself") {
        return true;
    }
    match p.lower("Scope").as_str() {
        "user" => false,
        "machine" => true,
        // Unscoped msi/inno/burn installers default to per-machine.
        _ => !matches!(ty, "msix" | "appx" | "nullsoft" | "exe"),
    }
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
    let user_scope = p.lower("Scope") == "user";
    let silent = p.switch("Silent").map(split_args);
    let mut argv: Vec<String> = match ty {
        "msi" | "wix" => {
            let mut a = vec!["msiexec".to_owned(), "/i".to_owned(), file.clone()];
            a.extend(silent.unwrap_or_else(|| vec!["/quiet".to_owned(), "/norestart".to_owned()]));
            if user_scope {
                a.push("ALLUSERS=2".to_owned());
                a.push("MSIINSTALLPERUSER=1".to_owned());
            }
            a
        }
        "inno" => {
            let mut a = vec![file.clone()];
            a.extend(silent.unwrap_or_else(|| {
                ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-"].map(str::to_owned).to_vec()
            }));
            match p.lower("Scope").as_str() {
                "user" => a.push("/CURRENTUSER".to_owned()),
                "machine" => a.push("/ALLUSERS".to_owned()),
                _ => {}
            }
            a
        }
        "nullsoft" => {
            let mut a = vec![file.clone()];
            a.extend(silent.unwrap_or_else(|| vec!["/S".to_owned()]));
            a
        }
        "burn" => {
            let mut a = vec![file.clone()];
            a.extend(silent.unwrap_or_else(|| vec!["/quiet".to_owned(), "/norestart".to_owned()]));
            a
        }
        "exe" => {
            let Some(silent) = silent else {
                return Err(Error::Unsupported(format!(
                    "winget: {} uses an exe installer without silent switches",
                    entry.id
                )));
            };
            let mut a = vec![file.clone()];
            a.extend(silent);
            a
        }
        "msix" | "appx" => vec![
            "powershell".to_owned(),
            "-NoProfile".to_owned(),
            "-NonInteractive".to_owned(),
            "-Command".to_owned(),
            format!("Add-AppxPackage -Path {}", ps_quote(&file)),
        ],
        other => return Err(Error::Unsupported(format!("winget: unsupported installer type {other}"))),
    };
    if let Some(custom) = p.switch("Custom") {
        if !matches!(ty, "msix" | "appx") {
            argv.extend(split_args(custom));
        }
    }
    let code = run(&argv)?;
    // 3010 = success, reboot required (msi); 1641 = reboot initiated.
    if !matches!(code, 0 | 3010 | 1641) {
        let expected = p
            .get("InstallerSuccessCodes")
            .is_some_and(|c| c.as_array().iter().any(|v| v.as_str().and_then(|s| s.parse::<i64>().ok()) == Some(code)));
        if !expected {
            return Err(Error::InstallerFailed { id: entry.id.clone(), code });
        }
    }
    rec.uninstall = uninstall_argv(p, ty);
    let mut meta = BTreeMap::new();
    if let Some(code) = product_code(p) {
        meta.insert("productCode".to_owned(), code);
    }
    rec.meta.extend(meta);
    Ok(())
}

fn product_code(p: &Picked<'_>) -> Option<String> {
    p.str("ProductCode").map(str::to_owned).or_else(|| {
        p.get("AppsAndFeaturesEntries")
            .and_then(|e| e.as_array().iter().find_map(|x| x.str_ci("ProductCode")))
            .map(str::to_owned)
    })
}

fn uninstall_argv(p: &Picked<'_>, ty: &str) -> Vec<String> {
    let code = product_code(p);
    match ty {
        "msi" | "wix" => match code {
            Some(c) => ["msiexec", "/x", &c, "/quiet", "/norestart"].map(str::to_owned).to_vec(),
            None => Vec::new(),
        },
        "msix" | "appx" => match p.str("PackageFamilyName") {
            Some(pfn) => {
                let name = pfn.split_at(bun_core::strings::last_index_of_char(pfn.as_bytes(), b'_').unwrap_or(pfn.len())).0;
                vec![
                    "powershell".to_owned(),
                    "-NoProfile".to_owned(),
                    "-NonInteractive".to_owned(),
                    "-Command".to_owned(),
                    format!("Get-AppxPackage -Name {} | Remove-AppxPackage", ps_quote(name)),
                ]
            }
            None => Vec::new(),
        },
        _ => code.and_then(|c| registry_uninstall(&c, ty)).unwrap_or_default(),
    }
}

/// `QuietUninstallString` (or `UninstallString` + the type's silent flag) from the
/// Apps & Features registry entry the installer created.
fn registry_uninstall(product_code: &str, ty: &str) -> Option<Vec<String>> {
    #[cfg(windows)]
    {
        if let Some(q) = reg_uninstall_value(product_code, "QuietUninstallString") {
            return Some(split_args(&q));
        }
        let mut argv = split_args(&reg_uninstall_value(product_code, "UninstallString")?);
        match ty {
            "inno" => argv.extend(["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"].map(str::to_owned)),
            "nullsoft" => argv.push("/S".to_owned()),
            "burn" => argv.extend(["/quiet", "/norestart"].map(str::to_owned)),
            _ => {}
        }
        Some(argv)
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
                &mut len,
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
        let needs = rec.meta.get("scope").is_none_or(|s| !s.eq_ignore_ascii_case("user"));
        if needs && !may_elevate(ctx) && rec.meta.get("installerType").is_some_and(|t| !matches!(t.as_str(), "msix" | "appx" | "nullsoft" | "exe")) {
            return Err(Error::NeedsElevation(format!("uninstalling winget:{}", rec.id)));
        }
        let code = run(&rec.uninstall)?;
        if !matches!(code, 0 | 3010 | 1641 | 1605) {
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
