//! `Bun.WebDetect`: offline technology/anti-bot detection and the browser SSRF deny-set.

use bun_jsc::StringJsc as _;
use bun_jsc::{self as jsc, CallFrame, JSGlobalObject, JSValue, JsResult};

#[bun_jsc::JsClass]
pub(crate) struct WebDetect;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    url: String,
    #[serde(default)]
    final_url: Option<String>,
    #[serde(default)]
    status: Option<u16>,
    #[serde(default)]
    headers: std::collections::BTreeMap<String, HeaderValue>,
    #[serde(default)]
    body: String,
    #[serde(default)]
    resolved_ips: Vec<std::net::IpAddr>,
    #[serde(default)]
    cname_chain: Vec<String>,
    #[serde(default)]
    ns_records: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum HeaderValue {
    One(String),
    Many(Vec<String>),
}

impl WebDetect {
    pub(crate) fn constructor(global: &JSGlobalObject, _: &CallFrame) -> JsResult<Box<Self>> {
        Err(global.throw(format_args!("WebDetect is not constructable")))
    }

    pub(crate) fn detect(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let value = frame.argument(0);
        if !value.is_object() {
            return Err(global.throw_invalid_arguments(format_args!(
                "WebDetect.detect expects {{ url, status, headers, body }}"
            )));
        }
        let json = value.json_stringify(global, 0)?;
        let json = json.to_utf8();
        let input: Input = serde_json::from_slice(json.slice()).map_err(|error| {
            global.throw_invalid_arguments(format_args!("Invalid WebDetect input: {error}"))
        })?;
        let mut evidence =
            bun_browser_detect::DetectionInput::new(input.url, input.status.unwrap_or(200), input.body);
        if let Some(final_url) = input.final_url {
            evidence.final_url = final_url;
        }
        for (name, value) in input.headers {
            match value {
                HeaderValue::One(value) => evidence.add_header(&name, value),
                HeaderValue::Many(values) => {
                    for value in values {
                        evidence.add_header(&name, value);
                    }
                }
            }
        }
        evidence.resolved_ips = input.resolved_ips;
        evidence.cname_chain = input.cname_chain;
        evidence.ns_records = input.ns_records;
        let report = bun_browser_detect::detect_response(&evidence)
            .map_err(|error| global.throw_invalid_arguments(format_args!("{error}")))?;
        let json = serde_json::to_string(&report)
            .map_err(|error| global.throw(format_args!("{error}")))?;
        bun_core::String::from_bytes(json.as_bytes()).to_js_by_parse_json(global)
    }

    pub(crate) fn is_forbidden_address(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let value = frame.argument(0);
        if !value.is_string() {
            return Err(global.throw_invalid_arguments(format_args!(
                "WebDetect.isForbiddenAddress expects an IP address string"
            )));
        }
        let text = value.to_bun_string(global)?.to_utf8();
        let text = std::str::from_utf8(text.slice()).unwrap_or("");
        let text = text.trim().trim_start_matches('[').trim_end_matches(']');
        let ip: std::net::IpAddr = text.parse().map_err(|_| {
            global.throw_invalid_arguments(format_args!("Invalid IP address: {text}"))
        })?;
        Ok(JSValue::js_boolean(bun_browser_ssrf::is_forbidden_ip(ip)))
    }
}
