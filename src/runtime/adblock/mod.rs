//! `bun:adblock`: Brave's network and cosmetic filter engine (absorbed as `src/adblock`, MPL-2.0).
//! The engine is built only when `new Engine()` or `Engine.deserialize()` runs.

use std::collections::HashSet;

use adblock::Engine;
use adblock::lists::{FilterFormat, FilterSet, ParseOptions};
use adblock::request::Request;
use adblock::resources::Resource;
use bun_jsc::{
    self as jsc, CallFrame, ErrorCode, JSGlobalObject, JSValue, JsResult, StringJsc as _,
};
use serde::de::DeserializeOwned;

#[bun_jsc::JsClass]
pub(crate) struct AdblockEngine {
    engine: Engine,
}

fn invalid(global: &JSGlobalObject, message: std::fmt::Arguments<'_>) -> jsc::JsError {
    ErrorCode::ERR_INVALID_ARG_VALUE.throw(global, message)
}

fn string_arg(global: &JSGlobalObject, value: JSValue, name: &str) -> JsResult<String> {
    if !value.is_string() {
        return Err(ErrorCode::ERR_INVALID_ARG_TYPE.throw(
            global,
            format_args!("The \"{name}\" argument must be of type string"),
        ));
    }
    let bytes = value.to_utf8(global)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn optional_string(
    global: &JSGlobalObject,
    value: JSValue,
    name: &str,
) -> JsResult<Option<String>> {
    if value.is_undefined_or_null() {
        Ok(None)
    } else {
        string_arg(global, value, name).map(Some)
    }
}

fn from_json<T: DeserializeOwned>(
    global: &JSGlobalObject,
    value: JSValue,
    name: &str,
) -> JsResult<T> {
    let json = value.json_stringify(global, 0)?;
    let json = json.to_utf8();
    serde_json::from_slice(json.slice())
        .map_err(|error| invalid(global, format_args!("Invalid {name}: {error}")))
}

fn to_js_json(global: &JSGlobalObject, value: &serde_json::Value) -> JsResult<JSValue> {
    let bytes = serde_json::to_vec(value)
        .map_err(|error| global.throw(format_args!("adblock: {error}")))?;
    bun_core::String::from_bytes(&bytes).to_js_by_parse_json(global)
}

fn js_string(global: &JSGlobalObject, value: &str) -> JsResult<JSValue> {
    bun_core::String::from_bytes(value.as_bytes()).to_js(global)
}

impl AdblockEngine {
    pub(crate) fn constructor(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<Box<Self>> {
        let options = frame.argument(0);
        if !options.is_object() {
            return Err(ErrorCode::ERR_INVALID_ARG_TYPE.throw(
                global,
                format_args!("Engine options must be an object with \"rules\""),
            ));
        }
        let format = match options.get(global, "format")? {
            Some(value) if !value.is_undefined_or_null() => {
                match string_arg(global, value, "format")?.as_str() {
                    "standard" => FilterFormat::Standard,
                    "hosts" => FilterFormat::Hosts,
                    other => {
                        return Err(invalid(
                            global,
                            format_args!(
                                "format must be \"standard\" or \"hosts\", got \"{other}\""
                            ),
                        ));
                    }
                }
            }
            _ => FilterFormat::Standard,
        };
        let debug = match options.get(global, "debug")? {
            Some(value) => value.to_boolean(),
            None => false,
        };
        let opts = ParseOptions {
            format,
            ..ParseOptions::default()
        };
        let mut set = FilterSet::new(debug);
        match options.get(global, "rules")? {
            Some(value) if value.is_string() => {
                set.add_filter_list(string_arg(global, value, "rules")?, opts);
            }
            Some(value) if value.is_array() => {
                let rules: Vec<String> = from_json(global, value, "rules")?;
                set.add_filter_list(rules.join("\n"), opts);
            }
            _ => {
                return Err(ErrorCode::ERR_INVALID_ARG_TYPE.throw(
                    global,
                    format_args!("\"rules\" must be a string or an array of strings"),
                ));
            }
        }
        let mut engine = Engine::new_with_filter_set(set);
        if let Some(value) = options.get(global, "resources")? {
            if !value.is_undefined_or_null() {
                let resources: Vec<Resource> = from_json(global, value, "resources")?;
                engine.use_resources(resources);
            }
        }
        Ok(Box::new(Self { engine }))
    }

    pub(crate) fn deserialize(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let Some(buffer) = frame.argument(0).as_array_buffer(global) else {
            return Err(ErrorCode::ERR_INVALID_ARG_TYPE.throw(
                global,
                format_args!("Engine.deserialize expects a Uint8Array or ArrayBuffer"),
            ));
        };
        let mut engine = Engine::default();
        engine.deserialize(buffer.byte_slice()).map_err(|error| {
            invalid(global, format_args!("Invalid serialized engine: {error:?}"))
        })?;
        Ok(Self::to_js_boxed(Box::new(Self { engine }), global))
    }

    /// Whether `fetch(…, { adblock })` must block the request; `None` when the URL is not checkable.
    pub(crate) fn blocks(
        &self,
        url: &str,
        source_url: &str,
        request_type: &str,
        method: &str,
    ) -> Option<bool> {
        let request = Request::new(url, source_url, request_type, method).ok()?;
        Some(self.engine.check_network_request(&request).should_block())
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn check(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let url = string_arg(global, frame.argument(0), "url")?;
        let source =
            optional_string(global, frame.argument(1), "sourceUrl")?.unwrap_or_else(|| url.clone());
        let kind = optional_string(global, frame.argument(2), "requestType")?
            .unwrap_or_else(|| "other".into());
        let method =
            optional_string(global, frame.argument(3), "method")?.unwrap_or_else(|| "get".into());
        let request = Request::new(&url, &source, &kind, &method.to_ascii_lowercase())
            .map_err(|error| invalid(global, format_args!("Invalid request URL: {error:?}")))?;
        let result = self.engine.check_network_request(&request);
        let object = JSValue::create_empty_object(global, 7);
        let _hold = jsc::Strong::create(object, global);
        object.put(
            global,
            b"matched",
            JSValue::js_boolean(result.filter.is_some()),
        );
        object.put(
            global,
            b"blocked",
            JSValue::js_boolean(result.should_block()),
        );
        object.put(global, b"important", JSValue::js_boolean(result.important));
        if let Some(filter) = &result.filter {
            object.put(
                global,
                b"filter",
                js_string(global, filter.raw_line.as_deref().unwrap_or(""))?,
            );
        }
        if let Some(exception) = &result.exception {
            object.put(
                global,
                b"exception",
                js_string(global, exception.raw_line.as_deref().unwrap_or(""))?,
            );
        }
        if let Some(redirect) = &result.redirect {
            object.put(global, b"redirect", js_string(global, redirect)?);
        }
        if let Some(rewritten) = &result.rewritten_url {
            object.put(global, b"rewrittenUrl", js_string(global, rewritten)?);
        }
        Ok(object)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn url_cosmetic_resources(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        let url = string_arg(global, frame.argument(0), "url")?;
        let resources = self.engine.url_cosmetic_resources(&url);
        fn sorted(set: &HashSet<String>) -> Vec<&String> {
            let mut values: Vec<&String> = set.iter().collect();
            values.sort();
            values
        }
        to_js_json(
            global,
            &serde_json::json!({
                "hideSelectors": sorted(&resources.hide_selectors),
                "proceduralActions": sorted(&resources.procedural_actions),
                "exceptions": sorted(&resources.exceptions),
                "injectedScript": resources.injected_script,
                "generichide": resources.generichide,
            }),
        )
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn hidden_class_id_selectors(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        let list = |index: usize, name: &str| -> JsResult<Vec<String>> {
            let value = frame.argument(index);
            if value.is_undefined_or_null() {
                Ok(Vec::new())
            } else if value.is_array() {
                from_json(global, value, name)
            } else {
                Err(ErrorCode::ERR_INVALID_ARG_TYPE.throw(
                    global,
                    format_args!("\"{name}\" must be an array of strings"),
                ))
            }
        };
        let classes = list(0, "classes")?;
        let ids = list(1, "ids")?;
        let exceptions: HashSet<String> = list(2, "exceptions")?.into_iter().collect();
        let mut selectors = self
            .engine
            .hidden_class_id_selectors(&classes, &ids, &exceptions);
        selectors.sort();
        to_js_json(global, &serde_json::json!(selectors))
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn serialize(
        &self,
        global: &JSGlobalObject,
        _frame: &CallFrame,
    ) -> JsResult<JSValue> {
        jsc::ArrayBuffer::create_uint8_array(global, &self.engine.serialize())
    }
}

pub(crate) fn js_adblock_engine_constructor(
    global: &JSGlobalObject,
    _frame: &CallFrame,
) -> JsResult<JSValue> {
    Ok(jsc::codegen::js::get_constructor::<AdblockEngine>(global))
}
