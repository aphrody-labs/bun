//! Native Windows toolchain discovery shared by `bun msvc` and `bun:windows` `toolchain()`:
//! Visual Studio / Build Tools instances (Setup Configuration COM, no vswhere.exe), the MSVC
//! toolset, the Windows SDK with its `UnionMetadata`, the Universal CRT and the vcvars
//! environment. The discovery itself is `vendor/find-msvc-tools` (`toolchain` module).

use std::path::Path;

use find_msvc_tools::toolchain::{self as tc, Instance, Toolchain, Ucrt, WindowsSdk};

use super::Json;

/// Tools `bun msvc which` and `toolchain().tools` resolve.
pub(crate) const TOOLS: [&str; 9] = ["cl", "link", "lib", "dumpbin", "editbin", "nmake", "rc", "midl", "mt"];

/// `x64`/`x86_64`/`amd64`, `x86`/`i686`, `arm64`/`aarch64`, `arm64ec`, `arm` → the Visual Studio name.
pub(crate) fn normalize_arch(arch: &str) -> Option<&'static str> {
    Some(match arch.to_ascii_lowercase().as_bytes() {
        b"x64" | b"x86_64" | b"amd64" => "x64",
        b"x86" | b"i686" | b"i586" | b"ia32" => "x86",
        b"arm64" | b"aarch64" => "arm64",
        b"arm64ec" => "arm64ec",
        b"arm" | b"thumbv7a" => "arm",
        _ => return None,
    })
}

/// The host architecture, which is also the default target.
pub(crate) fn host_arch() -> &'static str {
    tc::host().unwrap_or("x64")
}

pub(crate) fn find(arch: &str) -> Option<Toolchain> {
    tc::toolchain(arch)
}

fn lossy(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn instance_json(json: &mut Json, instance: &Instance) {
    json.begin_object()
        .field_str("id", &instance.id)
        .field_str("name", &instance.name)
        .field_str("product", instance.product())
        .field_str("version", &instance.version)
        .field_str("path", &lossy(&instance.path))
        .end_object();
}

fn sdk_json(json: &mut Json, sdk: Option<&WindowsSdk>) {
    let Some(sdk) = sdk else {
        json.null();
        return;
    };
    json.begin_object()
        .field_str("version", &sdk.version)
        .field_str("dir", &lossy(&sdk.dir))
        .field_str("bin", &lossy(&sdk.bin));
    json.key("unionMetadata");
    match &sdk.union_metadata {
        Some(dir) => json.str(&lossy(dir)),
        None => json.null(),
    };
    json.key("windowsWinmd");
    match sdk.union_metadata.as_ref().map(|dir| dir.join("Windows.winmd")).filter(|p| p.is_file()) {
        Some(winmd) => json.str(&lossy(&winmd)),
        None => json.null(),
    };
    json.end_object();
}

fn ucrt_json(json: &mut Json, ucrt: Option<&Ucrt>) {
    match ucrt {
        Some(ucrt) => {
            json.begin_object()
                .field_str("version", &ucrt.version)
                .field_str("dir", &lossy(&ucrt.dir))
                .end_object();
        }
        None => {
            json.null();
        }
    }
}

fn paths_json(json: &mut Json, key: &str, paths: &[std::path::PathBuf]) {
    json.key(key).begin_array();
    for path in paths {
        json.str(&lossy(path));
    }
    json.end_array();
}

/// Everything about the toolchain for `arch` as JSON (the shape of `toolchain()` in
/// `bun:windows` and `bun msvc info`).
pub(crate) fn to_json(arch: &'static str) -> String {
    let instances = tc::instances();
    let toolchain = find(arch);
    let sdk = toolchain.as_ref().map_or_else(tc::windows_sdk, |t| t.sdk.clone());
    let ucrt = toolchain.as_ref().map_or_else(tc::ucrt, |t| t.ucrt.clone());

    let mut json = Json::new();
    json.begin_object()
        .field_str("arch", arch)
        .field_str("host", host_arch());
    json.key("instances").begin_array();
    for instance in &instances {
        instance_json(&mut json, instance);
    }
    json.end_array();
    json.key("instance");
    match &toolchain {
        Some(t) => instance_json(&mut json, &t.instance),
        None => {
            json.null();
        }
    }
    json.key("msvc");
    match &toolchain {
        Some(t) => {
            json.begin_object()
                .field_str("version", &t.vc_tools_version)
                .field_str("dir", &lossy(&t.vc_tools_dir))
                .field_str("bin", &lossy(&t.vc_bin))
                .field_str("hostBin", &lossy(&t.vc_host_bin))
                .end_object();
        }
        None => {
            json.null();
        }
    }
    json.key("sdk");
    sdk_json(&mut json, sdk.as_ref());
    json.key("ucrt");
    ucrt_json(&mut json, ucrt.as_ref());
    json.key("tools").begin_object();
    for tool in TOOLS {
        json.key(tool);
        match toolchain.as_ref().and_then(|t| t.which(tool)) {
            Some(path) => json.str(&lossy(&path)),
            None => json.null(),
        };
    }
    json.end_object();
    json.key("env");
    match &toolchain {
        Some(t) => {
            json.begin_object();
            for (name, value) in t.env() {
                json.field_str(name, &value.to_string_lossy());
            }
            json.end_object();
        }
        None => {
            json.null();
        }
    }
    json.key("paths");
    match &toolchain {
        Some(t) => {
            json.begin_object();
            paths_json(&mut json, "path", &t.path);
            paths_json(&mut json, "include", &t.include);
            paths_json(&mut json, "lib", &t.lib);
            paths_json(&mut json, "libpath", &t.libpath);
            json.end_object();
        }
        None => {
            json.null();
        }
    }
    json.end_object();
    json.finish()
}
