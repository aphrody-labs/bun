use anyhow::{Context, bail};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{fs, path::{Component, Path, PathBuf}};

const CHROMIUM_REVISION: &str = "ce0615a76d6347f1914d673f1da66285b328d494";
const CHROMIUM_VERSION: &str = "157.0.8099.0";
const CEF_REVISION: &str = "c7272dcfe46849b77d1a3c0789dc38b1bfb14c9c";

fn read_json(path: &Path) -> anyhow::Result<Value> {
    println!("cargo::rerun-if-changed={}", path.display());
    Ok(serde_json::from_slice(&fs::read(path).with_context(|| format!("Missing owner CEF receipt: {}", path.display()))?)?)
}

fn hashed_file(root: &Path, relative: &str, expected: &str) -> anyhow::Result<()> {
    let path = Path::new(relative);
    if path.is_absolute() || path.components().any(|part| !matches!(part, Component::Normal(_))) || relative.contains('\\') {
        bail!("Invalid owner CEF receipt path");
    }
    let file = root.join(path);
    let canonical = file.canonicalize()?;
    if !canonical.starts_with(root.canonicalize()?) { bail!("Owner CEF receipt escapes its source root"); }
    let actual = format!("{:x}", Sha256::digest(fs::read(&canonical)?));
    if actual != expected { bail!("Owner CEF artifact hash mismatch: {}", file.display()); }
    println!("cargo::rerun-if-changed={}", file.display());
    Ok(())
}

fn constant(source: &str, name: &str) -> anyhow::Result<u32> {
    source.lines().find_map(|line| {
        let value = line.strip_prefix(&format!("pub const {name}: i32 = "))?;
        value.strip_suffix(';')?.parse().ok()
    }).with_context(|| format!("Missing generated cef-rs constant {name}"))
}

pub fn validate_distribution(target: &str) -> anyhow::Result<PathBuf> {
    let path = PathBuf::from(std::env::var_os("CEF_PATH").context("CEF_PATH must point to an owner-built Chromium 157 CEF distribution; downloading prebuilt CEF is disabled")?);
    if !path.is_absolute() { bail!("CEF_PATH must be absolute"); }
    let receipt = read_json(&path.join(".bun-cef-build.json"))?;
    if receipt["schema"] != 1 || receipt["target"] != target
        || receipt["cefRevision"] != CEF_REVISION || receipt["chromiumRevision"] != CHROMIUM_REVISION
        || receipt["chromiumVersion"] != CHROMIUM_VERSION {
        bail!("CEF distribution is not built from the selected Aphrody CEF and Chromium 157 sources");
    }
    let api_hash = receipt["apiHash"].as_str().filter(|hash| !hash.is_empty()).context("Owner CEF receipt lacks the native API hash probe")?;
    let api_version = receipt["apiVersion"].as_u64().context("Owner CEF receipt lacks the native API version")?;
    let binary = &receipt["binary"];
    hashed_file(&path, binary["path"].as_str().context("Owner CEF binary path missing")?, binary["sha256"].as_str().context("Owner CEF binary digest missing")?)?;
    if !target.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_') { bail!("Invalid Cargo target"); }
    let filename = format!("{}.rs", target.replace('-', "_"));
    let sys = Path::new(env!("CARGO_MANIFEST_DIR"));
    let bindings_path = sys.join("src/bindings").join(&filename);
    let generated = fs::read_to_string(&bindings_path)?;
    if constant(&generated, "CEF_API_VERSION_LAST")? as u64 != api_version
        || ["CHROME_VERSION_MAJOR", "CHROME_VERSION_MINOR", "CHROME_VERSION_BUILD", "CHROME_VERSION_PATCH"].iter()
            .map(|name| constant(&generated, name).map(|version| version.to_string()))
            .collect::<anyhow::Result<Vec<_>>>()?.join(".") != CHROMIUM_VERSION {
        bail!("cef-rs bindings must be regenerated from the selected owner CEF headers before compiling Chromium 157");
    }
    let generated_receipt = read_json(&bindings_path.with_extension("bun-cef.json"))?;
    for key in ["schema", "target", "cefRevision", "chromiumRevision", "chromiumVersion", "apiVersion", "apiHash"] {
        if generated_receipt[key] != receipt[key] { bail!("cef-rs generated bindings do not match the owner CEF native API receipt ({key})"); }
    }
    if generated_receipt["apiHash"] != api_hash { bail!("cef-rs API hash mismatch"); }
    let root = sys.parent().context("cef-rs workspace root missing")?;
    let files = generated_receipt["files"].as_array().filter(|files| files.len() == 3).context("cef-rs generation must cover raw, safe and resource bindings")?;
    let expected = [format!("sys/src/bindings/{filename}"), format!("cef/src/bindings/{filename}"), format!("cef/src/resources/{filename}")];
    for filename in expected {
        let entry = files.iter().find(|entry| entry["path"] == filename).context("cef-rs generated binding file missing")?;
        hashed_file(root, &filename, entry["sha256"].as_str().context("cef-rs generated binding digest missing")?)?;
    }
    let headers = generated_receipt["headers"].as_array().filter(|headers| !headers.is_empty()).context("cef-rs generation lacks its exact header inputs")?;
    for header in headers {
        hashed_file(&path, header["path"].as_str().context("CEF header path missing")?, header["sha256"].as_str().context("CEF header digest missing")?)?;
    }
    Ok(path)
}
