#[cfg(feature = "browser_index")]
use bun_jsc as jsc;
use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[bun_jsc::JsClass]
pub(crate) struct VectorIndex {
    #[cfg(feature = "browser_index")]
    handle: std::cell::RefCell<Option<bun_browser_index::ffi_api::Handle>>,
}

#[cfg(feature = "browser_index")]
mod native {
    use super::*;
    use bun_browser_index::{Metric, ffi_api};
    use bun_jsc::StringJsc as _;
    use std::collections::HashSet;

    fn invalid(global: &JSGlobalObject, message: &str) -> jsc::JsError {
        global.throw_invalid_arguments(format_args!("VectorIndex: {message}"))
    }

    fn integer(global: &JSGlobalObject, value: JSValue, max: usize) -> JsResult<usize> {
        if !value.is_number() {
            return Err(invalid(global, "expected a positive integer"));
        }
        let number = value.as_number();
        if !number.is_finite() || number.fract() != 0.0 || number < 1.0 || number > max as f64 {
            return Err(invalid(
                global,
                "positive integer is outside the supported range",
            ));
        }
        Ok(number as usize)
    }

    fn key(global: &JSGlobalObject, value: JSValue) -> JsResult<u64> {
        if !value.is_big_int() || !value.is_big_int_in_uint64_range(0, u64::MAX) {
            return Err(invalid(global, "keys must be unsigned 64-bit BigInts"));
        }
        Ok(value.to_uint64_no_truncate())
    }

    fn vector(global: &JSGlobalObject, value: JSValue) -> JsResult<Vec<f32>> {
        if !value.is_array() && value.js_type() != jsc::JSType::Float32Array {
            return Err(invalid(
                global,
                "vector must be a Float32Array or number array",
            ));
        }
        let _hold = jsc::Strong::create(value, global);
        let length = value.get_length(global)?;
        if length == 0 || length > bun_browser_index::MAX_DIM as u64 {
            return Err(invalid(
                global,
                "vector length is outside the supported range",
            ));
        }
        let mut output = Vec::with_capacity(length as usize);
        for index in 0..length as u32 {
            let element = value.get_index(global, index)?;
            if !element.is_number() {
                return Err(invalid(global, "vector elements must be finite numbers"));
            }
            let number = element.as_number();
            if !number.is_finite() || number.abs() > f64::from(f32::MAX) {
                return Err(invalid(
                    global,
                    "vector elements must be finite float32 numbers",
                ));
            }
            output.push(number as f32);
        }
        Ok(output)
    }

    fn allowed_keys(global: &JSGlobalObject, value: JSValue) -> JsResult<HashSet<u64>> {
        if !value.is_array() && value.js_type() != jsc::JSType::BigUint64Array {
            return Err(invalid(
                global,
                "allowedKeys must be a BigUint64Array or BigInt array",
            ));
        }
        let _hold = jsc::Strong::create(value, global);
        let length = value.get_length(global)?;
        if length > 1_000_000 {
            return Err(invalid(global, "allowedKeys exceeds one million keys"));
        }
        let mut output = HashSet::with_capacity(length as usize);
        for index in 0..length as u32 {
            output.insert(key(global, value.get_index(global, index)?)?);
        }
        Ok(output)
    }

    fn engine_error(global: &JSGlobalObject, error: bun_browser_index::IndexError) -> jsc::JsError {
        global.throw(format_args!("VectorIndex: {error}"))
    }

