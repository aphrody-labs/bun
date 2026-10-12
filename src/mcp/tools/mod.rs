//! Built-in tool modules. Each exposes `TOOLS: &[Tool]`; add a module here and to [`BUILTIN`] to
//! ship it in `bun mcp`.

use crate::registry::Tool;

pub(crate) mod agent;
pub(crate) mod browser;
pub(crate) mod docs;
pub(crate) mod examples;
pub(crate) mod graph;
pub(crate) mod host;
pub(crate) mod lsp;
pub(crate) mod memory;
pub(crate) mod run;
pub(crate) mod skills;
pub(crate) mod vfs;

/// Tool slices in `tools/list` order.
pub(crate) const BUILTIN: &[&[Tool]] = &[
    docs::TOOLS,
    examples::TOOLS,
    skills::TOOLS,
    memory::TOOLS,
    graph::TOOLS,
    host::TOOLS,
    vfs::TOOLS,
    lsp::TOOLS,
    run::TOOLS,
    browser::TOOLS,
    agent::TOOLS,
];
