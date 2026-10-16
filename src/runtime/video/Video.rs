//! Frame extraction uses the Image source capture, pinning, pending-task hold
//! and worker job. Only the optional libav decode precedes the Image pipeline.

use core::cell::Cell;
use bun_jsc::{self as jsc, CallFrame, JSGlobalObject, JSValue, JsResult};
use crate::image::image_body::{Image, Deliver};
use crate::generated_classes::PropertyName;

pub(crate) use crate::generated_classes::js_Video as js;

#[bun_jsc::JsClass]
pub(crate) struct Video {
    // Its owner is the generated wrapper's traced `image` slot.
    image: jsc::JsPtr<Image>,
    time: Cell<f64>,
}

impl Video {
    pub(crate) fn constructor(global: &JSGlobalObject, frame: &CallFrame, this: JSValue) -> JsResult<Box<Self>> {
        let input = frame.argument(0);
        if input.is_undefined_or_null() {
            return Err(global.throw_invalid_arguments(format_args!("Video expects a media source")));
        }
        let (image, pointer) = Image::capture_media_source(global, input, frame.argument(1))?;
        js::image_set_cached(this, global, image);
        Ok(Box::new(Self {
            // The cached slot traces the Image for as long as this Video is alive.
            image: unsafe { jsc::JsPtr::new(pointer) },
            time: Cell::new(0.0),
        }))
    }

    fn image(&self) -> &Image {
        // Methods/getters run on the JS thread while the Video wrapper is live.
        unsafe { &*self.image.as_ptr() }
    }

    pub(crate) fn get_available(_global: &JSGlobalObject, _: JSValue, _: PropertyName) -> JsResult<JSValue> {
        Ok(JSValue::js_boolean(cfg!(feature = "video_native")))
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_frame(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let value = frame.argument(0);
        if !value.is_number() || !value.as_number().is_finite() || value.as_number() < 0.0 {
            return Err(global.throw_invalid_arguments(format_args!("frame time must be finite, non-negative seconds")));
        }
        self.time.set(value.as_number());
        Ok(frame.this())
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_resize(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.image().do_resize(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_png(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.image().do_format_png(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_jpeg(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.image().do_format_jpeg(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_webp(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.image().do_format_webp(global, frame)
    }

    fn schedule(&self, global: &JSGlobalObject, frame: &CallFrame, time: Option<f64>, deliver: Deliver) -> JsResult<JSValue> {
        let image = js::image_get_cached(frame.this()).expect("Video owns an Image source");
        self.image().schedule_video(&global.js_thread_of_caller(frame), image, time, deliver)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_bytes(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.schedule(global, frame, Some(self.time.get()), Deliver::Uint8Array)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_blob(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.schedule(global, frame, Some(self.time.get()), Deliver::Blob)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_metadata(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.schedule(global, frame, None, Deliver::Uint8Array)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_width(&self, global: &JSGlobalObject) -> JSValue { self.image().get_width(global) }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_height(&self, global: &JSGlobalObject) -> JSValue { self.image().get_height(global) }
}

