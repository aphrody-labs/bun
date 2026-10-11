// SPDX-License-Identifier: Apache-2.0
use std::{env, fs, io, path::Path};

// Build-time source discovery is standalone; importing bun_core/bun_sys here
// would compile the runtime to generate module declarations.
#[allow(clippy::disallowed_macros, clippy::disallowed_methods)]
fn visit(directory: &Path, files: &mut Vec<std::path::PathBuf>) -> io::Result<()> {
    println!("cargo:rerun-if-changed={}", directory.display());
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_dir() {
            visit(&entry.path(), files)?;
        } else if kind.is_file()
            && entry
                .path()
                .extension()
                .is_some_and(|ext| ext == "rs" || ext == "js")
        {
            files.push(entry.path());
        }
    }
    Ok(())
}

fn emit_arm(output: &mut String, key: &str, path: &Path) {
    let path = path.to_str().expect("source paths must be UTF-8");
    output.push_str(&format!(
        "    ({key:?}, $(#[$attribute:meta])* $visibility:vis mod $name:ident) => {{\n        $(#[$attribute])*\n        #[path = {path:?}]\n        $visibility mod $name;\n    }};\n"
    ));
}

#[allow(clippy::disallowed_methods)]
fn main() -> io::Result<()> {
    let root = Path::new(&env::var("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"))
        .canonicalize()?;
    let integrations = root.join("integrations");
    let mut files = Vec::new();
    visit(&integrations, &mut files)?;
    files.sort();
    let mut output = String::from("#[macro_export]\nmacro_rules! module {\n");
    let mut keys = Vec::new();
    let mut text_files = Vec::new();
    for file in files {
        let key = file
            .strip_prefix(&integrations)
            .expect("integration prefix")
            .to_str()
            .expect("UTF-8 relative path")
            .replace('\\', "/");
        if file.extension().is_some_and(|ext| ext == "rs") {
            emit_arm(&mut output, &key, &file);
            keys.push(key);
        } else {
            text_files.push((key, file));
        }
    }
    output.push_str("    ($path:literal, $($declaration:tt)*) => { compile_error!(concat!(\"Unknown Aphrody web integration source: \", $path)); };\n}\n");
    output.push_str("#[macro_export]\nmacro_rules! text {\n");
    for (key, file) in text_files {
        let path = file.to_str().expect("UTF-8 text source path");
        output.push_str(&format!("    ({key:?}) => {{ include_str!({path:?}) }};\n"));
    }
    output.push_str("    ($path:literal) => { compile_error!(concat!(\"Unknown Aphrody web text source: \", $path)); };\n}\n");
    output.push_str(&format!(
        "pub const SOURCE_ROOT: &str = {:?};\n",
        root.to_str().expect("UTF-8 source root")
    ));
    output.push_str("pub const SOURCE_PATHS: &[&str] = &[\n");
    for key in keys {
        output.push_str(&format!("    {key:?},\n"));
    }
    output.push_str("];");
    output.push_str("\n#[cfg(test)]\nmacro_rules! fixture_module {\n");
    emit_arm(
        &mut output,
        "consumer-context",
        &root.join("tests/fixtures/consumer_context.rs"),
    );
    output.push_str("}\n");
    let out_dir = env::var("OUT_DIR").expect("Cargo output directory");
    fs::write(Path::new(&out_dir).join("modules.rs"), output)
}
