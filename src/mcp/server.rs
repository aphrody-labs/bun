//! JSON-RPC 2.0 dispatch of the MCP methods, shared by the stdio and HTTP transports.

use std::sync::Mutex;

use serde_json::{Map, Value, json};

use crate::budget::{OutputStore, budget_bytes};
use crate::registry::{Args, Context, Registry, ToolError};
use crate::tools::{docs, skills};

pub(crate) const PROTOCOL_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];
const RESOURCE_PAGE: usize = 200;

pub(crate) struct Server {
    pub(crate) registry: Registry,
    pub(crate) ctx: Context,
    pub(crate) page_size: usize,
    store: Mutex<OutputStore>,
}

type RpcResult = Result<Value, (i64, String)>;

fn invalid(msg: impl Into<String>) -> (i64, String) {
    (-32602, msg.into())
}

fn cursor_index(params: &Value) -> Result<usize, (i64, String)> {
    match params.get("cursor").and_then(Value::as_str) {
        None => Ok(0),
        Some(c) => c.parse().map_err(|_| invalid("invalid cursor")),
    }
}

fn page<T>(items: &[T], start: usize, size: usize) -> (&[T], Option<String>) {
    let start = start.min(items.len());
    let end = (start + size).min(items.len());
    let next = (end < items.len()).then(|| end.to_string());
    (&items[start..end], next)
}

impl Server {
    pub(crate) fn new(registry: Registry, ctx: Context, page_size: usize) -> Self {
        Self {
            registry,
            ctx,
            page_size: page_size.max(1),
            store: Mutex::new(OutputStore::default()),
        }
    }

    fn max_tokens(&self) -> usize {
        self.ctx
            .profile
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .max_tokens
    }

    /// Handles one message (or a batch); `None` when nothing is to be sent back.
    pub(crate) fn handle(&self, msg: Value) -> Option<Value> {
        if let Value::Array(batch) = msg {
            let replies: Vec<Value> = batch.into_iter().filter_map(|m| self.handle(m)).collect();
            return (!replies.is_empty()).then_some(Value::Array(replies));
        }
        let Some(method) = msg.get("method").and_then(Value::as_str) else {
            if msg.get("id").is_some()
                && (msg.get("result").is_some() || msg.get("error").is_some())
            {
                return None;
            }
            return Some(
                json!({"jsonrpc": "2.0", "id": Value::Null, "error": {"code": -32600, "message": "invalid request"}}),
            );
        };
        let id = msg.get("id").cloned();
        let params = msg.get("params").cloned().unwrap_or(Value::Null);
        let result = self.dispatch(method, &params);
        let id = id?;
        Some(match result {
            Ok(result) => json!({"jsonrpc": "2.0", "id": id, "result": result}),
            Err((code, message)) => {
                json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
            }
        })
    }

    fn dispatch(&self, method: &str, params: &Value) -> RpcResult {
        match method {
            "initialize" => Ok(self.initialize(params)),
            "ping" | "logging/setLevel" => Ok(json!({})),
            "tools/list" => self.tools_list(params),
            "tools/call" => self.tools_call(params),
            "resources/list" => self.resources_list(params),
            "resources/templates/list" => Ok(json!({"resourceTemplates": [
                {"uriTemplate": "bun://docs/{path}", "name": "bun-docs", "title": "Bun documentation page", "description": "A page of the embedded Bun docs, e.g. bun://docs/runtime/http/server", "mimeType": "text/markdown"},
                {"uriTemplate": "bun://skills/{name}", "name": "bun-skills", "title": "Agent skill", "description": "SKILL.md of an agent skill", "mimeType": "text/markdown"}
            ]})),
            "resources/read" => self.resources_read(params),
            "prompts/list" => self.prompts_list(params),
            "prompts/get" => self.prompts_get(params),
            m if m.starts_with("notifications/") => Ok(Value::Null),
            _ => Err((-32601, format!("method not found: {method}"))),
        }
    }

    fn initialize(&self, params: &Value) -> Value {
        let requested = params
            .get("protocolVersion")
            .and_then(Value::as_str)
            .unwrap_or("");
        let version = PROTOCOL_VERSIONS
            .iter()
            .find(|v| **v == requested)
            .copied()
            .unwrap_or(PROTOCOL_VERSIONS[0]);
        if let Some(name) = params.pointer("/clientInfo/name").and_then(Value::as_str) {
            self.ctx
                .profile
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .refine(name);
        }
        let (agent, tokens) = {
            let p = self.ctx.profile.lock().unwrap_or_else(|e| e.into_inner());
            (p.name(), p.max_tokens)
        };
        json!({
            "protocolVersion": version,
            "capabilities": {
                "tools": {"listChanged": false},
                "resources": {"subscribe": false, "listChanged": false},
                "prompts": {"listChanged": false},
                "logging": {},
            },
            "serverInfo": {"name": "bun", "title": "Bun", "version": crate::cli::version()},
            "instructions": format!(
                "Bun's built-in MCP server (profile {agent}). Each tool result is capped at about {tokens} tokens; a truncated result ends with a cursor: call the same tool with {{\"cursor\": ...}} for the rest. Bun questions: docs_search then docs_read. Conventions: skills_list/skill_read, memory_search. Code: graph_symbols, graph_callers, graph_query. Verification: test, run."
            ),
        })
    }

