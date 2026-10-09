//! TypeScript/JSX to JavaScript through `oxc_transformer`, `.d.ts` emit through
//! `oxc_isolated_declarations`, and minification through `oxc_minifier`.

use std::{fmt::Display, path::Path};

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_isolated_declarations::{IsolatedDeclarations, IsolatedDeclarationsOptions};
use oxc_minifier::{CompressOptions, MangleOptions, Minifier, MinifierOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_transformer::{
    EngineTargets, EnvOptions, HelperLoaderMode, JsxRuntime, ReactRefreshOptions,
    StyledComponentsOptions, TransformOptions as OxcTransformOptions, Transformer,
};

use crate::{Error, ErrorKind};

/// How JSX is compiled.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum Jsx {
    /// `react/jsx-runtime` imports (`_jsx`, `_jsxs`).
    #[default]
    Automatic,
    /// `React.createElement` calls (see [`TransformOptions::jsx_pragma`]).
    Classic,
}

/// Options of [`transform`].
#[derive(Clone, Debug, Default)]
pub struct TransformOptions {
    /// ECMAScript target (`es2015` ... `es2024`, `esnext`) or engine targets such as `chrome58`,
    /// comma separated. `None` keeps modern syntax untouched.
    pub target: Option<String>,
    /// JSX runtime. Defaults to automatic.
    pub jsx: Jsx,
    /// Package the automatic runtime imports from (default `react`).
    pub jsx_import_source: Option<String>,
    /// Classic runtime factory (default `React.createElement`).
    pub jsx_pragma: Option<String>,
    /// Classic runtime fragment (default `React.Fragment`).
    pub jsx_pragma_frag: Option<String>,
    /// Development JSX (`jsxDEV`, `__self`, `__source`).
    pub development: bool,
    /// Also produce a source map (JSON, version 3).
    pub sourcemap: bool,
    /// TypeScript `experimentalDecorators` lowering. Standard (2023-11) decorators are kept as written.
    pub decorators_legacy: bool,
    /// Emit `design:*` metadata for legacy decorators (`emitDecoratorMetadata`).
    pub emit_decorator_metadata: bool,
    /// React Fast Refresh registrations (`$RefreshReg$`, `$RefreshSig$`).
    pub react_refresh: bool,
    /// styled-components plugin with its default options (display names, file names, SSR ids).
    pub styled_components: bool,
    /// Import the helpers that lowering needs from this module (for example `@oxc-project/runtime`)
    /// instead of reading them from the `babelHelpers` global.
    pub helpers_module: Option<String>,
}

/// Options of [`minify_with`].
#[derive(Clone, Debug)]
pub struct MinifyOptions {
    /// Dead-code elimination and constant folding.
    pub compress: bool,
    /// Rename local bindings.
    pub mangle: bool,
    /// Also mangle top-level bindings (only safe for ES modules and isolated scripts).
    pub top_level: bool,
    /// Drop whitespace and comments.
    pub whitespace: bool,
    pub drop_console: bool,
    pub drop_debugger: bool,
    /// Engine targets for the compressor (`es2020`, `chrome90,safari15`). `None` means `esnext`.
    pub target: Option<String>,
    /// Also produce a source map (JSON, version 3).
    pub sourcemap: bool,
}

impl Default for MinifyOptions {
    fn default() -> Self {
        Self {
            compress: true,
            mangle: true,
            top_level: false,
            whitespace: true,
            drop_console: false,
            drop_debugger: true,
            target: None,
            sourcemap: false,
        }
    }
}

/// Result of [`transform`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transformed {
    pub code: String,
    /// Source map JSON, present when [`TransformOptions::sourcemap`] is set.
    pub map: Option<String>,
}

fn source_type(filename: &str) -> Result<SourceType, Error> {
    SourceType::from_path(Path::new(filename)).map_err(|error| Error::input(error.to_string()))
}

fn join<T: Display>(diagnostics: &[T]) -> String {
    diagnostics.iter().map(ToString::to_string).collect::<Vec<_>>().join("; ")
}

