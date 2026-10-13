use aphrody_oxc_tools::{FixMode, FormatOptions, LintOptions};
use std::{
    collections::BTreeSet,
    io::Write,
    path::{Path, PathBuf},
};

const HELP: &str = "Usage: bun lint|fmt [options] [files or directories]\nEmbedded OXC; no package installation or subprocess backend.\n  -c, --config PATH  Native JSON/JSONC configuration\n  --ignore-pattern GLOB  Exclude matching paths\n  --fix             Apply safe lint fixes\n  --check           Check formatting without writing\n  --write           Write formatted files\n  --stdin-filepath NAME  Format UTF-8 stdin as a virtual file (fmt only; maximum 8 MiB)\n  --format json|github|default  Lint diagnostic format\n  --deny-warnings   Treat lint warnings as failure\n  --no-n2b          Compatibility flag; native lint runs OXC rules only\nUnsupported JS plugins and embedded Prettier formatting fail explicitly.\n";

fn format_stdin(
    filename: &str,
    cwd: PathBuf,
    config: Option<PathBuf>,
    check: bool,
) -> Result<u8, String> {
    if filename.is_empty() || filename.as_bytes().contains(&0) {
        return Err("--stdin-filepath needs a virtual file name".into());
    }
    let mut source = Vec::new();
    let stdin = bun_sys::File::stdin();
    let mut buffer = [0_u8; 8192];
    loop {
        let count = stdin
            .read(&mut buffer)
            .map_err(|error| format!("stdin: {error:?}"))?;
        if count == 0 {
            break;
        }
        if source.len() + count > 8 * 1024 * 1024 {
            return Err("formatter stdin exceeds 8 MiB".into());
        }
        source.extend_from_slice(&buffer[..count]);
    }
    let source = std::str::from_utf8(&source).map_err(|_| "formatter stdin must be UTF-8")?;
    let formatted = aphrody_oxc_tools::format(
        source,
        filename,
        &FormatOptions {
            cwd: Some(cwd),
            config_path: config,
            discover_config: false,
            ..Default::default()
        },
    )
    .map_err(|error| error.to_string())?;
    if check {
        return Ok(u8::from(formatted != source));
    }
    bun_sys::File::stdout()
        .write_all(formatted.as_bytes())
        .map_err(|error| format!("stdout: {error:?}"))?;
    Ok(0)
}

pub(crate) fn exec_if_selected() -> Option<u8> {
    let argv = bun_core::argv().into_iter().collect::<Vec<_>>();
    let mut skip = false;
    let at = argv.iter().enumerate().find_map(|(index, arg)| {
        if skip {
            skip = false;
            return None;
        }
        if *arg == b"--cwd" {
            skip = true;
            return None;
        }
        matches!(*arg, b"lint" | b"fmt").then_some(index)
    })?;
    let lint = argv[at] == b"lint";
    let args = argv[at + 1..]
        .iter()
        .map(|arg| {
            std::str::from_utf8(arg)
                .map(str::to_owned)
                .map_err(|error| error.to_string())
        })
        .collect::<Result<Vec<_>, _>>();
    Some(match args.and_then(|args| run(lint, &args)) {
        Ok(code) => code,
        Err(error) => {
            bun_core::Output::err_generic("{}", (error,));
            2
        }
    })
}

fn path_bytes(path: &Path) -> Result<&[u8], String> {
    path.to_str()
        .map(str::as_bytes)
        .ok_or_else(|| "non-UTF-8 path is unsupported".into())
}

fn read(path: &Path) -> Result<String, String> {
    let file = bun_sys::File::openat(bun_sys::Fd::cwd(), path_bytes(path)?, bun_sys::O::RDONLY, 0)
        .map_err(|error| format!("{}: {error:?}", path.display()))?;
    let bytes = file.read_to_end().map_err(|error| format!("{error:?}"))?;
    std::str::from_utf8(&bytes)
        .map(str::to_owned)
        .map_err(|error| format!("{}: {error}", path.display()))
}

