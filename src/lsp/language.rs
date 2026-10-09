//! Which language a file is, where its project starts, and which language server serves it.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::Options;

/// A language that `bun lsp` routes to a server.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    /// TypeScript and JavaScript.
    TypeScript,
    Python,
    Rust,
    /// C, C++, Objective-C and Objective-C++, through clangd.
    Cpp,
}

impl Language {
    pub const ALL: [Language; 4] = [Language::TypeScript, Language::Python, Language::Rust, Language::Cpp];

    /// The language of a file, by its extension.
    pub fn of_path(path: &Path) -> Option<Language> {
        let extension = path.extension()?.to_str()?.to_ascii_lowercase();
        Some(match extension.as_str() {
            "ts" | "tsx" | "mts" | "cts" | "js" | "jsx" | "mjs" | "cjs" => Language::TypeScript,
            "py" | "pyi" => Language::Python,
            "rs" => Language::Rust,
            "c" | "h" | "cc" | "cpp" | "cxx" | "c++" | "hpp" | "hh" | "hxx" | "h++" | "ipp" | "inl" | "m" | "mm" => {
                Language::Cpp
            }
            _ => return None,
        })
    }

    pub fn name(self) -> &'static str {
        match self {
            Language::TypeScript => "typescript",
            Language::Python => "python",
            Language::Rust => "rust",
            Language::Cpp => "cpp",
        }
    }

    pub fn from_name(name: &str) -> Option<Language> {
        Some(match name.to_ascii_lowercase().as_str() {
            "typescript" | "ts" | "javascript" | "js" => Language::TypeScript,
            "python" | "py" => Language::Python,
            "rust" | "rs" => Language::Rust,
            "cpp" | "c++" | "c" | "clangd" => Language::Cpp,
            _ => return None,
        })
    }

    /// `TextDocumentItem.languageId` of `path`.
    pub fn language_id(path: &Path) -> &'static str {
        let extension = path.extension().and_then(|it| it.to_str()).unwrap_or("").to_ascii_lowercase();
        match extension.as_str() {
            "ts" | "mts" | "cts" => "typescript",
            "tsx" => "typescriptreact",
            "jsx" => "javascriptreact",
            "js" | "mjs" | "cjs" => "javascript",
            "py" | "pyi" => "python",
            "rs" => "rust",
            "c" => "c",
            "m" => "objective-c",
            "mm" => "objective-cpp",
            _ => "cpp",
        }
    }

    /// Files whose directory is the root of a project of this language, nearest first.
    fn markers(self) -> &'static [&'static str] {
        match self {
            Language::TypeScript => &["tsconfig.json", "jsconfig.json", "package.json"],
            Language::Python => &[
                "pyproject.toml",
                "ty.toml",
                "pyrightconfig.json",
                "setup.py",
                "setup.cfg",
                "requirements.txt",
            ],
            Language::Rust => &["Cargo.toml"],
            Language::Cpp => &["compile_commands.json", "compile_flags.txt", ".clangd"],
        }
    }
}

fn is_repository(dir: &Path) -> bool {
    dir.join(".git").exists()
}

fn parent_dir(file: &Path) -> PathBuf {
    if file.is_dir() {
        return file.to_path_buf();
    }
    file.parent().map_or_else(|| file.to_path_buf(), Path::to_path_buf)
}

/// The root of the project of `language` that `file` belongs to.
pub fn project_root(language: Language, file: &Path) -> PathBuf {
    let start = parent_dir(file);
    if language == Language::Rust {
        return cargo_root(&start).unwrap_or(start);
    }
    for marker in language.markers() {
        for dir in start.ancestors() {
            if dir.join(marker).is_file() {
                return dir.to_path_buf();
            }
            if is_repository(dir) {
                break;
            }
        }
    }
    // A C++ project without a compilation database: the repository, whose build directories
    // `compilation_database` looks in.
    start.ancestors().find(|dir| is_repository(dir)).map_or_else(|| start.clone(), Path::to_path_buf)
}

