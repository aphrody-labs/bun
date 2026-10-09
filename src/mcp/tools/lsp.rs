//! `lsp_*`: language-server answers through the `bun lsp` daemon of the file's workspace
//! (`bun_lsp::client`), which starts on first use and keeps its servers warm between calls.

use bun_lsp::{Options, Query, QueryKind};

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};

fn ask(ctx: &Context, args: &Args<'_>, kind: QueryKind, position: bool) -> Result<Output, ToolError> {
    let file = ctx.cwd.join(args.str("file")?);
    let mut query = if position {
        let line = args.uint("line", 0, u64::from(u32::MAX)) as u32;
        let column = args.uint("column", 0, u64::from(u32::MAX)) as u32;
        if line == 0 || column == 0 {
            return Err(ToolError::InvalidArgs("`line` and `column` are 1-based and required".into()));
        }
        Query::at(kind, file, line, column)
    } else {
        Query::new(kind, file)
    };
    query.text = args
        .opt_str("new_name")
        .or_else(|| args.opt_str("query"))
        .map(str::to_owned);
    query.apply = args.bool("apply", false);
    query.limit = args.get("limit").and_then(serde_json::Value::as_u64).map(|l| l.clamp(1, 1000) as usize);
    if let Some(ms) = args.get("timeout_ms").and_then(serde_json::Value::as_u64) {
        query.timeout_ms = Some(ms.clamp(100, 120_000));
    }
    let answer = bun_lsp::client::query(&query, &Options::from_env()).map_err(ToolError::Failed)?;
    Ok(Output::text(answer.render(&ctx.cwd)))
}

fn diagnostics(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    ask(ctx, args, QueryKind::Diagnostics, false)
}
fn definition(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    ask(ctx, args, QueryKind::Definition, true)
}
fn references(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    ask(ctx, args, QueryKind::References, true)
}
fn hover(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    ask(ctx, args, QueryKind::Hover, true)
}
fn rename(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    args.str("new_name")?;
    ask(ctx, args, QueryKind::Rename, true)
}
fn symbols(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let kind = if args.opt_str("query").is_some() {
        QueryKind::WorkspaceSymbols
    } else {
        QueryKind::Symbols
    };
    ask(ctx, args, kind, false)
}

const POSITION: &str = r#""file":{"type":"string","description":"File path, relative to the working directory"},"line":{"type":"integer","minimum":1,"description":"1-based line"},"column":{"type":"integer","minimum":1,"description":"1-based column (characters)"},"limit":{"type":"integer","minimum":1,"maximum":1000},"timeout_ms":{"type":"integer","minimum":100,"maximum":120000}"#;

macro_rules! schema {
    ($extra:literal, $required:literal) => {
        const_format::concatcp!(r#"{"type":"object","properties":{"#, POSITION, $extra, r#"},"required":"#, $required, "}")
    };
}

const NOTE: &str = " TypeScript/JavaScript, Python, Rust and C/C++, through `bun lsp`.";

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: "lsp_diagnostics",
        title: "Diagnostics",
        description: const_format::concatcp!("Type errors and lint diagnostics of a file.", NOTE),
        input_schema: schema!("", r#"["file"]"#),
        annotations: Annotations::READ_ONLY,
        call: diagnostics,
    },
    Tool {
        name: "lsp_definition",
        title: "Go to definition",
        description: const_format::concatcp!("Where the symbol at a position is defined.", NOTE),
        input_schema: schema!("", r#"["file","line","column"]"#),
        annotations: Annotations::READ_ONLY,
        call: definition,
    },
    Tool {
        name: "lsp_references",
        title: "Find references",
        description: const_format::concatcp!("Every reference to the symbol at a position.", NOTE),
        input_schema: schema!("", r#"["file","line","column"]"#),
        annotations: Annotations::READ_ONLY,
        call: references,
    },
    Tool {
        name: "lsp_hover",
        title: "Hover",
        description: const_format::concatcp!("Type and documentation of the symbol at a position.", NOTE),
        input_schema: schema!("", r#"["file","line","column"]"#),
        annotations: Annotations::READ_ONLY,
        call: hover,
    },
    Tool {
        name: "lsp_rename",
        title: "Rename symbol",
        description: const_format::concatcp!(
            "Rename the symbol at a position across the project: lists the edits, and writes them with apply: true.",
            NOTE
        ),
        input_schema: schema!(
            r#","new_name":{"type":"string"},"apply":{"type":"boolean","default":false}"#,
            r#"["file","line","column","new_name"]"#
        ),
        annotations: Annotations::DESTRUCTIVE,
        call: rename,
    },
    Tool {
        name: "lsp_symbols",
        title: "Symbols",
        description: const_format::concatcp!(
            "Outline of a file, or with `query` the workspace symbols matching it.",
            NOTE
        ),
        input_schema: schema!(r#","query":{"type":"string"}"#, r#"["file"]"#),
        annotations: Annotations::READ_ONLY,
        call: symbols,
    },
];
