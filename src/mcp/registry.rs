//! Tool registry: the extension point of `bun mcp`.
//!
//! A tool is a static [`Tool`] descriptor: name, title, description, JSON Schema of its
//! arguments, behaviour [`Annotations`] and a `call` function. A module groups its tools in a
//! `pub const TOOLS: &[Tool]` slice and is listed in [`Registry::builtin`]; a crate outside
//! `bun_mcp` passes its slices to [`crate::main`] instead.
//!
//! ```ignore
//! pub const TOOLS: &[Tool] = &[Tool {
//!     name: "hello",
//!     title: "Hello",
//!     description: "Greets someone.",
//!     input_schema: r#"{"type":"object","properties":{"who":{"type":"string"}},"required":["who"]}"#,
//!     annotations: Annotations::READ_ONLY,
//!     call: |_ctx, args| Ok(Output::text(format!("hello {}", args.str("who")?))),
//! }];
//! ```
//!
//! The server adds two arguments to every schema: `cursor` (resume a truncated result) and
//! `max_tokens` (per-call budget). Tools return plain text; the server truncates it to the budget
//! and pages the remainder, so a tool only bounds its own work (file counts, result limits).
//! State that outlives one call (indexes, connections) lives in [`Context::state`].

use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde_json::{Map, Value, json};

use crate::profile::Profile;

/// Behaviour hints sent as MCP tool annotations.
#[derive(Clone, Copy, Debug)]
pub struct Annotations {
    pub read_only: bool,
    pub destructive: bool,
    pub idempotent: bool,
    pub open_world: bool,
}

impl Annotations {
    /// Reads local state only.
    pub const READ_ONLY: Self = Self {
        read_only: true,
        destructive: false,
        idempotent: true,
        open_world: false,
    };
    /// Writes local state without destroying data (creates or updates records).
    pub const WRITE: Self = Self {
        read_only: false,
        destructive: false,
        idempotent: true,
        open_world: false,
    };
    /// Rewrites or deletes user files, or runs arbitrary code.
    pub const DESTRUCTIVE: Self = Self {
        read_only: false,
        destructive: true,
        idempotent: false,
        open_world: true,
    };
}

/// A tool descriptor. See the module documentation.
pub struct Tool {
    pub name: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    /// JSON Schema (an `object` schema) of the arguments, as a JSON literal.
    pub input_schema: &'static str,
    pub annotations: Annotations,
    pub call: fn(&Context, &Args<'_>) -> Result<Output, ToolError>,
}

/// The text result of a tool call.
pub struct Output {
    pub text: String,
    pub is_error: bool,
}

impl Output {
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            is_error: false,
        }
    }
    pub fn error(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            is_error: true,
        }
    }
}

/// A failed call. `InvalidArgs` maps to JSON-RPC `-32602`; `Failed` to an `isError` result the
/// model can read and recover from.
#[derive(Debug)]
pub enum ToolError {
    InvalidArgs(String),
    Failed(String),
}

impl<E: std::fmt::Display> From<E> for ToolError {
    fn from(e: E) -> Self {
        ToolError::Failed(e.to_string())
    }
}

/// Typed accessors over a call's `arguments` object.
pub struct Args<'a>(pub &'a Map<String, Value>);

impl Args<'_> {
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.0.get(key).filter(|v| !v.is_null())
    }
    pub fn str(&self, key: &str) -> Result<&str, ToolError> {
        self.opt_str(key)
            .ok_or_else(|| ToolError::InvalidArgs(format!("missing string argument `{key}`")))
    }
    pub fn opt_str(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(Value::as_str)
    }
    pub fn uint(&self, key: &str, default: u64, max: u64) -> u64 {
        self.get(key)
            .and_then(Value::as_u64)
            .unwrap_or(default)
            .min(max)
    }
    pub fn bool(&self, key: &str, default: bool) -> bool {
        self.get(key).and_then(Value::as_bool).unwrap_or(default)
    }
    pub fn strings(&self, key: &str) -> Vec<String> {
        match self.get(key) {
            Some(Value::Array(items)) => items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect(),
            Some(Value::String(s)) => vec![s.clone()],
            _ => Vec::new(),
        }
    }
}

