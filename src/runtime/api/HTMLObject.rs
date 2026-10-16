//! Persistent HTML5 DOM shared by Bun's JSC host and the browser engine.
//! No JavaScript values are retained in the native backing object.

use std::sync::Arc;

use bun_browser_dom::{DomTree, NodeId};
use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult, bun_string_jsc};

pub(crate) fn create(global: &JSGlobalObject) -> JSValue {
    bun_jsc::create_host_function_object(
        global,
        &[
            ("parse", __jsc_host_parse, 1),
            ("parseCSS", __jsc_host_parse_css, 1),
            ("readability", super::html_readability::__jsc_host_readability, 2),
            ("extract", super::html_readability::__jsc_host_extract, 2),
        ],
    )
}

fn string_argument(global: &JSGlobalObject, frame: &CallFrame, index: usize) -> JsResult<String> {
    let value = frame.argument(index);
    if !value.is_string() {
        return Err(global.throw_invalid_arguments(format_args!(
            "HTML argument {} must be a string",
            index + 1
        )));
    }
    let value = value.to_bun_string(global)?;
    let utf8 = value.to_utf8();
    Ok(String::from_utf8_lossy(utf8.slice()).into_owned())
}

#[bun_jsc::host_fn]
pub(crate) fn parse(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let html = string_argument(global, frame, 0)?;
    // Arc is for atomic destruction on the JSC GC thread. DOM operations remain
    // confined to the owning VM's mutator; DomTree itself is deliberately !Sync.
    #[allow(clippy::arc_with_non_send_sync)]
    let tree = Arc::new(bun_browser_dom::parse_html(&html));
    Ok(HTMLDocument::from_tree(tree, global))
}

/// Project the shared Bun CSS AST without bundler transforms or URL loading.
#[bun_jsc::host_fn]
pub(crate) fn parse_css(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let source = string_argument(global, frame, 0)?;
    let rules = bun_css::browser::parse_stylesheet(&source)
        .map_err(|error| global.throw_invalid_arguments(format_args!("Invalid CSS: {}", error)))?;
    let prelude_key = bun_core::EncodedSlice::latin1(b"prelude");
    let body_key = bun_core::EncodedSlice::latin1(b"body");
    JSValue::create_array_from_iter(global, rules.iter(), |rule| {
        let prelude = bun_jsc::Strong::create(
            bun_string_jsc::create_utf8_for_js(global, rule.prelude.as_bytes())?,
            global,
        );
        let body = match &rule.body {
            Some(body) => bun_string_jsc::create_utf8_for_js(global, body.as_bytes())?,
            None => JSValue::NULL,
        };
        JSValue::create_object2(global, &prelude_key, &body_key, prelude.get(), body)
    })
}

#[bun_jsc::JsClass(no_constructor)]
pub(crate) struct HTMLDocument {
    pub(crate) tree: Arc<DomTree>,
}

impl HTMLDocument {
    pub(crate) fn from_tree(tree: Arc<DomTree>, global: &JSGlobalObject) -> JSValue {
        Self::to_js_boxed(Box::new(Self { tree }), global)
    }

    fn attribute_name(&self, id: NodeId, name: String) -> String {
        let is_html = self
            .tree
            .with_node(id, |node| {
                node.as_element().is_some_and(|element| {
                    <_ as AsRef<str>>::as_ref(&element.ns) == "http://www.w3.org/1999/xhtml"
                })
            })
            .unwrap_or(false);
        if is_html {
            name.to_ascii_lowercase()
        } else {
            name
        }
    }

    fn node_argument(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
        optional: bool,
    ) -> JsResult<NodeId> {
        let value = frame.argument(0);
        if optional && value.is_undefined_or_null() {
            return Ok(self.tree.document());
        }
        if !value.is_number() {
            return Err(
                global.throw_invalid_arguments(format_args!("HTML node must be a numeric node ID"))
            );
        }
        let number = value.get_number().ok_or_else(|| {
            global.throw_invalid_arguments(format_args!("HTML node must be numeric"))
        })?;
        if !number.is_finite()
            || number.fract() != 0.0
            || number < 0.0
            || number > f64::from(u32::MAX)
        {
            return Err(global.throw_invalid_arguments(format_args!(
                "HTML node ID must be an unsigned integer"
            )));
        }
        let id = NodeId::new(number as u32);
        if self.tree.with_node(id, |_| ()).is_none() {
            return Err(global.throw_invalid_arguments(format_args!(
                "HTML node ID does not belong to this document"
            )));
        }
        Ok(id)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn select(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let selector = string_argument(global, frame, 0)?;
        let ids = self.tree.query_selector_all(&selector).map_err(|error| {
            global.throw_invalid_arguments(format_args!("Invalid HTML selector: {}", error))
        })?;
        JSValue::create_array_from_iter(global, ids.iter(), |id| {
            Ok(JSValue::js_number(f64::from(id.raw())))
        })
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn html(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let id = self.node_argument(global, frame, true)?;
        let html = self.tree.outer_html(id);
        bun_string_jsc::create_utf8_for_js(global, html.as_bytes())
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn text(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let id = self.node_argument(global, frame, true)?;
        let text = self.tree.text_content(id);
        bun_string_jsc::create_utf8_for_js(global, text.as_bytes())
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn attribute(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        let id = self.node_argument(global, frame, false)?;
        let name = self.attribute_name(id, string_argument(global, frame, 1)?);
        let value = self
            .tree
            .with_node(id, |node| node.get_attribute(&name).map(str::to_owned))
            .flatten();
        match value {
            Some(value) => bun_string_jsc::create_utf8_for_js(global, value.as_bytes()),
            None => Ok(JSValue::NULL),
        }
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn set_attribute(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        let id = self.node_argument(global, frame, false)?;
        let name = self.attribute_name(id, string_argument(global, frame, 1)?);
        let value = string_argument(global, frame, 2)?;
        let is_element = self
            .tree
            .with_node(id, |node| node.is_element())
            .unwrap_or(false);
        if !is_element
            || name.is_empty()
            || name
                .chars()
                .any(|ch| ch.is_whitespace() || matches!(ch, '\0' | '"' | '\'' | '>' | '/' | '='))
        {
            return Err(global.throw_invalid_arguments(format_args!(
                "HTML setAttribute expects an element and a valid attribute name"
            )));
        }
        let old_id = if name == "id" {
            self.tree
                .with_node(id, |node| node.get_attribute("id").map(str::to_owned))
                .flatten()
        } else {
            None
        };
        self.tree
            .with_node_mut(id, |node| node.set_attribute(&name, value.clone()));
        if name == "id" {
            self.tree
                .update_id_index(id, old_id.as_deref(), Some(&value));
        }
        Ok(JSValue::UNDEFINED)
    }
}
