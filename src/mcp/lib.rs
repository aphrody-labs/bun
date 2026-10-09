//! `bun mcp`: a Model Context Protocol server (protocol revision 2025-06-18) built into the
//! binary. It runs before the JavaScript runtime starts, speaks JSON-RPC over stdio (default) or
//! streamable HTTP (`--http <port>`), and bounds every response to a token budget, paging the rest
//! behind a cursor.
//!
//! Tools come from a [`registry::Registry`]: each built-in tool module exposes a
//! `&'static [registry::Tool]` slice; [`registry::Registry::builtin`] collects them. The tool
//! descriptors are the single source for `tools/list`, `bun mcp tools --json|--markdown` (the
//! manifest and the generated tool table of `docs/runtime/mcp.mdx`) and the manifest written by
//! `bun mcp install`. Another crate adds tools by passing its slices to [`main`].
// Pre-runtime CLI server: blocking std I/O, sockets, child processes with pipes and timeouts, and
// worker threads; none of the event-loop-bound bun_sys/bun_spawn paths apply before JSC starts.
#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::disallowed_macros
)]

mod budget;
mod cache;
mod cli;
mod embedded;
mod http;
mod install;
mod profile;
pub mod registry;
mod server;
mod sqlite;
mod tools;
mod util;

pub use cli::main;
pub use registry::{Annotations, Args, Context, Output, Registry, Tool, ToolError};
