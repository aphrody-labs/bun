//! Frame extraction uses the Image source capture, pinning, pending-task hold
//! and worker job. The native FilmCraft decoder precedes the Image pipeline.

use crate::generated_classes::PropertyName;
use crate::image::image_body::{Deliver, Image, VideoOperation};
use bun_jsc::{self as jsc, CallFrame, JSGlobalObject, JSValue, JsResult, StringJsc as _, Strong};
use core::cell::Cell;

pub(crate) use crate::generated_classes::js_Video as js;

#[bun_jsc::JsClass]
pub(crate) struct Video {
    // Its owner is the generated wrapper's traced `image` slot.
    image: jsc::JsPtr<Image>,
    time: Cell<f64>,
}

impl Video {
    pub(crate) fn constructor(
        global: &JSGlobalObject,
        frame: &CallFrame,
        this: JSValue,
    ) -> JsResult<Box<Self>> {
        let input = frame.argument(0);
        if input.is_undefined_or_null() {
            return Err(
                global.throw_invalid_arguments(format_args!("Video expects a media source"))
            );
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

    pub(crate) fn get_available(
        _global: &JSGlobalObject,
        _: JSValue,
        _: PropertyName,
    ) -> JsResult<JSValue> {
        Ok(JSValue::js_boolean(cfg!(feature = "video_native")))
    }

    pub(crate) fn get_backend(
        global: &JSGlobalObject,
        value: JSValue,
        property: PropertyName,
    ) -> JsResult<JSValue> {
        Image::get_backend(global, value, property)
    }

    pub(crate) fn set_backend(
        global: &JSGlobalObject,
        value: JSValue,
        backend: JSValue,
        property: PropertyName,
    ) -> bool {
        Image::set_backend(global, value, backend, property)
    }

    pub(crate) fn get_decoder(
        global: &JSGlobalObject,
        _: JSValue,
        _: PropertyName,
    ) -> JsResult<JSValue> {
        bun_core::String::static_("filmcraft").to_js(global)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_frame(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let value = frame.argument(0);
        if !value.is_number() || !value.as_number().is_finite() || value.as_number() < 0.0 {
            return Err(global.throw_invalid_arguments(format_args!(
                "frame time must be finite, non-negative seconds"
            )));
        }
        self.time.set(value.as_number());
        Ok(frame.this())
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_extract(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        self.image().do_extract(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_resize(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
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

    fn schedule(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
        time: Option<f64>,
        deliver: Deliver,
    ) -> JsResult<JSValue> {
        let image = js::image_get_cached(frame.this()).expect("Video owns an Image source");
        self.image()
            .schedule_video(&global.js_thread_of_caller(frame), image, time, deliver)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_rotate(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        self.image().do_rotate(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_flip(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.image().do_flip(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_flop(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.image().do_flop(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_modulate(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        self.image().do_modulate(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_heic(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.image().do_format_heic(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_avif(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.image().do_format_avif(global, frame)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_buffer(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        self.schedule(global, frame, Some(self.time.get()), Deliver::Buffer)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_to_base64(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        self.schedule(global, frame, Some(self.time.get()), Deliver::Base64)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_data_url(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        self.schedule(global, frame, Some(self.time.get()), Deliver::DataUrl)
    }

    fn schedule_operation(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
        operation: VideoOperation,
    ) -> JsResult<JSValue> {
        let image = js::image_get_cached(frame.this()).expect("Video owns an Image source");
        self.image().schedule_video_operation(
            &global.js_thread_of_caller(frame),
            image,
            operation,
            Deliver::Uint8Array,
        )
    }

    fn option(
        global: &JSGlobalObject,
        options: JSValue,
        name: &str,
        default: f64,
        min: f64,
        max: f64,
        integer: bool,
    ) -> JsResult<f64> {
        let value = options.get(global, name)?;
        let number = match value {
            None => default,
            Some(value) if value.is_undefined() => default,
            Some(value) if value.is_number() => value.as_number(),
            _ => {
                return Err(global.throw_invalid_arguments(format_args!(
                    "Video option {name} must be a number"
                )));
            }
        };
        if !number.is_finite() || number < min || number > max || (integer && number.fract() != 0.0)
        {
            return Err(global.throw_invalid_arguments(format_args!(
                "Video option {name} is outside its supported range"
            )));
        }
        Ok(number)
    }

    fn options(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let options = frame.argument(0);
        if !options.is_object() {
            return Err(
                global.throw_invalid_arguments(format_args!("Video expects an options object"))
            );
        }
        Ok(options)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_frames(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        let options = Self::options(global, frame)?;
        let start = Self::option(global, options, "start", 0.0, 0.0, f64::MAX, false)?;
        let end = Self::option(global, options, "end", start + 1.0, 0.0, f64::MAX, false)?;
        let step = Self::option(global, options, "step", 1.0, 0.000_001, f64::MAX, false)?;
        let max_frames =
            Self::option(global, options, "maxFrames", 64.0, 1.0, 64.0, true)? as usize;
        let end_tolerance = end.abs().max(start.abs()).max(1.0) * f64::EPSILON * 4.0;
        if end <= start || start + max_frames as f64 * step + end_tolerance < end {
            return Err(global.throw_invalid_arguments(format_args!(
                "Video.frames requires start < end and at most maxFrames frames (maximum 64)"
            )));
        }
        self.schedule_operation(
            global,
            frame,
            VideoOperation::Frames {
                start,
                end,
                step,
                max_frames,
            },
        )
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_audio(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let options = Self::options(global, frame)?;
        let start = Self::option(global, options, "start", 0.0, 0.0, f64::MAX, false)?;
        let duration = Self::option(global, options, "duration", 1.0, 0.000_001, 30.0, false)?;
        let stream = Self::option(global, options, "stream", 0.0, 0.0, 63.0, true)? as usize;
        let sample_rate =
            Self::option(global, options, "sampleRate", 16000.0, 1.0, 192000.0, true)? as u32;
        self.schedule_operation(
            global,
            frame,
            VideoOperation::Audio {
                start,
                duration,
                stream,
                sample_rate,
            },
        )
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_remux(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let destination = frame.argument(0);
        if !destination.is_string() {
            return Err(global.throw_invalid_arguments(format_args!(
                "Video.remux expects a new .mp4, .mov, .mkv or .webm file path"
            )));
        }
        let path = destination
            .to_bun_string(global)?
            .into_utf8()
            .slice()
            .to_vec();
        if path.is_empty() || bun_core::strings::contains_char(&path, 0) {
            return Err(global.throw_invalid_arguments(format_args!(
                "Video.remux expects a nonempty file path without NUL"
            )));
        }
        self.schedule_operation(global, frame, VideoOperation::Remux(path))
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_hls(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let destination = frame.argument(0);
        if !destination.is_string() {
            return Err(global
                .throw_invalid_arguments(format_args!("Video.hls expects a new directory path")));
        }
        let directory = destination
            .to_bun_string(global)?
            .into_utf8()
            .slice()
            .to_vec();
        if directory.is_empty() || bun_core::strings::contains_char(&directory, 0) {
            return Err(global.throw_invalid_arguments(format_args!(
                "Video.hls expects a nonempty directory path without NUL"
            )));
        }
        let options = frame.argument(1);
        let seconds = if options.is_undefined_or_null() {
            6.0
        } else if options.is_object() {
            Self::option(global, options, "segmentSeconds", 6.0, 0.5, 60.0, false)?
        } else {
            return Err(global.throw_invalid_arguments(format_args!(
                "Video.hls options must be an object"
            )));
        };
        self.schedule_operation(
            global,
            frame,
            VideoOperation::Hls {
                directory,
                target_ms: (seconds * 1000.0).round() as u32,
            },
        )
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_gif(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let options = Self::options(global, frame)?;
        let start = Self::option(global, options, "start", 0.0, 0.0, f64::MAX, false)?;
        let duration = Self::option(global, options, "duration", 1.0, 0.000_001, 5.0, false)?;
        let fps = Self::option(global, options, "fps", 12.0, 1.0, 24.0, true)? as u16;
        let width = Self::option(global, options, "width", 320.0, 1.0, 640.0, true)? as u16;
        self.schedule_operation(
            global,
            frame,
            VideoOperation::Gif {
                start,
                duration,
                fps,
                width,
            },
        )
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_placeholder(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        let option = frame.argument(0);
        if !option.is_undefined_or_null() && !option.to_bun_string(global)?.eq_ascii(b"dataurl") {
            return Err(global
                .throw_invalid_arguments(format_args!("Video.placeholder supports only dataurl")));
        }
        let image = js::image_get_cached(frame.this()).expect("Video owns an Image source");
        self.image().schedule_video_operation(
            &global.js_thread_of_caller(frame),
            image,
            VideoOperation::Placeholder(self.time.get()),
            Deliver::DataUrl,
        )
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_bytes(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.schedule(global, frame, Some(self.time.get()), Deliver::Uint8Array)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_rgba(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.schedule_operation(global, frame, VideoOperation::Rgba(self.time.get()))
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_blob(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        self.schedule(global, frame, Some(self.time.get()), Deliver::Blob)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_write(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let destination = frame.argument(0);
        if destination.is_undefined_or_null() {
            return Err(global.throw_invalid_arguments(format_args!(
                "Video.write expects a path, Bun.file, Bun.s3 or fd"
            )));
        }
        self.schedule(
            global,
            frame,
            Some(self.time.get()),
            Deliver::WriteDest(Strong::create(destination, global)),
        )
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn do_metadata(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        self.schedule(global, frame, None, Deliver::Uint8Array)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_width(&self, global: &JSGlobalObject) -> JSValue {
        self.image().get_width(global)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_height(&self, global: &JSGlobalObject) -> JSValue {
        self.image().get_height(global)
    }
}
