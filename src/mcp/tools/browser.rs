//! Stateless, inert browser syntax tools in the existing native MCP registry.
//! DOM trees and CSS arenas live only during the call; no JS/V8 handles or
//! navigation sessions enter the server's Send + Sync state map.

use serde_json::{Value, json};

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};

const MAX_INPUT: usize = 2 * 1024 * 1024;
const MAX_OUTPUT: usize = 48 * 1024;
const MAX_RESULTS: u64 = 100;

fn source<'a>(args: &'a Args<'_>, key: &str) -> Result<&'a str, ToolError> {
    let value = args.str(key)?;
    if value.len() > MAX_INPUT {
        return Err(ToolError::InvalidArgs(format!(
            "`{key}` exceeds 2 MiB of UTF-8"
        )));
    }
    Ok(value)
}

fn limit(args: &Args<'_>) -> Result<usize, ToolError> {
    match args.0.get("limit") {
        None => Ok(20),
        Some(value) => value
            .as_u64()
            .filter(|value| (1..=MAX_RESULTS).contains(value))
            .and_then(|value| usize::try_from(value).ok())
            .ok_or_else(|| {
                ToolError::InvalidArgs("`limit` must be an integer from 1 to 100".into())
            }),
    }
}

fn preview(value: &str, bytes: usize) -> (&str, bool) {
    if value.len() <= bytes {
        return (value, false);
    }
    let mut end = bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    (&value[..end], true)
}

fn include_html(args: &Args<'_>) -> Result<bool, ToolError> {
    match args.0.get("include_html") {
        None => Ok(false),
        Some(value) => value
            .as_bool()
            .ok_or_else(|| ToolError::InvalidArgs("`include_html` must be boolean".into())),
    }
}

fn html_parse(_context: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let html = source(args, "html")?;
    let limit = limit(args)?;
    let selector = match args.0.get("selector") {
        None => "*",
        Some(value) => value
            .as_str()
            .ok_or_else(|| ToolError::InvalidArgs("`selector` must be a string".into()))?,
    };
    if selector.is_empty() || selector.len() > 512 {
        return Err(ToolError::InvalidArgs(
            "`selector` must contain 1 to 512 UTF-8 bytes".into(),
        ));
    }
    let include_html = include_html(args)?;
    let tree = bun_browser_dom::parse_html(html);
    let matched = tree
        .query_selector_all(selector)
        .map_err(ToolError::InvalidArgs)?;
    let total = matched.len();
    let mut nodes = Vec::with_capacity(limit.min(total));
    let mut bytes = 1024; // reserve metadata, separators and JSON escaping
    let mut truncated = total > limit;
    for id in matched.into_iter().take(limit) {
        let Some(node) = tree.get_node(id) else {
            continue;
        };
        let Some(name) = node.as_element() else {
            continue;
        };
        let text = tree.text_content(id);
        let (text, text_truncated) = preview(&text, 512);
        let tag: &str = name.local.as_ref();
        let mut result = json!({ "id": id.raw(), "tag": tag,
            "text": text, "text_truncated": text_truncated });
        truncated |= text_truncated;
        if include_html {
            let html = tree.outer_html(id);
            let (html, html_truncated) = preview(&html, 1024);
            result["html"] = json!(html);
            result["html_truncated"] = json!(html_truncated);
            truncated |= html_truncated;
        }
        let encoded = result.to_string().len() + 1;
        if bytes + encoded > MAX_OUTPUT {
            truncated = true;
            break;
        }
        bytes += encoded;
        nodes.push(result);
    }
    let result = json!({ "engine": "bun_browser_dom", "inert": true,
        "document_nodes": tree.len(), "matches": total, "returned": nodes.len(),
        "truncated": truncated, "nodes": nodes });
    bounded(result)
}

fn css_parse(_context: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let css = source(args, "css")?;
    let limit = limit(args)?;
    let parsed = bun_css::browser::parse_stylesheet(css).map_err(ToolError::Failed)?;
    let total = parsed.len();
    let mut rules = Vec::with_capacity(limit.min(total));
    let mut bytes = 1024;
    let mut truncated = total > limit;
    for rule in parsed.into_iter().take(limit) {
        let (prelude, prelude_truncated) = preview(&rule.prelude, 512);
        let (body, body_truncated) = match rule.body.as_deref() {
            Some(body) => {
                let (body, truncated) = preview(body, 1024);
                (Some(body), truncated)
            }
            None => (None, false),
        };
        let result = json!({ "prelude": prelude, "body": body,
            "prelude_truncated": prelude_truncated, "body_truncated": body_truncated });
        truncated |= prelude_truncated || body_truncated;
        let encoded = result.to_string().len() + 1;
        if bytes + encoded > MAX_OUTPUT {
            truncated = true;
            break;
        }
        bytes += encoded;
        rules.push(result);
    }
    bounded(
        json!({ "engine": "bun_css", "recovery": true, "rules_total": total,
        "returned": rules.len(), "truncated": truncated, "rules": rules }),
    )
}

fn bounded(value: Value) -> Result<Output, ToolError> {
    let text = value.to_string();
    if text.len() > MAX_OUTPUT {
        return Err(ToolError::Failed(
            "Browser parser result exceeded its output budget".into(),
        ));
    }
    Ok(Output::text(text))
}

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: "html_parse",
        title: "Parse inert HTML",
        description: "Parse supplied HTML using Bun's native browser DOM, query a selector and return bounded node/text previews. No network, scripts, navigation or persistent session. Input up to 2 MiB UTF-8; 1-100 results; output at most 48 KiB before MCP pagination.",
        input_schema: r#"{"type":"object","properties":{"html":{"type":"string","maxLength":2097152},"selector":{"type":"string","minLength":1,"maxLength":512},"limit":{"type":"integer","minimum":1,"maximum":100,"default":20},"include_html":{"type":"boolean","default":false}},"required":["html"]}"#,
        annotations: Annotations::READ_ONLY,
        call: html_parse,
    },
    Tool {
        name: "css_parse",
        title: "Parse browser CSS",
        description: "Parse supplied CSS using Bun's shared browser/bundler CSS AST with author-style recovery. Return bounded ordered rule preludes and bodies; no minifier, cascade evaluation, layout, network or session. Input up to 2 MiB UTF-8; 1-100 rules; output at most 48 KiB before MCP pagination.",
        input_schema: r#"{"type":"object","properties":{"css":{"type":"string","maxLength":2097152},"limit":{"type":"integer","minimum":1,"maximum":100,"default":20}},"required":["css"]}"#,
        annotations: Annotations::READ_ONLY,
        call: css_parse,
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previews_preserve_utf8_boundaries() {
        assert_eq!(preview("aé日z", 4), ("aé", true));
        assert_eq!(preview("aé", 4), ("aé", false));
    }

    #[test]
    fn schemas_and_limits_are_explicit() {
        for tool in TOOLS {
            let schema: Value = serde_json::from_str(tool.input_schema).unwrap();
            assert_eq!(schema["properties"]["limit"]["maximum"], 100);
            assert!(tool.annotations.read_only);
            assert!(!tool.annotations.open_world);
        }
    }
}
