//! Built-in tool modules. Each exposes `TOOLS: &[Tool]`; add a module here and to [`BUILTIN`] to
//! ship it in `bun mcp`.

use crate::registry::Tool;

pub(crate) mod docs;
pub(crate) mod graph;
pub(crate) mod memory;
pub(crate) mod run;
pub(crate) mod skills;

/// Tool slices in `tools/list` order.
pub(crate) const BUILTIN: &[&[Tool]] = &[
    docs::TOOLS,
    skills::TOOLS,
    memory::TOOLS,
    graph::TOOLS,
    run::TOOLS,
];