/// Compiles TypeScript and JSX to JavaScript. The extension of `filename` picks the syntax
/// (`.ts`, `.tsx`, `.jsx`, `.js`, `.mjs`, `.cts`, ...). Plain JavaScript passes through the
/// transformer too, so `target` lowers it as well.
pub fn transform(
    source: &str,
    filename: &str,
    options: &TransformOptions,
) -> Result<Transformed, Error> {
    let kind = source_type(filename)?;
    let path = Path::new(filename);
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, kind).parse();
    if !parsed.diagnostics.is_empty() {
        return Err(Error::syntax(join(&parsed.diagnostics)));
    }
    let mut program = parsed.program;
    let built =
        SemanticBuilder::new().with_excess_capacity(2.0).with_enum_eval(true).build(&program);
    let scoping = built.semantic.into_scoping();

    let mut transform = OxcTransformOptions::default();
    if let Some(target) = &options.target {
        transform.env = EnvOptions::from_target(target).map_err(Error::input)?;
    }
    transform.jsx.runtime = match options.jsx {
        Jsx::Automatic => JsxRuntime::Automatic,
        Jsx::Classic => JsxRuntime::Classic,
    };
    transform.jsx.development = options.development;
    transform.jsx.import_source.clone_from(&options.jsx_import_source);
    transform.jsx.pragma.clone_from(&options.jsx_pragma);
    transform.jsx.pragma_frag.clone_from(&options.jsx_pragma_frag);
    if options.react_refresh {
        transform.jsx.refresh = Some(ReactRefreshOptions::default());
    }
    transform.decorator.legacy = options.decorators_legacy;
    transform.decorator.emit_decorator_metadata = options.emit_decorator_metadata;
    if options.styled_components {
        transform.plugins.styled_components = Some(StyledComponentsOptions::default());
    }
    if let Some(module) = &options.helpers_module {
        transform.helper_loader.mode = HelperLoaderMode::Runtime;
        transform.helper_loader.module_name = module.clone().into();
    }

    let returned =
        Transformer::new(&allocator, path, &transform).build_with_scoping(scoping, &mut program);
    if !returned.diagnostics.is_empty() {
        return Err(Error::new(ErrorKind::Transform, join(&returned.diagnostics)));
    }

    let printed = Codegen::new()
        .with_options(CodegenOptions {
            source_map_path: options.sourcemap.then(|| path.to_path_buf()),
            ..CodegenOptions::default()
        })
        .build(&program);
    Ok(Transformed { code: printed.code, map: printed.map.map(|map| map.to_json_string()) })
}

/// Minifies (compress, mangle, whitespace) with Oxc's default options.
pub fn minify(source: &str, filename: &str) -> Result<String, Error> {
    minify_with(source, filename, &MinifyOptions::default()).map(|out| out.code)
}

/// Minifies with explicit compress, mangle and whitespace switches, optionally with a source map.
pub fn minify_with(
    source: &str,
    filename: &str,
    options: &MinifyOptions,
) -> Result<Transformed, Error> {
    let kind = source_type(filename)?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, kind).parse();
    if let Some(error) = parsed.diagnostics.first() {
        return Err(Error::syntax(error.to_string()));
    }
    let mut program = parsed.program;
    let compress = if options.compress {
        let mut compress = CompressOptions {
            drop_console: options.drop_console,
            drop_debugger: options.drop_debugger,
            ..CompressOptions::default()
        };
        if let Some(target) = &options.target {
            compress.target = EngineTargets::from_target(target).map_err(Error::input)?;
        }
        Some(compress)
    } else {
        None
    };
    let mangle = options
        .mangle
        .then(|| MangleOptions { top_level: Some(options.top_level), ..MangleOptions::default() });
    let result = Minifier::new(MinifierOptions { mangle, compress, ..MinifierOptions::default() })
        .minify(&allocator, &mut program);
    let base = if options.whitespace { CodegenOptions::minify() } else { CodegenOptions::default() };
    let printed = Codegen::new()
        .with_options(CodegenOptions {
            source_map_path: options.sourcemap.then(|| Path::new(filename).to_path_buf()),
            ..base
        })
        .with_scoping(result.scoping)
        .build(&program);
    Ok(Transformed { code: printed.code, map: printed.map.map(|map| map.to_json_string()) })
}