    impl VectorIndex {
        pub(super) fn create(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<Box<Self>> {
            let path = bun_core::String::from_js(frame.argument(0), global)?;
            let path = path.to_utf8();
            let path = std::str::from_utf8(path.slice())
                .map_err(|_| invalid(global, "path must be UTF-8"))?;
            if path.is_empty()
                || path.as_bytes().contains(&0)
                || !std::path::Path::new(path).is_absolute()
            {
                return Err(invalid(
                    global,
                    "path must be an absolute path without NUL bytes",
                ));
            }
            let options = frame.argument(1);
            if !options.is_object() {
                return Err(invalid(global, "dimensions option is required"));
            }
            let dimensions = integer(
                global,
                options
                    .get(global, "dimensions")?
                    .unwrap_or(JSValue::UNDEFINED),
                bun_browser_index::MAX_DIM,
            )?;
            let metric = match options.get(global, "metric")? {
                None => Metric::L2,
                Some(value) => {
                    if !value.is_string() {
                        return Err(invalid(global, "metric must be l2 or cosine"));
                    }
                    let value = bun_core::String::from_js(value, global)?;
                    match value.to_utf8().slice() {
                        b"l2" => Metric::L2,
                        b"cosine" => Metric::Cosine,
                        _ => return Err(invalid(global, "metric must be l2 or cosine")),
                    }
                }
            };
            let parameters = match metric {
                Metric::L2 => r#"{"metric":"l2"}"#,
                Metric::Cosine => r#"{"metric":"cosine"}"#,
            };
            let handle = ffi_api::open_or_create(path, dimensions, parameters)
                .map_err(|error| engine_error(global, error))?;
            if handle.index().stats().params.metric != metric {
                return Err(invalid(
                    global,
                    "stored index metric does not match requested metric",
                ));
            }
            Ok(Box::new(Self {
                handle: std::cell::RefCell::new(Some(handle)),
            }))
        }

        fn with_handle<T>(
            &self,
            global: &JSGlobalObject,
            operation: impl FnOnce(&ffi_api::Handle) -> Result<T, bun_browser_index::IndexError>,
        ) -> JsResult<T> {
            let handle = self.handle.borrow();
            let handle = handle
                .as_ref()
                .ok_or_else(|| global.throw(format_args!("ERR_VECTOR_INDEX_CLOSED")))?;
            operation(handle).map_err(|error| engine_error(global, error))
        }

        pub(super) fn add_native(
            &self,
            global: &JSGlobalObject,
            frame: &CallFrame,
        ) -> JsResult<JSValue> {
            let key = key(global, frame.argument(0))?;
            let vector = vector(global, frame.argument(1))?;
            self.with_handle(global, |handle| ffi_api::add(handle, key, &vector))?;
            Ok(JSValue::UNDEFINED)
        }

        pub(super) fn search_native(
            &self,
            global: &JSGlobalObject,
            frame: &CallFrame,
        ) -> JsResult<JSValue> {
            let vector = vector(global, frame.argument(0))?;
            let k = integer(global, frame.argument(1), 1_000_000)?;
            let options = frame.argument(2);
            let (allowed, ef) = if options.is_undefined_or_null() {
                (None, None)
            } else {
                if !options.is_object() {
                    return Err(invalid(global, "search options must be an object"));
                }
                let allowed = options
                    .get(global, "allowedKeys")?
                    .map(|value| allowed_keys(global, value))
                    .transpose()?;
                let ef = options
                    .get(global, "ef")?
                    .map(|value| integer(global, value, 1 << 20))
                    .transpose()?;
                (allowed, ef)
            };
            let hits = self.with_handle(global, |handle| match allowed {
                Some(allowed) => handle
                    .index()
                    .search_filtered(&vector, k, ef, |key| allowed.contains(&key)),
                None => handle.index().search(&vector, k, ef),
            })?;
            let result = JSValue::create_empty_array(global, hits.len())?;
            let _hold = jsc::Strong::create(result, global);
            for (index, (key, score)) in hits.into_iter().enumerate() {
                let object = JSValue::create_empty_object(global, 2);
                let _object_hold = jsc::Strong::create(object, global);
                let digits = key.to_string();
                let key = JSValue::big_int_from_decimal(global, digits.as_bytes())?
                    .expect("u64 decimal representation");
                let _key_hold = jsc::Strong::create(key, global);
                object.put(global, "key", key);
                object.put(global, "score", JSValue::js_number(f64::from(score)));
                result.put_index(global, index as u32, object)?;
            }
            Ok(result)
        }

        pub(super) fn remove_native(
            &self,
            global: &JSGlobalObject,
            frame: &CallFrame,
        ) -> JsResult<JSValue> {
            let key = key(global, frame.argument(0))?;
            Ok(JSValue::js_boolean(
                self.with_handle(global, |handle| Ok(ffi_api::remove(handle, key)))?,
            ))
        }

        pub(super) fn save_native(&self, global: &JSGlobalObject) -> JsResult<JSValue> {
            self.with_handle(global, ffi_api::save)?;
            Ok(JSValue::UNDEFINED)
        }

        pub(super) fn close_native(&self) -> JSValue {
            drop(self.handle.borrow_mut().take());
            JSValue::UNDEFINED
        }

        pub(super) fn count_native(&self, global: &JSGlobalObject) -> JsResult<JSValue> {
            Ok(JSValue::js_number(
                self.with_handle(global, |handle| Ok(ffi_api::len(handle)))? as f64,
            ))
        }

        pub(super) fn dimensions_native(&self, global: &JSGlobalObject) -> JsResult<JSValue> {
            Ok(JSValue::js_number(
                self.with_handle(global, |handle| Ok(ffi_api::dim(handle)))? as f64,
            ))
        }
    }
}

impl VectorIndex {
    pub(crate) fn constructor(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<Box<Self>> {
        #[cfg(feature = "browser_index")]
        {
            Self::create(global, frame)
        }
        #[cfg(not(feature = "browser_index"))]
        {
            let _ = frame;
            Err(global.throw(format_args!(
                "ERR_VECTOR_INDEX_PROVIDER_UNAVAILABLE: build with browser_index"
            )))
        }
    }

    pub(crate) fn get_available(
        _: &JSGlobalObject,
        _: JSValue,
        _: crate::generated_classes::PropertyName,
    ) -> JsResult<JSValue> {
        Ok(JSValue::js_boolean(cfg!(feature = "browser_index")))
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn add(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        #[cfg(feature = "browser_index")]
        {
            self.add_native(global, frame)
        }
        #[cfg(not(feature = "browser_index"))]
        {
            let _ = frame;
            Err(global.throw(format_args!("ERR_VECTOR_INDEX_PROVIDER_UNAVAILABLE")))
        }
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn search(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        #[cfg(feature = "browser_index")]
        {
            self.search_native(global, frame)
        }
        #[cfg(not(feature = "browser_index"))]
        {
            let _ = frame;
            Err(global.throw(format_args!("ERR_VECTOR_INDEX_PROVIDER_UNAVAILABLE")))
        }
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn remove(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        #[cfg(feature = "browser_index")]
        {
            self.remove_native(global, frame)
        }
        #[cfg(not(feature = "browser_index"))]
        {
            let _ = frame;
            Err(global.throw(format_args!("ERR_VECTOR_INDEX_PROVIDER_UNAVAILABLE")))
        }
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn save(&self, global: &JSGlobalObject, _: &CallFrame) -> JsResult<JSValue> {
        #[cfg(feature = "browser_index")]
        {
            self.save_native(global)
        }
        #[cfg(not(feature = "browser_index"))]
        {
            Err(global.throw(format_args!("ERR_VECTOR_INDEX_PROVIDER_UNAVAILABLE")))
        }
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn close(&self, global: &JSGlobalObject, _: &CallFrame) -> JsResult<JSValue> {
        #[cfg(feature = "browser_index")]
        {
            let _ = global;
            Ok(self.close_native())
        }
        #[cfg(not(feature = "browser_index"))]
        {
            Err(global.throw(format_args!("ERR_VECTOR_INDEX_PROVIDER_UNAVAILABLE")))
        }
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_count(&self, global: &JSGlobalObject) -> JsResult<JSValue> {
        #[cfg(feature = "browser_index")]
        {
            self.count_native(global)
        }
        #[cfg(not(feature = "browser_index"))]
        {
            Err(global.throw(format_args!("ERR_VECTOR_INDEX_PROVIDER_UNAVAILABLE")))
        }
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_dimensions(&self, global: &JSGlobalObject) -> JsResult<JSValue> {
        #[cfg(feature = "browser_index")]
        {
            self.dimensions_native(global)
        }
        #[cfg(not(feature = "browser_index"))]
        {
            Err(global.throw(format_args!("ERR_VECTOR_INDEX_PROVIDER_UNAVAILABLE")))
        }
    }
}
