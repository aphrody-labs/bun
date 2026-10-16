//! `Bun.HTML.readability` and `Bun.HTML.extract`: Brave Speedreader and the
//! web-discovery document extractor (`bun_readability`).

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult, bun_string_jsc};
use bun_readability::document_extractor::{SelectAttributeRequest, SelectRequest};

fn markup_argument(global: &JSGlobalObject, value: JSValue, name: &str) -> JsResult<Vec<u8>> {
    if value.is_string() {
        return Ok(value.to_utf8(global)?.to_vec());
    }
    if let Some(buffer) = value.as_array_buffer(global) {
        return Ok(buffer.byte_slice().to_vec());
    }
    Err(global.throw_invalid_arguments(format_args!(
        "{} must be a string, ArrayBuffer or TypedArray",
        name
    )))
}

fn string_option(global: &JSGlobalObject, options: JSValue, key: &str) -> JsResult<Option<String>> {
    let Some(value) = options.get(global, key)? else {
        return Ok(None);
    };
    if value.is_undefined_or_null() {
        return Ok(None);
    }
    if !value.is_string() {
        return Err(global.throw_invalid_arguments(format_args!("options.{} must be a string", key)));
    }
    Ok(Some(String::from_utf8_lossy(&value.to_utf8(global)?).into_owned()))
}

fn string_property(global: &JSGlobalObject, object: JSValue, key: &str) -> JsResult<String> {
    Ok(string_option(global, object, key)?.unwrap_or_default())
}

fn put_string(global: &JSGlobalObject, object: JSValue, key: &str, value: &str) -> JsResult<()> {
    object.put(global, key, bun_string_jsc::create_utf8_for_js(global, value.as_bytes())?);
    Ok(())
}

fn put_optional_string(
    global: &JSGlobalObject,
    object: JSValue,
    key: &str,
    value: Option<&str>,
) -> JsResult<()> {
    match value {
        Some(value) => put_string(global, object, key, value),
        None => {
            object.put(global, key, JSValue::NULL);
            Ok(())
        }
    }
}

/// `Bun.HTML.readability(markup, options?)`: the main article, or `null` when
/// no article candidate is found.
#[bun_jsc::host_fn]
pub(crate) fn readability(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let markup = markup_argument(global, frame.argument(0), "markup")?;
    let options_value = frame.argument(1);
    let mut options = bun_readability::Options::default();
    if options_value.is_object() {
        options.url = string_option(global, options_value, "url")?;
        if let Some(min_length) = options_value.get(global, "minLength")? {
            if min_length.is_number() {
                options.min_length = Some(min_length.to_int32());
            } else if !min_length.is_undefined_or_null() {
                return Err(global.throw_invalid_arguments(format_args!("options.minLength must be a number")));
            }
        }
        if let Some(page) = options_value.get(global, "page")? {
            options.page = page.to_boolean();
        }
        options.theme = string_option(global, options_value, "theme")?;
        options.font_family = string_option(global, options_value, "fontFamily")?;
        options.font_size = string_option(global, options_value, "fontSize")?;
        options.column_width = string_option(global, options_value, "columnWidth")?;
    } else if !options_value.is_undefined_or_null() {
        return Err(global.throw_invalid_arguments(format_args!("options must be an object")));
    }

    let article = match bun_readability::extract(&markup, options) {
        Ok(article) => article,
        Err(bun_readability::SpeedReaderError::BadURL(url)) => {
            return Err(global.throw_invalid_arguments(format_args!("Invalid URL: {}", url)));
        }
        Err(_) => return Ok(JSValue::NULL),
    };

    let result = JSValue::create_empty_object(global, 10);
    put_string(global, result, "title", &article.title)?;
    put_optional_string(global, result, "byline", article.byline.as_deref())?;
    put_optional_string(global, result, "excerpt", article.excerpt.as_deref())?;
    put_optional_string(global, result, "lang", article.lang.as_deref())?;
    put_string(global, result, "content", &article.content)?;
    put_string(global, result, "text", &article.text)?;
    result.put(global, "length", JSValue::js_number(article.text.chars().count() as f64));
    result.put(global, "score", JSValue::js_number(article.score));
    result.put(global, "readable", JSValue::js_boolean(article.readable));
    if let Some(page) = &article.page {
        put_string(global, result, "page", page)?;
    }
    Ok(result)
}

fn select_requests(global: &JSGlobalObject, requests: JSValue) -> JsResult<Vec<SelectRequest>> {
    if !requests.is_array() {
        return Err(global.throw_invalid_arguments(format_args!("requests must be an array")));
    }
    let length = requests.get_length(global)?;
    let mut out = Vec::with_capacity(length as usize);
    for index in 0..length {
        let request = requests.get_index(global, index as u32)?;
        if !request.is_object() {
            return Err(global.throw_invalid_arguments(format_args!("requests[{}] must be an object", index)));
        }
        let root_selector = string_property(global, request, "selector")?;
        let mut attribute_requests = Vec::new();
        if let Some(attributes) = request.get(global, "attributes")? {
            if !attributes.is_array() {
                return Err(global.throw_invalid_arguments(format_args!(
                    "requests[{}].attributes must be an array",
                    index
                )));
            }
            let count = attributes.get_length(global)?;
            for i in 0..count {
                let attribute = attributes.get_index(global, i as u32)?;
                if !attribute.is_object() {
                    return Err(global.throw_invalid_arguments(format_args!(
                        "requests[{}].attributes[{}] must be an object",
                        index, i
                    )));
                }
                attribute_requests.push(SelectAttributeRequest {
                    sub_selector: string_property(global, attribute, "selector")?,
                    key: string_property(global, attribute, "key")?,
                    attribute: string_property(global, attribute, "attribute")?,
                });
            }
        }
        out.push(SelectRequest { root_selector, attribute_requests });
    }
    Ok(out)
}

/// `Bun.HTML.extract(markup, requests)`: one `{ selector, values }` per
/// element matched by each request's selector.
#[bun_jsc::host_fn]
pub(crate) fn extract(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let markup = markup_argument(global, frame.argument(0), "markup")?;
    let requests = select_requests(global, frame.argument(1))?;
    let html = String::from_utf8_lossy(&markup);
    let results = bun_readability::document_extractor::query_element_attributes(&html, &requests);
    JSValue::create_array_from_iter(global, results.iter(), |result| {
        let entry = JSValue::create_empty_object(global, 2);
        put_string(global, entry, "selector", &result.root_selector)?;
        let values = JSValue::create_empty_object(global, result.attribute_pairs.len());
        entry.put(global, "values", values);
        for (key, value) in &result.attribute_pairs {
            values.put(
                global,
                bun_core::EncodedSlice::utf8(key.as_bytes()),
                bun_string_jsc::create_utf8_for_js(global, value.as_bytes())?,
            );
        }
        Ok(entry)
    })
}