/// `.d.ts` text for a TypeScript module under `--isolatedDeclarations`. Exports that need inference
/// fail with [`ErrorKind::Transform`].
pub fn isolated_declaration(
    source: &str,
    filename: &str,
    strip_internal: bool,
    sourcemap: bool,
) -> Result<Transformed, Error> {
    let kind = source_type(filename)?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, kind).parse();
    if !parsed.diagnostics.is_empty() {
        return Err(Error::syntax(join(&parsed.diagnostics)));
    }
    let returned =
        IsolatedDeclarations::new(&allocator, IsolatedDeclarationsOptions { strip_internal })
            .build(&parsed.program);
    if !returned.diagnostics.is_empty() {
        return Err(Error::new(ErrorKind::Transform, join(&returned.diagnostics)));
    }
    let path = Path::new(filename);
    let printed = Codegen::new()
        .with_options(CodegenOptions {
            source_map_path: sourcemap.then(|| path.with_extension("d.ts")),
            ..CodegenOptions::default()
        })
        .build(&returned.program);
    Ok(Transformed { code: printed.code, map: printed.map.map(|map| map.to_json_string()) })
}

fn json_str(options: &serde_json::Value, key: &str) -> Result<Option<String>, Error> {
    match options.get(key) {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::String(value)) => Ok(Some(value.clone())),
        Some(_) => Err(Error::input(format!("{key} must be a string"))),
    }
}

fn json_bool(options: &serde_json::Value, key: &str, default: bool) -> Result<bool, Error> {
    match options.get(key) {
        None | Some(serde_json::Value::Null) => Ok(default),
        Some(serde_json::Value::Bool(value)) => Ok(*value),
        Some(_) => Err(Error::input(format!("{key} must be a boolean"))),
    }
}

fn json_object(options: &serde_json::Value) -> Result<(), Error> {
    if options.is_null() || options.is_object() {
        Ok(())
    } else {
        Err(Error::input("options must be an object"))
    }
}

impl TransformOptions {
    /// Reads the camelCase JSON form used by the C ABI and the npm package:
    /// `{ target, jsx: "automatic" | "classic", jsxImportSource, jsxPragma, jsxPragmaFrag, development,
    /// sourcemap, decorators: "legacy" | "standard", emitDecoratorMetadata, reactRefresh,
    /// styledComponents, helpersModule }`.
    pub fn from_json(options: &serde_json::Value) -> Result<Self, Error> {
        json_object(options)?;
        let jsx = match json_str(options, "jsx")?.as_deref() {
            None | Some("automatic") => Jsx::Automatic,
            Some("classic") => Jsx::Classic,
            Some(other) => {
                return Err(Error::input(format!(
                    "jsx must be \"automatic\" or \"classic\", got \"{other}\""
                )));
            },
        };
        let decorators_legacy = match json_str(options, "decorators")?.as_deref() {
            None | Some("standard") => false,
            Some("legacy") => true,
            Some(other) => {
                return Err(Error::input(format!(
                    "decorators must be \"legacy\" or \"standard\", got \"{other}\""
                )));
            },
        };
        Ok(Self {
            target: json_str(options, "target")?,
            jsx,
            jsx_import_source: json_str(options, "jsxImportSource")?,
            jsx_pragma: json_str(options, "jsxPragma")?,
            jsx_pragma_frag: json_str(options, "jsxPragmaFrag")?,
            development: json_bool(options, "development", false)?,
            sourcemap: json_bool(options, "sourcemap", false)?,
            decorators_legacy,
            emit_decorator_metadata: json_bool(options, "emitDecoratorMetadata", false)?,
            react_refresh: json_bool(options, "reactRefresh", false)?,
            styled_components: json_bool(options, "styledComponents", false)?,
            helpers_module: json_str(options, "helpersModule")?,
        })
    }
}

impl MinifyOptions {
    /// Reads `{ compress, mangle, topLevel, whitespace, dropConsole, dropDebugger, target, sourcemap }`.
    pub fn from_json(options: &serde_json::Value) -> Result<Self, Error> {
        json_object(options)?;
        let base = Self::default();
        Ok(Self {
            compress: json_bool(options, "compress", base.compress)?,
            mangle: json_bool(options, "mangle", base.mangle)?,
            top_level: json_bool(options, "topLevel", base.top_level)?,
            whitespace: json_bool(options, "whitespace", base.whitespace)?,
            drop_console: json_bool(options, "dropConsole", base.drop_console)?,
            drop_debugger: json_bool(options, "dropDebugger", base.drop_debugger)?,
            target: json_str(options, "target")?,
            sourcemap: json_bool(options, "sourcemap", base.sourcemap)?,
        })
    }
}