/// The Cargo workspace of the nearest `Cargo.toml`, else that package.
fn cargo_root(start: &Path) -> Option<PathBuf> {
    let package = start.ancestors().find(|dir| dir.join("Cargo.toml").is_file())?;
    let workspace = package.ancestors().find(|dir| {
        std::fs::read_to_string(dir.join("Cargo.toml")).is_ok_and(|text| text.contains("[workspace]"))
    });
    Some(workspace.unwrap_or(package).to_path_buf())
}

/// The workspace a daemon serves: the repository of `file`, else the project of its language.
pub fn workspace_root(file: &Path) -> PathBuf {
    let start = parent_dir(file);
    if let Some(repository) = start.ancestors().find(|dir| is_repository(dir)) {
        return repository.to_path_buf();
    }
    match Language::of_path(file) {
        Some(language) => project_root(language, file),
        None => start,
    }
}

/// The languages that have a project marker in `root`.
pub fn languages_in(root: &Path) -> Vec<Language> {
    Language::ALL
        .into_iter()
        .filter(|language| match language {
            Language::Cpp => compilation_database(root).is_some(),
            _ => language.markers().iter().any(|marker| root.join(marker).is_file()),
        })
        .collect()
}

/// How to start one language server.
#[derive(Clone, Debug)]
pub struct ServerCommand {
    /// `tsgo`, `typescript-language-server`, `ty`, `basedpyright`, `pyright`, `ruff`, `rust-analyzer`, `clangd`.
    pub name: String,
    pub program: PathBuf,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub initialization_options: Option<Value>,
    /// Asked for diagnostics only, beside the primary server (`ruff` beside `ty`).
    pub diagnostics_only: bool,
}

impl ServerCommand {
    fn new(name: &str, program: PathBuf, args: &[&str]) -> ServerCommand {
        ServerCommand {
            name: name.to_owned(),
            program,
            args: args.iter().map(|it| (*it).to_owned()).collect(),
            env: Vec::new(),
            initialization_options: None,
            diagnostics_only: false,
        }
    }

    pub fn command_line(&self) -> String {
        let mut line = self.program.display().to_string();
        for arg in &self.args {
            line.push(' ');
            line.push_str(arg);
        }
        line
    }
}

/// The servers of one language for one project: the first is the primary.
#[derive(Clone, Debug, Default)]
pub struct Servers {
    pub primary: Option<ServerCommand>,
    pub secondary: Vec<ServerCommand>,
    /// Why there is no primary: what was looked for.
    pub missing: Option<String>,
}