fn write(path: &Path, source: &str) -> Result<(), String> {
    let file = bun_sys::File::openat(
        bun_sys::Fd::cwd(),
        path_bytes(path)?,
        bun_sys::O::WRONLY | bun_sys::O::TRUNC,
        0,
    )
    .map_err(|error| format!("{}: {error:?}", path.display()))?;
    file.write_all(source.as_bytes())
        .map_err(|error| format!("{error:?}"))
}

fn canonical_config(value: &mut serde_json::Value) {
    if let Some(fields) = value.as_object_mut() {
        fields.retain(|_, value| !value.is_null());
        if let Some(rules) = fields
            .get_mut("rules")
            .and_then(serde_json::Value::as_object_mut)
        {
            for rule in rules.values_mut() {
                if let Some(parts) = rule.as_array_mut() {
                    if parts.len() == 2 && parts[1].is_array() {
                        let options = parts.pop().unwrap();
                        parts.extend(options.as_array().unwrap().iter().cloned());
                    }
                }
            }
        }
        if let Some(overrides) = fields
            .get_mut("overrides")
            .and_then(serde_json::Value::as_array_mut)
        {
            for entry in overrides {
                canonical_config(entry);
            }
        }
    }
}

fn lint_config(
    path: &Path,
    file: &Path,
) -> Result<(serde_json::Value, Option<String>, bool), String> {
    let owner = path.parent().ok_or("configuration has no parent")?;
    let parsed = oxc_linter::Oxlintrc::from_file(path).map_err(|error| error.to_string())?;
    let mut value = serde_json::to_value(parsed).map_err(|error| error.to_string())?;
    canonical_config(&mut value);
    if value["extends"]
        .as_array()
        .is_some_and(|items| !items.is_empty())
    {
        return Err("native custom-plugin configuration extends is not yet supported".into());
    }
    let relative = file
        .strip_prefix(owner)
        .map_err(|_| "lint file is outside config directory")?;
    let matches = |patterns: &serde_json::Value| -> Result<bool, String> {
        let mut matched = false;
        if let Some(patterns) = patterns.as_array() {
            for pattern in patterns {
                let pattern = pattern
                    .as_str()
                    .ok_or("configuration patterns must be strings")?;
                if pattern.starts_with('!') {
                    return Err("negated native config patterns are not yet supported".into());
                }
                matched |= globset::Glob::new(pattern)
                    .map_err(|error| error.to_string())?
                    .compile_matcher()
                    .is_match(relative);
            }
        }
        Ok(matched)
    };
    let ignored = matches(&value["ignorePatterns"])?;
    let mut severity = None;
    fn strip_rules(
        value: &mut serde_json::Value,
        selected: bool,
        severity: &mut Option<String>,
    ) -> Result<(), String> {
        if let Some(rules) = value
            .get_mut("rules")
            .and_then(serde_json::Value::as_object_mut)
        {
            if let Some(rule) = rules.remove("bun/no-duplicate-conditional-property-access") {
                let rule = rule
                    .as_array()
                    .and_then(|rules| rules.first())
                    .unwrap_or(&rule);
                let level = match rule.as_str() {
                    Some("error" | "deny") => Some("error"),
                    Some("warn") => Some("warning"),
                    Some("off" | "allow") => None,
                    _ => match rule.as_u64() {
                        Some(0) => None,
                        Some(1) => Some("warning"),
                        Some(2) => Some("error"),
                        _ => return Err("unsupported Bun rule severity".into()),
                    },
                };
                if selected {
                    *severity = level.map(str::to_owned);
                }
            }
        }
        Ok(())
    }
    if let Some(plugins) = value["jsPlugins"].as_array() {
        for plugin in plugins {
            let plugin = plugin
                .as_str()
                .ok_or("native JS plugin entry must be a path")?;
            let actual = read(&owner.join(plugin))?;
            if actual.as_bytes() != include_bytes!("../../../scripts/oxlint-plugins/bun.js") {
                return Err(format!(
                    "unsupported JS plugin: {plugin}; only the compiled Bun rule source is accepted"
                ));
            }
        }
    }
    let has_plugin = value["jsPlugins"]
        .as_array()
        .is_some_and(|plugins| !plugins.is_empty());
    value
        .as_object_mut()
        .ok_or("invalid lint configuration")?
        .remove("jsPlugins");
    strip_rules(&mut value, true, &mut severity)?;
    if let Some(overrides) = value
        .get_mut("overrides")
        .and_then(serde_json::Value::as_array_mut)
    {
        for entry in overrides {
            if entry["jsPlugins"]
                .as_array()
                .is_some_and(|plugins| !plugins.is_empty())
            {
                return Err("native override JS plugins are unsupported".into());
            }
            let selected = matches(&entry["files"])?;
            strip_rules(entry, selected, &mut severity)?;
        }
    }
    if severity.is_some() && !has_plugin {
        return Err("Bun custom rule requires its compiled plugin declaration".into());
    }
    Ok((value, severity, ignored))
}

