//! Node/webpack-style module resolution through `oxc_resolver`.

use std::path::{Path, PathBuf};

use oxc_resolver::{
    AliasValue, EnforceExtension, ResolveOptions, Resolver, TsconfigDiscovery, TsconfigOptions,
    TsconfigReferences,
};
use serde_json::Value;

use crate::Error;

/// A string or an array of strings.
fn string_list(value: &Value, key: &str) -> Result<Vec<String>, Error> {
    let invalid = || Error::input(format!("{key} must be an array of strings"));
    match value {
        Value::String(item) => Ok(vec![item.clone()]),
        Value::Array(items) => items
            .iter()
            .map(|item| item.as_str().map(str::to_owned).ok_or_else(invalid))
            .collect(),
        _ => Err(invalid()),
    }
}

fn strings(value: &Value, key: &str) -> Result<Option<Vec<String>>, Error> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(list) => string_list(list, key).map(Some),
    }
}

fn flag(value: &Value, key: &str) -> Result<Option<bool>, Error> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(flag)) => Ok(Some(*flag)),
        Some(_) => Err(Error::input(format!("{key} must be a boolean"))),
    }
}

/// `{ "@/x": "./src/x", "fs": false, "a": ["./a1", "./a2"] }`.
fn alias(value: &Value, key: &str) -> Result<Option<Vec<(String, Vec<AliasValue>)>>, Error> {
    let Some(map) = value.get(key) else { return Ok(None) };
    let Some(map) = map.as_object() else {
        return Err(Error::input(format!("{key} must be an object")));
    };
    let target = |item: &Value| match item {
        Value::String(path) => Ok(AliasValue::Path(path.clone())),
        Value::Bool(false) => Ok(AliasValue::Ignore),
        _ => Err(Error::input(format!("{key} values must be strings, arrays of strings or false"))),
    };
    map.iter()
        .map(|(name, item)| {
            let targets = match item {
                Value::Array(items) => items.iter().map(target).collect::<Result<Vec<_>, _>>()?,
                other => vec![target(other)?],
            };
            Ok((name.clone(), targets))
        })
        .collect::<Result<Vec<_>, _>>()
        .map(Some)
}

/// Maps the camelCase JSON options of the `oxc-resolver` npm package onto [`ResolveOptions`].
pub fn resolve_options(options: &Value) -> Result<ResolveOptions, Error> {
    if !options.is_null() && !options.is_object() {
        return Err(Error::input("resolve options must be an object"));
    }
    let mut out = ResolveOptions::default();
    if let Some(cwd) = options.get("cwd").and_then(Value::as_str) {
        out.cwd = Some(PathBuf::from(cwd));
    }
    match options.get("tsconfig") {
        None | Some(Value::Null) => {},
        Some(Value::String(auto)) if auto == "auto" => out.tsconfig = Some(TsconfigDiscovery::Auto),
        Some(Value::String(path)) => {
            out.tsconfig = Some(TsconfigDiscovery::Manual(TsconfigOptions {
                config_file: PathBuf::from(path),
                references: TsconfigReferences::Auto,
            }));
        },
        Some(Value::Object(tsconfig)) => {
            let config_file = tsconfig
                .get("configFile")
                .and_then(Value::as_str)
                .ok_or_else(|| Error::input("tsconfig.configFile must be a string"))?;
            let references = match tsconfig.get("references").and_then(Value::as_str) {
                Some("disabled") => TsconfigReferences::Disabled,
                _ => TsconfigReferences::Auto,
            };
            out.tsconfig = Some(TsconfigDiscovery::Manual(TsconfigOptions {
                config_file: PathBuf::from(config_file),
                references,
            }));
        },
        Some(_) => return Err(Error::input("tsconfig must be \"auto\", a path or an object")),
    }
    if let Some(alias) = alias(options, "alias")? {
        out.alias = alias;
    }
    if let Some(fallback) = alias(options, "fallback")? {
        out.fallback = fallback;
    }
    if let Some(fields) = strings(options, "aliasFields")? {
        out.alias_fields = fields.into_iter().map(|field| vec![field]).collect();
    }
    if let Some(names) = strings(options, "conditionNames")? {
        out.condition_names = names;
    }
    if let Some(fields) = strings(options, "exportsFields")? {
        out.exports_fields = fields.into_iter().map(|field| vec![field]).collect();
    }
    if let Some(fields) = strings(options, "importsFields")? {
        out.imports_fields = fields.into_iter().map(|field| vec![field]).collect();
    }
    if let Some(map) = options.get("extensionAlias").filter(|map| !map.is_null()) {
        let map =
            map.as_object().ok_or_else(|| Error::input("extensionAlias must be an object"))?;
        let mut list = Vec::with_capacity(map.len());
        for (extension, targets) in map {
            let targets = string_list(targets, extension)?;
            list.push((extension.clone(), targets));
        }
        out.extension_alias = list;
    }
    if let Some(extensions) = strings(options, "extensions")? {
        out.extensions = extensions;
    }
    if let Some(fields) = strings(options, "mainFields")? {
        out.main_fields = fields;
    }
    if let Some(files) = strings(options, "mainFiles")? {
        out.main_files = files;
    }
    if let Some(modules) = strings(options, "modules")? {
        out.modules = modules;
    }
    if let Some(roots) = strings(options, "roots")? {
        out.roots = roots.into_iter().map(PathBuf::from).collect();
    }
    match options.get("enforceExtension") {
        None | Some(Value::Null) => {},
        Some(Value::Bool(true)) => out.enforce_extension = EnforceExtension::Enabled,
        Some(Value::Bool(false)) => out.enforce_extension = EnforceExtension::Disabled,
        Some(_) => return Err(Error::input("enforceExtension must be a boolean")),
    }
    if let Some(flag) = flag(options, "fullySpecified")? {
        out.fully_specified = flag;
    }
    if let Some(flag) = flag(options, "preferRelative")? {
        out.prefer_relative = flag;
    }
    if let Some(flag) = flag(options, "preferAbsolute")? {
        out.prefer_absolute = flag;
    }
    if let Some(flag) = flag(options, "resolveToContext")? {
        out.resolve_to_context = flag;
    }
    if let Some(flag) = flag(options, "symlinks")? {
        out.symlinks = flag;
    }
    if let Some(flag) = flag(options, "nodePath")? {
        out.node_path = flag;
    }
    if let Some(flag) = flag(options, "builtinModules")? {
        out.builtin_modules = flag;
    }
    if let Some(flag) = flag(options, "moduleType")? {
        out.module_type = flag;
    }
    Ok(out)
}

/// Resolves `specifier` from `from`: a directory, or a file when it has an extension and exists as a
/// file (the only mode where `tsconfig: "auto"` applies). Returns
/// `{ path, query, fragment, moduleType }`; a failed resolution is [`crate::ErrorKind::Resolve`].
pub fn resolve(from: &str, specifier: &str, options: &Value) -> Result<Value, Error> {
    let resolver = Resolver::new(resolve_options(options)?);
    let from_path = Path::new(from);
    let resolution = if from_path.is_file() {
        resolver.resolve_file(from_path, specifier)
    } else {
        resolver.resolve(from_path, specifier)
    }
    .map_err(|error| Error::resolve(error.to_string()))?;
    Ok(serde_json::json!({
        "path": resolution.path().to_string_lossy(),
        "query": resolution.query(),
        "fragment": resolution.fragment(),
        "moduleType": resolution.module_type().map(|kind| format!("{kind:?}").to_ascii_lowercase()),
    }))
}