    fn tools_list(&self, params: &Value) -> RpcResult {
        let (tools, next) = page(
            self.registry.descriptors(),
            cursor_index(params)?,
            self.page_size,
        );
        let mut result = json!({"tools": tools});
        if let Some(next) = next {
            result["nextCursor"] = Value::String(next);
        }
        Ok(result)
    }

    fn tools_call(&self, params: &Value) -> RpcResult {
        let name = params
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("missing tool name"))?;
        let tool = self
            .registry
            .get(name)
            .ok_or_else(|| invalid(format!("unknown tool: {name}")))?;
        let empty = Map::new();
        let arguments = match params.get("arguments") {
            Some(Value::Object(o)) => o,
            None | Some(Value::Null) => &empty,
            Some(_) => return Err(invalid("arguments must be an object")),
        };
        let args = Args(arguments);
        let tokens = args
            .get("max_tokens")
            .and_then(Value::as_u64)
            .map_or_else(|| self.max_tokens(), |t| (t as usize).clamp(256, 50_000));
        let bytes = budget_bytes(tokens);
        if let Some(cursor) = args.opt_str("cursor") {
            let store = self.store.lock().unwrap_or_else(|e| e.into_inner());
            return Ok(match store.resume(name, cursor, bytes) {
                Some(p) => text_result(&p.text, p.cursor, false),
                None => text_result(
                    &format!(
                        "Cursor {cursor} is unknown or expired; call {name} again without it."
                    ),
                    None,
                    true,
                ),
            });
        }
        let (text, is_error) = match (tool.call)(&self.ctx, &args) {
            Ok(out) => (out.text, out.is_error),
            Err(ToolError::InvalidArgs(m)) => (format!("Invalid arguments for {name}: {m}"), true),
            Err(ToolError::Failed(m)) => (format!("{name} failed: {m}"), true),
        };
        let p = self
            .store
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .page(name, text, bytes);
        Ok(text_result(&p.text, p.cursor, is_error))
    }

    fn resources_list(&self, params: &Value) -> RpcResult {
        let mut all = vec![json!({
            "uri": "bun://docs/llms.txt",
            "name": "llms.txt",
            "title": "Bun documentation index",
            "mimeType": "text/markdown",
        })];
        for d in docs::all() {
            all.push(json!({
                "uri": format!("bun://docs/{}", d.path),
                "name": d.path,
                "title": d.title,
                "description": d.description,
                "mimeType": "text/markdown",
            }));
        }
        for s in skills::all(&self.ctx) {
            all.push(json!({
                "uri": format!("bun://skills/{}", s.name),
                "name": format!("skill:{}", s.name),
                "title": s.name,
                "description": s.description,
                "mimeType": "text/markdown",
            }));
        }
        let (items, next) = page(&all, cursor_index(params)?, RESOURCE_PAGE);
        let mut result = json!({"resources": items});
        if let Some(next) = next {
            result["nextCursor"] = Value::String(next);
        }
        Ok(result)
    }

    fn resources_read(&self, params: &Value) -> RpcResult {
        let uri = params
            .get("uri")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("missing uri"))?;
        let text = if uri == "bun://docs/llms.txt" {
            Some(docs::llms_txt())
        } else if let Some(path) = uri.strip_prefix("bun://docs/") {
            docs::find(path).map(docs::render)
        } else if let Some(name) = uri.strip_prefix("bun://skills/") {
            skills::all(&self.ctx)
                .into_iter()
                .find(|s| s.name == name)
                .map(|s| s.main_text())
        } else {
            None
        };
        match text {
            Some(text) => {
                Ok(json!({"contents": [{"uri": uri, "mimeType": "text/markdown", "text": text}]}))
            }
            None => Err((-32002, format!("resource not found: {uri}"))),
        }
    }

    fn prompts_list(&self, params: &Value) -> RpcResult {
        let prompts: Vec<Value> = skills::all(&self.ctx)
            .iter()
            .map(|s| {
                json!({
                    "name": s.name,
                    "title": s.name,
                    "description": s.description,
                    "arguments": [{"name": "task", "description": "What to do with this skill", "required": false}],
                })
            })
            .collect();
        let (items, next) = page(&prompts, cursor_index(params)?, RESOURCE_PAGE);
        let mut result = json!({"prompts": items});
        if let Some(next) = next {
            result["nextCursor"] = Value::String(next);
        }
        Ok(result)
    }

    fn prompts_get(&self, params: &Value) -> RpcResult {
        let name = params
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("missing prompt name"))?;
        let skill = skills::all(&self.ctx)
            .into_iter()
            .find(|s| s.name == name)
            .ok_or_else(|| invalid(format!("unknown prompt: {name}")))?;
        let task = params
            .pointer("/arguments/task")
            .and_then(Value::as_str)
            .unwrap_or("");
        let mut text = format!(
            "Follow the \"{}\" skill below.\n\n{}",
            skill.name,
            skill.main_text()
        );
        if !task.is_empty() {
            text.push_str("\n\nTask: ");
            text.push_str(task);
        }
        Ok(json!({
            "description": skill.description,
            "messages": [{"role": "user", "content": {"type": "text", "text": text}}],
        }))
    }
}

/// `_meta.cursor` repeats the cursor of a truncated result for clients that page programmatically.
fn text_result(text: &str, cursor: Option<String>, is_error: bool) -> Value {
    let mut result = json!({"content": [{"type": "text", "text": text}], "isError": is_error});
    if let Some(cursor) = cursor {
        result["_meta"] = json!({"cursor": cursor});
    }
    result
}