/// An executable named `name` in `dirs`, then on `PATH`.
pub fn which(name: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    let extensions: Vec<String> = if cfg!(windows) {
        let pathext = std::env::var("PATHEXT").unwrap_or_else(|_| ".EXE;.CMD;.BAT".into());
        let mut list: Vec<String> = pathext.split(';').filter(|it| !it.is_empty()).map(str::to_ascii_lowercase).collect();
        list.insert(0, ".exe".into());
        list
    } else {
        vec![String::new()]
    };
    let path_dirs = std::env::var_os("PATH").map(|path| std::env::split_paths(&path).collect::<Vec<_>>()).unwrap_or_default();
    for dir in dirs.iter().chain(path_dirs.iter()) {
        for extension in &extensions {
            let candidate = dir.join(format!("{name}{extension}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// `node_modules/.bin` of `root` and of its ancestors.
fn node_bins(root: &Path) -> Vec<PathBuf> {
    root.ancestors().map(|dir| dir.join("node_modules").join(".bin")).filter(|dir| dir.is_dir()).collect()
}

/// `.venv` executables of `root` and of its ancestors.
fn venv_bins(root: &Path) -> Vec<PathBuf> {
    let bin = if cfg!(windows) { "Scripts" } else { "bin" };
    root.ancestors().map(|dir| dir.join(".venv").join(bin)).filter(|dir| dir.is_dir()).collect()
}

/// `BUN_LSP_<LANGUAGE>`: a JSON array, or words separated by spaces.
fn from_env(language: Language) -> Option<ServerCommand> {
    let name = format!("BUN_LSP_{}", language.name().to_ascii_uppercase());
    let value = std::env::var(&name).ok().filter(|it| !it.trim().is_empty())?;
    let words = crate::command_words(&value)?;
    let (program, args) = words.split_first()?;
    let program = which(program, &[]).unwrap_or_else(|| PathBuf::from(program));
    let label = program.file_stem().map_or_else(|| "custom".to_owned(), |it| it.to_string_lossy().into_owned());
    let mut command = ServerCommand::new(&label, program, &[]);
    command.args = args.to_vec();
    Some(command)
}

/// The servers to start for `language` in `root`, in order of preference.
pub fn discover(language: Language, root: &Path, options: &Options) -> Servers {
    let primary = from_env(language);
    match language {
        Language::TypeScript => typescript(root, options, primary),
        Language::Python => python(root, options, primary),
        Language::Rust => rust(options, primary),
        Language::Cpp => cpp(root, options, primary),
    }
}

fn typescript(root: &Path, options: &Options, primary: Option<ServerCommand>) -> Servers {
    let bins = node_bins(root);
    let primary = primary
        .or_else(|| which("tsgo", &bins).map(|program| ServerCommand::new("tsgo", program, &["--lsp", "--stdio"])))
        .or_else(|| {
            which("typescript-language-server", &bins)
                .map(|program| ServerCommand::new("typescript-language-server", program, &["--stdio"]))
        })
        .or_else(|| {
            let bun = options.bun.clone().filter(|_| !options.offline)?;
            let args = ["x", "--package", "@typescript/native-preview", "tsgo", "--lsp", "--stdio"];
            Some(ServerCommand::new("tsgo", bun, &args))
        });
    let missing = primary.is_none().then(|| "tsgo (@typescript/native-preview) or typescript-language-server".to_owned());
    Servers { primary, secondary: Vec::new(), missing }
}

fn python(root: &Path, options: &Options, primary: Option<ServerCommand>) -> Servers {
    let bins = venv_bins(root);
    let ruff = which("ruff", &bins).map(|program| ServerCommand::new("ruff", program, &["server"]));
    let primary = primary
        .or_else(|| which("ty", &bins).map(|program| ServerCommand::new("ty", program, &["server"])))
        .or_else(|| {
            which("basedpyright-langserver", &bins)
                .map(|program| ServerCommand::new("basedpyright", program, &["--stdio"]))
        })
        .or_else(|| {
            which("pyright-langserver", &bins).map(|program| ServerCommand::new("pyright", program, &["--stdio"]))
        })
        .or_else(|| {
            // The `uv` built into Bun installs `ty` in its tool cache the first time.
            let bun = options.bun.clone().filter(|_| !options.offline)?;
            Some(ServerCommand::new("ty", bun, &["uv", "tool", "run", "ty", "server"]))
        });
    let (primary, secondary) = match (primary, ruff) {
        (Some(primary), Some(mut ruff)) => {
            ruff.diagnostics_only = true;
            (Some(primary), vec![ruff])
        }
        (primary, ruff) => (primary.or(ruff), Vec::new()),
    };
    let missing = primary.is_none().then(|| "ty, basedpyright-langserver, pyright-langserver or ruff".to_owned());
    Servers { primary, secondary, missing }
}

fn rust(options: &Options, primary: Option<ServerCommand>) -> Servers {
    let primary = primary.or_else(|| {
        let program = which("rust-analyzer", &[])?;
        let mut command = ServerCommand::new("rust-analyzer", program, &[]);
        command.initialization_options = Some(json!({
            "numThreads": options.jobs,
            "cachePriming": { "numThreads": options.jobs },
            "lru": { "capacity": 64 },
            "checkOnSave": false,
        }));
        Some(command)
    });
    let missing = primary.is_none().then(|| "rust-analyzer (rustup component add rust-analyzer)".to_owned());
    Servers { primary, secondary: Vec::new(), missing }
}

fn llvm_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if cfg!(windows) {
        for base in ["ProgramFiles", "ProgramW6432"] {
            if let Some(dir) = std::env::var_os(base) {
                dirs.push(PathBuf::from(dir).join("LLVM").join("bin"));
            }
        }
    } else {
        dirs.push(PathBuf::from("/opt/homebrew/opt/llvm/bin"));
        dirs.push(PathBuf::from("/usr/local/opt/llvm/bin"));
    }
    dirs
}

fn cpp(root: &Path, options: &Options, primary: Option<ServerCommand>) -> Servers {
    let found = primary.is_some();
    let primary = primary
        .or_else(|| {
            // `PATH` first: the `LLVM/bin` directories are where installers put it when it is not.
            which("clangd", &[]).or_else(|| which("clangd", &llvm_dirs())).map(|program| ServerCommand::new("clangd", program, &[]))
        })
        .or_else(|| {
            // npm's `clangd` is a placeholder; PyPI's carries the LLVM release binaries.
            let bun = options.bun.clone().filter(|_| !options.offline)?;
            Some(ServerCommand::new("clangd", bun, &["uv", "tool", "run", "clangd"]))
        });
    let Some(mut primary) = primary else {
        return Servers { primary: None, secondary: Vec::new(), missing: Some("clangd".to_owned()) };
    };
    if !found {
        primary.args.extend([
            "--background-index".to_owned(),
            format!("--limit-results={}", options.limit),
            format!("-j={}", options.jobs),
            "--pch-storage=disk".to_owned(),
            "--header-insertion=never".to_owned(),
            "--log=error".to_owned(),
        ]);
        if cfg!(target_os = "linux") {
            primary.args.push("--malloc-trim".to_owned());
        }
        if let Some(database) = compilation_database(root).or_else(|| generate_compilation_database(root, options)) {
            primary.args.push(format!("--compile-commands-dir={}", database.display()));
        }
        if cfg!(windows) && std::env::var_os("INCLUDE").is_none() {
            primary.env = msvc_environment(options).to_vec();
        }
    }
    Servers { primary: Some(primary), secondary: Vec::new(), missing: None }
}

/// Directories that may hold the `compile_commands.json` of `root`, in order of preference.
fn build_dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs = vec![root.to_path_buf()];
    for parent in ["build", "out", "cmake-build-debug"] {
        let parent = root.join(parent);
        if !parent.is_dir() {
            continue;
        }
        dirs.push(parent.clone());
        // `build/debug` before `build/release`: a debug build compiles everything.
        let mut children: Vec<PathBuf> = std::fs::read_dir(&parent)
            .into_iter()
            .flatten()
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect();
        children.sort_by_key(|path| (path.file_name().is_none_or(|name| name != "debug"), path.clone()));
        dirs.extend(children);
    }
    dirs
}

/// The directory of the `compile_commands.json` of `root`.
pub fn compilation_database(root: &Path) -> Option<PathBuf> {
    build_dirs(root).into_iter().find(|dir| dir.join("compile_commands.json").is_file())
}

/// The compile rules of a `build.ninja`: `ninja -t compdb` lists the commands of those only, not
/// links and code generators.
fn compile_rules(build_ninja: &str) -> Vec<String> {
    build_ninja
        .lines()
        .filter_map(|line| line.strip_prefix("rule "))
        .map(str::trim)
        .filter(|rule| {
            let rule = rule.to_ascii_lowercase();
            matches!(rule.as_str(), "c" | "cc" | "cxx" | "cpp" | "objc" | "objcxx")
                || rule.ends_with("_cc")
                || rule.ends_with("_cxx")
                || rule.starts_with("c_compiler")
                || rule.starts_with("cxx_compiler")
                || rule.starts_with("cxx_pch")
                || rule.contains("compile")
        })
        .filter(|rule| !rule.contains("host"))
        .map(str::to_owned)
        .collect()
}

/// Writes a `compile_commands.json` for `root`: `ninja -t compdb` in its build directory, or the
/// Linux kernel's `scripts/clang-tools/gen_compile_commands.py` after a build. Returns the
/// directory of the file.
pub fn generate_compilation_database(root: &Path, options: &Options) -> Option<PathBuf> {
    if let Some(dir) = build_dirs(root).into_iter().find(|dir| dir.join("build.ninja").is_file()) {
        let ninja = which("ninja", &[])?;
        let rules = std::fs::read_to_string(dir.join("build.ninja")).map(|text| compile_rules(&text)).unwrap_or_default();
        let output = Command::new(ninja).arg("-C").arg(&dir).args(["-t", "compdb"]).args(&rules).output().ok()?;
        if output.status.success() && output.stdout.len() > 2 {
            std::fs::write(dir.join("compile_commands.json"), &output.stdout).ok()?;
            return Some(dir);
        }
        return None;
    }
    let script = root.join("scripts").join("clang-tools").join("gen_compile_commands.py");
    if !script.is_file() {
        return None;
    }
    let output = root.join("compile_commands.json");
    let mut command = match which("python3", &[]).or_else(|| which("python", &[])) {
        Some(python) => Command::new(python),
        None => {
            let mut command = Command::new(options.bun.as_ref()?);
            command.args(["uv", "run", "--no-project", "python"]);
            command
        }
    };
    let status = command.arg(&script).arg("-d").arg(root).arg("-o").arg(&output).current_dir(root).status().ok()?;
    (status.success() && output.is_file()).then(|| root.to_path_buf())
}

/// `bun msvc env`: the MSVC and Windows SDK environment that clang-cl command lines need.
fn msvc_environment(options: &Options) -> &'static [(String, String)] {
    static ENVIRONMENT: OnceLock<Vec<(String, String)>> = OnceLock::new();
    ENVIRONMENT.get_or_init(|| {
        let Some(bun) = options.bun.as_ref() else { return Vec::new() };
        let Ok(output) = Command::new(bun).args(["msvc", "env", "--format", "json"]).output() else {
            return Vec::new();
        };
        let Ok(Value::Object(vars)) = serde_json::from_slice::<Value>(&output.stdout) else { return Vec::new() };
        vars.into_iter()
            .filter(|(name, _)| matches!(name.to_ascii_uppercase().as_str(), "INCLUDE" | "EXTERNAL_INCLUDE" | "LIB" | "LIBPATH"))
            .filter_map(|(name, value)| Some((name, value.as_str()?.to_owned())))
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_by_extension() {
        assert_eq!(Language::of_path(Path::new("a/b.TSX")), Some(Language::TypeScript));
        assert_eq!(Language::of_path(Path::new("a.pyi")), Some(Language::Python));
        assert_eq!(Language::of_path(Path::new("lib.rs")), Some(Language::Rust));
        assert_eq!(Language::of_path(Path::new("x.mm")), Some(Language::Cpp));
        assert_eq!(Language::of_path(Path::new("x.hpp")), Some(Language::Cpp));
        assert_eq!(Language::of_path(Path::new("README.md")), None);
    }

    #[test]
    fn keeps_compile_rules() {
        let rules = compile_rules("rule cxx
  command = x
rule link
rule cc
rule dep_host_cc
rule CXX_COMPILER__bun_Debug
");
        assert_eq!(rules, ["cxx", "cc", "CXX_COMPILER__bun_Debug"]);
    }

    #[test]
    fn finds_project_roots() {
        let base = std::env::temp_dir().join(format!("bun-lsp-roots-{}", std::process::id()));
        let nested = base.join("pkg").join("src");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(base.join("Cargo.toml"), "[workspace]\nmembers = [\"pkg\"]\n").unwrap();
        std::fs::write(base.join("pkg").join("Cargo.toml"), "[package]\nname = \"pkg\"\n").unwrap();
        std::fs::write(base.join("pkg").join("tsconfig.json"), "{}").unwrap();
        let file = nested.join("lib.rs");
        assert_eq!(project_root(Language::Rust, &file), base);
        assert_eq!(project_root(Language::TypeScript, &nested.join("a.ts")), base.join("pkg"));
        std::fs::remove_dir_all(&base).unwrap();
    }
}
