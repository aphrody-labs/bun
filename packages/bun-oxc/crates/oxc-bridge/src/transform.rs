//! TypeScript/JSX to JavaScript through `oxc_transformer`, and minification through `oxc_minifier`.

use std::{fmt::Display, path::Path};

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_minifier::{Minifier, MinifierOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_transformer::{
    EnvOptions, JsxRuntime, TransformOptions as OxcTransformOptions, Transformer,
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
    let kind = source_type(filename)?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, kind).parse();
    if let Some(error) = parsed.diagnostics.first() {
        return Err(Error::syntax(error.to_string()));
    }
    let mut program = parsed.program;
    let result = Minifier::new(MinifierOptions::default()).minify(&allocator, &mut program);
    Ok(Codegen::new()
        .with_options(CodegenOptions::minify())
        .with_scoping(result.scoping)
        .build(&program)
        .code)
}