fn collect(
    path: &Path,
    lint: bool,
    files: &mut BTreeSet<PathBuf>,
    depth: usize,
) -> Result<(), String> {
    if path.components().any(|component| {
        matches!(component, std::path::Component::ParentDir)
            || matches!(
                component.as_os_str().to_str(),
                Some(
                    ".aphrody"
                        | ".codex"
                        | ".claude"
                        | "cookies"
                        | "sessions"
                        | "credentials"
                        | "secrets"
                )
            )
    }) {
        return Err(format!(
            "protected or parent-traversing quality path: {}",
            path.display()
        ));
    }
    if depth > 128 {
        return Err("directory nesting exceeds 128 levels".into());
    }
    if let Ok(dir) = bun_sys::Dir::open(path_bytes(path)?) {
        let mut iter = bun_sys::dir_iterator::iterate(dir.fd());
        while let Some(entry) = iter.next().map_err(|error| format!("{error:?}"))? {
            let name = entry.name.slice_u8();
            if matches!(
                name,
                b".git"
                    | b"node_modules"
                    | b"target"
                    | b".aphrody"
                    | b".codex"
                    | b".claude"
                    | b"cookies"
                    | b"sessions"
                    | b"credentials"
            ) {
                continue;
            }
            if !matches!(
                entry.kind,
                bun_sys::FileKind::File | bun_sys::FileKind::Directory
            ) {
                continue;
            }
            let name = std::str::from_utf8(name).map_err(|error| error.to_string())?;
            collect(&path.join(name), lint, files, depth + 1)?;
        }
    } else {
        let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
        let supported = matches!(
            extension,
            "js" | "jsx" | "ts" | "tsx" | "mjs" | "cjs" | "mts" | "cts"
        ) || (!lint
            && matches!(
                extension,
                "json"
                    | "jsonc"
                    | "json5"
                    | "css"
                    | "scss"
                    | "html"
                    | "vue"
                    | "yaml"
                    | "yml"
                    | "md"
                    | "mdx"
                    | "graphql"
                    | "gql"
                    | "toml"
                    | "less"
                    | "hbs"
                    | "handlebars"
            ));
        if supported {
            files.insert(path.to_owned());
        }
    }
    Ok(())
}

