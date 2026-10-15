use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult, StringJsc as _};
use serde_json::Value;

const MAX_DESCRIPTOR_BYTES: usize = aphrody_jev::protocol::MAX_JSON_BYTES + 64;

fn parse_descriptor(input: &[u8]) -> Result<Value, String> {
    // Internal wrappers add a request or question key and a bounded threshold.
    if input.len() > MAX_DESCRIPTOR_BYTES {
        return Err(format!(
            "Yolo descriptor exceeds {MAX_DESCRIPTOR_BYTES} bytes"
        ));
    }
    serde_json::from_slice(input).map_err(|error| format!("Yolo JSON: {error}"))
}

pub(crate) fn js_yolo(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let action = frame.argument(0).to_utf8(global)?;
    let input = frame.argument(1).to_utf8(global)?;
    let descriptor = frame.argument(2).to_utf8(global)?;
    let execute = || -> Result<Value, String> {
        let value = super::parse(&input)?;
        match action.as_ref() {
            b"question" => {
                super::question(&value)?;
                Ok(value)
            }
            b"request" => {
                super::request(&value)?;
                Ok(value)
            }
            b"confidence" => {
                let threshold = value
                    .as_f64()
                    .ok_or("Confidence threshold must be a number")?;
                aphrody_jev::validate_confidence_threshold(threshold)
                    .map_err(|error| error.to_string())?;
                Ok(value)
            }
            b"selections" => {
                let descriptor = parse_descriptor(&descriptor)?;
                let request = descriptor
                    .get("request")
                    .ok_or("Yolo descriptor requires request")?;
                let threshold = descriptor["minimumConfidence"]
                    .as_f64()
                    .ok_or("Confidence threshold must be a number")?;
                aphrody_jev::protocol::choice_selections(&value, request, threshold)
                    .map(Value::Object)
            }
            b"response" | b"values" => {
                let descriptor = parse_descriptor(&descriptor)?;
                let request = descriptor
                    .get("request")
                    .ok_or("Yolo descriptor requires request")?;
                super::response(&value, request)?;
                if action.as_ref() == b"response" {
                    return Ok(value);
                }
                let threshold =
                    super::threshold(descriptor.get("threshold").unwrap_or(&Value::Null))?;
                let values = value["answers"]
                    .as_object()
                    .ok_or("Yolo answers must be an object")?
                    .iter()
                    .map(|(name, answer)| {
                        super::primitive(answer, threshold).map(|value| (name.clone(), value))
                    })
                    .collect::<Result<serde_json::Map<String, Value>, String>>()?;
                Ok(Value::Object(values))
            }
            b"primitive" => {
                let descriptor = parse_descriptor(&descriptor)?;
                let question = descriptor
                    .get("question")
                    .ok_or("Yolo descriptor requires question")?;
                super::question(question)?;
                super::answer(&value, question)?;
                let threshold =
                    super::threshold(descriptor.get("threshold").unwrap_or(&Value::Null))?;
                super::primitive(&value, threshold)
            }
            _ => Err("Yolo native action is unknown".into()),
        }
    };
    let value =
        execute().map_err(|error| global.throw_invalid_arguments(format_args!("{error}")))?;
    match value {
        Value::Bool(value) => Ok(JSValue::js_boolean(value)),
        Value::Number(value) => Ok(JSValue::js_number(value.as_f64().ok_or_else(|| {
            global.throw_invalid_arguments(format_args!("Yolo numeric answer is invalid"))
        })?)),
        Value::String(value) => {
            bun_jsc::bun_string_jsc::create_utf8_for_js(global, value.as_bytes())
        }
        value => {
            let json = serde_json::to_vec(&value).map_err(|error| {
                global.throw_invalid_arguments(format_args!("Yolo response serialization: {error}"))
            })?;
            bun_core::String::from_bytes(&json).to_js_by_parse_json(global)
        }
    }
}