/// Per-server state shared by every call.
pub struct Context {
    /// Working directory the server was started in (or `--cwd`).
    pub cwd: PathBuf,
    pub(crate) profile: Mutex<Profile>,
    states: Mutex<HashMap<TypeId, &'static (dyn Any + Send + Sync)>>,
}

impl Context {
    pub(crate) fn new(cwd: PathBuf, profile: Profile) -> Self {
        Self {
            cwd,
            profile: Mutex::new(profile),
            states: Mutex::new(HashMap::new()),
        }
    }

    /// The process-lifetime instance of `T`, created with `T::default()` on first use.
    pub fn state<T: Default + Send + Sync + 'static>(&self) -> &'static T {
        let mut states = self.states.lock().unwrap_or_else(|e| e.into_inner());
        let entry: &'static (dyn Any + Send + Sync) =
            *states.entry(TypeId::of::<T>()).or_insert_with(
                || -> &'static (dyn Any + Send + Sync) { Box::leak(Box::new(T::default())) },
            );
        entry
            .downcast_ref::<T>()
            .expect("state map is keyed by TypeId")
    }

    /// Name of the detected agent profile (`claude`, `codex`, `agy` or `generic`).
    pub fn agent(&self) -> &'static str {
        self.profile
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .name()
    }
}

/// The ordered set of tools a server exposes.
pub struct Registry {
    tools: Vec<&'static Tool>,
    schemas: OnceLock<Vec<Value>>,
}

impl Registry {
    pub fn empty() -> Self {
        Self {
            tools: Vec::new(),
            schemas: OnceLock::new(),
        }
    }

    /// Every built-in tool module of [`crate::tools`].
    pub fn builtin() -> Self {
        let mut registry = Self::empty();
        for tools in crate::tools::BUILTIN {
            registry.register_all(tools);
        }
        registry
    }

    /// Adds `tools`; a later tool replaces an earlier one with the same name.
    pub fn register_all(&mut self, tools: &'static [Tool]) {
        for tool in tools {
            match self.tools.iter().position(|t| t.name == tool.name) {
                Some(i) => self.tools[i] = tool,
                None => self.tools.push(tool),
            }
        }
        self.schemas = OnceLock::new();
    }

    pub fn get(&self, name: &str) -> Option<&'static Tool> {
        self.tools.iter().copied().find(|t| t.name == name)
    }

    pub fn tools(&self) -> &[&'static Tool] {
        &self.tools
    }

    /// The MCP `Tool` objects (`tools/list` entries), in registration order.
    pub fn descriptors(&self) -> &[Value] {
        self.schemas
            .get_or_init(|| self.tools.iter().map(|t| describe(t)).collect())
    }
}

fn describe(tool: &Tool) -> Value {
    let mut schema: Value = serde_json::from_str(tool.input_schema)
        .unwrap_or_else(|e| panic!("invalid input_schema for tool {}: {e}", tool.name));
    if let Some(props) = schema
        .as_object_mut()
        .map(|o| o.entry("properties").or_insert_with(|| json!({})))
        .and_then(Value::as_object_mut)
    {
        props.insert(
            "cursor".into(),
            json!({"type": "string", "description": "Resume a truncated result: the cursor printed at its end. Other arguments are ignored."}),
        );
        props.insert(
            "max_tokens".into(),
            json!({"type": "integer", "minimum": 256, "maximum": 50000, "description": "Token budget of this response (default: the server's)."}),
        );
    }
    let a = tool.annotations;
    json!({
        "name": tool.name,
        "title": tool.title,
        "description": tool.description,
        "inputSchema": schema,
        "annotations": {
            "title": tool.title,
            "readOnlyHint": a.read_only,
            "destructiveHint": a.destructive,
            "idempotentHint": a.idempotent,
            "openWorldHint": a.open_world,
        },
    })
}