fn run(lint: bool, args: &[String]) -> Result<u8, String> {
    if args
        .iter()
        .any(|arg| matches!(arg.as_str(), "--help" | "-h"))
    {
        std::io::stdout()
            .write_all(
                format!(
                    "Usage: bun {} {}",
                    if lint { "lint" } else { "fmt" },
                    &HELP[20..]
                )
                .as_bytes(),
            )
            .map_err(|error| error.to_string())?;
        return Ok(0);
    }
    let cwd_bytes = super::check_command::working_directory();
    let cwd = PathBuf::from(std::str::from_utf8(&cwd_bytes).map_err(|error| error.to_string())?);
    let (mut config, mut fix, mut check, mut deny, mut format) =
        (None, FixMode::None, false, false, "default".to_owned());
    let mut roots = Vec::new();
    let mut stdin_filename = None;
    let mut write_requested = false;
    let mut ignores = globset::GlobSetBuilder::new();
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--" => {
                roots.extend(args.cloned());
                break;
            }
            "--no-n2b" => {}
            "--fix" if lint => fix = FixMode::Safe,
            "--fix-suggestions" if lint => fix = FixMode::Suggestions,
            "--fix-dangerously" if lint => fix = FixMode::Dangerous,
            "--check" if !lint => check = true,
            "--write" if !lint => {
                check = false;
                write_requested = true;
            }
            "--stdin-filepath" if !lint => {
                if stdin_filename.is_some() {
                    return Err("--stdin-filepath may be provided only once".into());
                }
                stdin_filename = Some(args.next().ok_or("--stdin-filepath needs a name")?.clone());
            }
            "--deny-warnings" if lint => deny = true,
            "--config" | "-c" => {
                config = Some(cwd.join(args.next().ok_or("--config needs a path")?))
            }
            "--format" if lint => format.clone_from(args.next().ok_or("--format needs a value")?),
            "--ignore-pattern" => {
                ignores.add(
                    globset::Glob::new(args.next().ok_or("--ignore-pattern needs a glob")?)
                        .map_err(|error| error.to_string())?,
                );
            }
            value if value.starts_with("--config=") => config = Some(cwd.join(&value[9..])),
            value if lint && value.starts_with("--format=") => value[9..].clone_into(&mut format),
            value if value.starts_with('-') => {
                return Err(format!("unsupported native option: {value}"));
            }
            value => roots.push(value.to_owned()),
        }
    }
    if !matches!(format.as_str(), "default" | "json" | "github") {
        return Err(format!("unsupported diagnostic format: {format}"));
    }
    if let Some(filename) = stdin_filename {
        if write_requested || !roots.is_empty() {
            return Err(
                "formatter stdin cannot be combined with --write or filesystem operands".into(),
            );
        }
        return format_stdin(&filename, cwd, config, check);
    }
    if roots.is_empty() {
        roots.push(".".into());
    }
    let ignores = ignores.build().map_err(|error| error.to_string())?;
    let mut files = BTreeSet::new();
    for root in roots {
        collect(&cwd.join(root), lint, &mut files, 0)?;
    }
    let mut diagnostics = Vec::new();
    let mut failed = false;
    for file in files {
        let relative = file.strip_prefix(&cwd).unwrap_or(&file);
        if ignores.is_match(relative) {
            continue;
        }
        let mut ignored = false;
        let mut directories = file
            .ancestors()
            .skip(1)
            .take_while(|dir| dir.starts_with(&cwd))
            .collect::<Vec<_>>();
        directories.reverse();
        for directory in directories {
            let gitignore = directory.join(".gitignore");
            if !bun_sys::exists(path_bytes(&gitignore)?) {
                continue;
            }
            let mut builder = ignore::gitignore::GitignoreBuilder::new(directory);
            if let Some(error) = builder.add(gitignore) {
                return Err(error.to_string());
            }
            let rules = builder.build().map_err(|error| error.to_string())?;
            let matched = rules.matched_path_or_any_parents(&file, false);
            if matched.is_ignore() {
                ignored = true;
            } else if matched.is_whitelist() {
                ignored = false;
            }
        }
        if ignored {
            continue;
        }
        let source = read(&file)?;
        let filename = file.to_str().ok_or("non-UTF-8 path")?;
        if lint {
            let (inline_config, bun_severity, config_ignored) = if let Some(config) = &config {
                let (value, severity, ignored) = lint_config(config, &file)?;
                (Some(value), severity, ignored)
            } else {
                (None, None, false)
            };
            if config_ignored {
                continue;
            }
            let report = aphrody_oxc_tools::lint(
                &source,
                filename,
                &LintOptions {
                    cwd: Some(
                        config
                            .as_ref()
                            .and_then(|config| config.parent())
                            .unwrap_or(&cwd)
                            .to_owned(),
                    ),
                    config_path: config.clone(),
                    config: inline_config,
                    discover_config: true,
                    fix,
                    ..Default::default()
                },
            )
            .map_err(|error| error.to_string())?;
            let builtin = file.starts_with(cwd.join("src/js/builtins"));
            let metadata = if builtin || bun_severity.is_some() {
                match aphrody_oxc_bridge::parse_with_comments(&source, filename) {
                    Ok(metadata) => Some(metadata),
                    Err(_) if report.error_count > 0 => None,
                    Err(error) => return Err(error.to_string()),
                }
            } else {
                None
            };
            if let Some(fixed) = report.fixed {
                write(&file, &fixed)?;
            }
            for mut diagnostic in report.diagnostics {
                if builtin
                    && metadata.as_ref().is_some_and(|metadata| {
                        super::native_quality_bun_rule::compiler_directive(
                            &metadata["program"],
                            &diagnostic,
                        )
                    })
                {
                    continue;
                }
                failed |= diagnostic["severity"] == "error"
                    || (deny && diagnostic["severity"] == "warning");
                diagnostic["filename"] =
                    serde_json::Value::from(relative.to_string_lossy().into_owned());
                diagnostics.push(diagnostic);
            }
            if let (Some(severity), Some(metadata)) = (bun_severity, metadata.as_ref()) {
                for mut diagnostic in
                    super::native_quality_bun_rule::diagnostics(&metadata["program"], &severity)
                {
                    if super::native_quality_bun_rule::suppressed(
                        &source,
                        &metadata["comments"],
                        &diagnostic,
                    ) {
                        continue;
                    }
                    failed |= severity == "error" || deny;
                    diagnostic["filename"] =
                        serde_json::Value::from(relative.to_string_lossy().into_owned());
                    diagnostics.push(diagnostic);
                }
            }
        } else {
            let formatted = aphrody_oxc_tools::format(
                &source,
                filename,
                &FormatOptions {
                    cwd: Some(cwd.clone()),
                    config_path: config.clone(),
                    discover_config: true,
                    ..Default::default()
                },
            )
            .map_err(|error| error.to_string())?;
            if formatted != source {
                if check {
                    failed = true;
                    diagnostics.push(serde_json::json!({"filename": relative.to_string_lossy(), "severity": "error", "message": "formatting differs"}));
                } else {
                    write(&file, &formatted)?;
                }
            }
        }
    }
    let mut stdout = std::io::stdout().lock();
    if format == "json" {
        writeln!(
            stdout,
            "{}",
            serde_json::json!({"diagnostics": diagnostics})
        )
        .map_err(|error| error.to_string())?;
    } else {
        for diagnostic in diagnostics {
            let filename = diagnostic["filename"].as_str().unwrap_or("");
            let severity = diagnostic["severity"].as_str().unwrap_or("error");
            let message = diagnostic["message"].as_str().unwrap_or("");
            if format == "github" {
                let escape = |value: &str| {
                    let mut escaped = String::with_capacity(value.len());
                    for character in value.chars() {
                        match character {
                            '%' => escaped.push_str("%25"),
                            '\r' => escaped.push_str("%0D"),
                            '\n' => escaped.push_str("%0A"),
                            ':' => escaped.push_str("%3A"),
                            ',' => escaped.push_str("%2C"),
                            character => escaped.push(character),
                        }
                    }
                    escaped
                };
                writeln!(
                    stdout,
                    "::{severity} file={}::{}",
                    escape(filename),
                    escape(message)
                )
                .map_err(|error| error.to_string())?;
            } else {
                writeln!(stdout, "{filename}: {severity}: {message}")
                    .map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(u8::from(failed))
}
