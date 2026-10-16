use ffmpeg::software::scaling::{context::Context, flag::Flags};
use ffmpeg::util::frame::video::Video;
use ffmpeg_next as ffmpeg;
use std::{io::Write, path::Path};

pub enum VideoInput<'a> {
    Path(&'a Path),
    Bytes(std::sync::Arc<[u8]>),
}

#[derive(Debug)]
pub enum VideoError {
    Invalid(&'static str),
    Codec(ffmpeg::Error),
    Io(std::io::Error),
}

impl std::fmt::Display for VideoError {
    fn fmt(&self, output: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) => output.write_str(message),
            Self::Codec(error) => std::fmt::Display::fmt(error, output),
            Self::Io(error) => std::fmt::Display::fmt(error, output),
        }
    }
}
impl std::error::Error for VideoError {}
impl From<ffmpeg::Error> for VideoError {
    fn from(error: ffmpeg::Error) -> Self {
        Self::Codec(error)
    }
}
impl From<std::io::Error> for VideoError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[derive(Debug)]
pub struct VideoMetadata {
    pub width: u32,
    pub height: u32,
    pub duration_seconds: Option<f64>,
    pub codec: String,
}

pub struct DecodedVideoFrame {
    pub width: u32,
    pub height: u32,
    pub timestamp_seconds: Option<f64>,
    pub png: Vec<u8>,
}

pub type VideoCancel = Option<std::sync::Arc<std::sync::atomic::AtomicBool>>;
type Cancel = VideoCancel;

fn cancelled(cancel: &Cancel) -> bool {
    cancel
        .as_ref()
        .is_some_and(|value| value.load(std::sync::atomic::Ordering::Relaxed))
}

fn open_video(
    source: VideoInput<'_>,
    cancel: &Cancel,
) -> Result<ffmpeg::format::context::Input, VideoError> {
    ffmpeg::init()?;
    if cancelled(cancel) {
        return Err(VideoError::Codec(ffmpeg::Error::Exit));
    }
    let token = cancel.clone();
    match source {
        VideoInput::Path(path) => {
            if !path.is_absolute() {
                return Err(VideoError::Invalid("video path must be absolute"));
            }
            Ok(ffmpeg::format::input_with_interrupt(path, move || {
                cancelled(&token)
            })?)
        }
        VideoInput::Bytes(bytes) => {
            if bytes.is_empty() || bytes.len() > 512 * 1024 * 1024 {
                return Err(VideoError::Invalid(
                    "video input must contain 1..536870912 bytes",
                ));
            }
            let io =
                ffmpeg::format::context::StreamIo::from_read_seek(std::io::Cursor::new(bytes))?;
            Ok(ffmpeg::format::input_from_stream_with_interrupt(
                io,
                None,
                None,
                move || cancelled(&token),
            )?)
        }
    }
}

fn check_shape(width: u32, height: u32, maximum: u64) -> Result<(), VideoError> {
    if maximum == 0
        || maximum > 268435456
        || width == 0
        || height == 0
        || u64::from(width) * u64::from(height) > maximum
    {
        return Err(VideoError::Invalid("video dimensions exceed maxPixels"));
    }
    Ok(())
}

pub fn probe_video(source: VideoInput<'_>, max_pixels: u64) -> Result<VideoMetadata, VideoError> {
    probe_video_with_cancel(source, max_pixels, None)
}

pub fn probe_video_with_cancel(
    source: VideoInput<'_>,
    max_pixels: u64,
    cancel: Cancel,
) -> Result<VideoMetadata, VideoError> {
    let input = open_video(source, &cancel)?;
    let stream = input
        .streams()
        .best(ffmpeg::media::Type::Video)
        .ok_or(ffmpeg::Error::StreamNotFound)?;
    let parameters = stream.parameters();
    let codec = parameters.id().name().to_owned();
    let (width, height) = parameter_shape(&parameters, max_pixels)?;
    let duration = input.duration();
    Ok(VideoMetadata {
        width,
        height,
        duration_seconds: (duration >= 0).then_some(duration as f64 / 1_000_000.0),
        codec,
    })
}

fn parameter_shape(
    parameters: &ffmpeg::codec::Parameters,
    max_pixels: u64,
) -> Result<(u32, u32), VideoError> {
    // SAFETY: the selected stream owns valid codec parameters for this borrow.
    let parameters = unsafe { &*parameters.as_ptr() };
    let width =
        u32::try_from(parameters.width).map_err(|_| VideoError::Invalid("invalid video width"))?;
    let height = u32::try_from(parameters.height)
        .map_err(|_| VideoError::Invalid("invalid video height"))?;
    check_shape(width, height, max_pixels)?;
    Ok((width, height))
}

pub fn decode_video_frame(
    source: VideoInput<'_>,
    time_seconds: f64,
    max_pixels: u64,
) -> Result<DecodedVideoFrame, VideoError> {
    decode_video_frame_with_cancel(source, time_seconds, max_pixels, None)
}

pub fn decode_video_frame_with_cancel(
    source: VideoInput<'_>,
    time_seconds: f64,
    max_pixels: u64,
    cancel: Cancel,
) -> Result<DecodedVideoFrame, VideoError> {
    if !time_seconds.is_finite()
        || time_seconds < 0.0
        || time_seconds > i64::MAX as f64 / 1_000_000.0
    {
        return Err(VideoError::Invalid(
            "frame time must be a finite nonnegative number",
        ));
    }
    let mut input = open_video(source, &cancel)?;
    let stream = input
        .streams()
        .best(ffmpeg::media::Type::Video)
        .ok_or(ffmpeg::Error::StreamNotFound)?;
    let index = stream.index();
    let base = f64::from(stream.time_base());
    if !base.is_finite() || base <= 0.0 {
        return Err(VideoError::Invalid("invalid video timestamp base"));
    }
    let start = stream.start_time();
    let start_seconds = if start == ffmpeg::ffi::AV_NOPTS_VALUE {
        0.0
    } else {
        start as f64 * base
    };
    let parameters = stream.parameters();
    parameter_shape(&parameters, max_pixels)?;
    let mut context = ffmpeg::codec::context::Context::from_parameters(parameters)?;
    context.set_threading(ffmpeg::codec::threading::Config::count(1));
    // SAFETY: this exclusive decoder context is not opened or shared yet.
    unsafe {
        (*context.as_mut_ptr()).max_pixels = max_pixels as i64;
    }
    let mut decoder = context.decoder().video()?;
    check_shape(decoder.width(), decoder.height(), max_pixels)?;
    if time_seconds > 0.0 {
        let timestamp = (time_seconds + start_seconds) * 1_000_000.0;
        if !timestamp.is_finite() || timestamp > i64::MAX as f64 || timestamp < i64::MIN as f64 {
            return Err(VideoError::Invalid("frame time exceeds timestamp range"));
        }
        input.seek(timestamp as i64, ..timestamp as i64)?;
        decoder.flush();
    }
    let mut decoded = Video::empty();
    let mut receive =
        |decoder: &mut ffmpeg::decoder::Video| -> Result<Option<DecodedVideoFrame>, VideoError> {
            loop {
                if cancelled(&cancel) {
                    return Err(VideoError::Codec(ffmpeg::Error::Exit));
                }
                match decoder.receive_frame(&mut decoded) {
                    Ok(()) => {}
                    Err(ffmpeg::Error::Eof) => return Ok(None),
                    Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => {
                        return Ok(None);
                    }
                    Err(error) => return Err(error.into()),
                }
                let timestamp_seconds = decoded
                    .timestamp()
                    .map(|timestamp| timestamp as f64 * base - start_seconds);
                if timestamp_seconds.is_some_and(|timestamp| timestamp < time_seconds) {
                    continue;
                }
                if time_seconds > 0.0 && timestamp_seconds.is_none() {
                    return Err(VideoError::Invalid("video frame has no timestamp"));
                }
                check_shape(decoded.width(), decoded.height(), max_pixels)?;
                let mut scaler = Context::get(
                    decoded.format(),
                    decoded.width(),
                    decoded.height(),
                    ffmpeg::format::Pixel::RGBA,
                    decoded.width(),
                    decoded.height(),
                    Flags::BILINEAR,
                )?;
                let mut rgba = Video::empty();
                scaler.run(&decoded, &mut rgba)?;
                let width = rgba.width();
                let height = rgba.height();
                let row = width as usize * 4;
                let mut pixels = Vec::with_capacity(row * height as usize);
                for y in 0..height as usize {
                    pixels.extend_from_slice(
                        &rgba.data(0)[y * rgba.stride(0)..y * rgba.stride(0) + row],
                    );
                }
                let png = crate::encode_rgba_png(width, height, &pixels)?;
                return Ok(Some(DecodedVideoFrame {
                    width,
                    height,
                    timestamp_seconds,
                    png,
                }));
            }
        };
    for (count, (stream, packet)) in input.packets().enumerate() {
        if count >= 100000 {
            return Err(VideoError::Invalid(
                "frame decode exceeds the 100000 packet limit",
            ));
        }
        if cancelled(&cancel) {
            return Err(VideoError::Codec(ffmpeg::Error::Exit));
        }
        if stream.index() != index {
            continue;
        }
        decoder.send_packet(&packet)?;
        if let Some(frame) = receive(&mut decoder)? {
            return Ok(frame);
        }
    }
    if cancelled(&cancel) {
        return Err(VideoError::Codec(ffmpeg::Error::Exit));
    }
    decoder.send_eof()?;
    receive(&mut decoder)?.ok_or(VideoError::Invalid(
        "no video frame exists at the selected time",
    ))
}

fn png_frame(
    input: &mut impl std::io::Read,
) -> Result<(u32, u32, Vec<u8>), Box<dyn std::error::Error>> {
    let mut signature = [0; 8];
    input.read_exact(&mut signature)?;
    if &signature != b"\x89PNG\r\n\x1a\n" {
        return Err("invalid PNG frame signature".into());
    }
    let mut encoded = signature.to_vec();
    loop {
        let mut header = [0; 8];
        input.read_exact(&mut header)?;
        let length = u32::from_be_bytes(header[..4].try_into()?) as usize;
        let end = encoded
            .len()
            .checked_add(length)
            .and_then(|n| n.checked_add(12))
            .ok_or("PNG size overflow")?;
        if end > 256 * 1024 * 1024 {
            return Err("PNG frame exceeds byte limit".into());
        }
        encoded.extend_from_slice(&header);
        let start = encoded.len();
        encoded.resize(end, 0);
        input.read_exact(&mut encoded[start..])?;
        if &header[4..] == b"IEND" {
            break;
        }
    }
    let mut decoder = png::Decoder::new(std::io::Cursor::new(encoded));
    decoder.set_limits(png::Limits {
        bytes: 256 * 1024 * 1024,
    });
    let mut reader = decoder.read_info()?;
    let mut bytes = vec![0; reader.output_buffer_size()];
    let frame = reader.next_frame(&mut bytes)?;
    if frame.color_type != png::ColorType::Rgba || frame.bit_depth != png::BitDepth::Eight {
        return Err("native encoding requires 8-bit RGBA PNG frames".into());
    }
    bytes.truncate(frame.buffer_size());
    reader.finish()?;
    Ok((frame.width, frame.height, bytes))
}

pub fn encode_ffv1(
    input: &mut impl std::io::BufRead,
    output: &Path,
    options: &crate::EncodeOptions,
) -> Result<(), Box<dyn std::error::Error>> {
    options.args(output)?;
    if options.backend != crate::Backend::Ffv1 {
        return Err("native FFV1 encoder requires ffv1 backend".into());
    }
    ffmpeg::init()?;
    let first = png_frame(input)?;
    let codec =
        ffmpeg::encoder::find(ffmpeg::codec::Id::FFV1).ok_or(ffmpeg::Error::EncoderNotFound)?;
    let mut encoder = ffmpeg::codec::context::Context::new_with_codec(codec)
        .encoder()
        .video()?;
    let time_base = ffmpeg::Rational(
        i32::try_from(options.fps.den)?,
        i32::try_from(options.fps.num)?,
    );
    encoder.set_width(first.0);
    encoder.set_height(first.1);
    encoder.set_format(ffmpeg::format::Pixel::BGRA);
    encoder.set_time_base(time_base);
    encoder.set_flags(ffmpeg::codec::Flags::GLOBAL_HEADER);
    let mut settings = ffmpeg::Dictionary::new();
    settings.set("level", "3");
    settings.set("slicecrc", "1");
    let mut encoder = encoder.open_with(settings)?;
    let reservation = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)?;
    drop(reservation);
    let mut container = ffmpeg::format::output_as(output, "matroska")?;
    {
        let mut stream = container.add_stream(codec)?;
        stream.set_time_base(time_base);
        stream.set_parameters(&encoder);
    }
    container.write_header()?;
    let output_time_base = container
        .stream(0)
        .ok_or(ffmpeg::Error::StreamNotFound)?
        .time_base();
    let drain = |encoder: &mut ffmpeg::encoder::Video,
                 container: &mut ffmpeg::format::context::Output|
     -> Result<(), Box<dyn std::error::Error>> {
        let mut packet = ffmpeg::Packet::empty();
        loop {
            match encoder.receive_packet(&mut packet) {
                Ok(()) => {}
                Err(ffmpeg::Error::Eof) => break,
                Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => break,
                Err(error) => return Err(error.into()),
            }
            packet.set_stream(0);
            packet.rescale_ts(time_base, output_time_base);
            packet.write_interleaved(container)?;
        }
        Ok(())
    };
    let mut next = Some(first);
    for index in 0..options.frames {
        let (width, height, bytes) = match next.take() {
            Some(frame) => frame,
            None => png_frame(input)?,
        };
        if width != encoder.width() || height != encoder.height() {
            return Err("PNG dimensions changed during encoding".into());
        }
        let mut frame = Video::new(ffmpeg::format::Pixel::BGRA, width, height);
        frame.set_pts(Some(i64::try_from(index)?));
        let stride = frame.stride(0);
        let row_bytes = usize::try_from(width)?
            .checked_mul(4)
            .ok_or("RGBA width overflow")?;
        for row in 0..height as usize {
            let destination = &mut frame.data_mut(0)[row * stride..row * stride + row_bytes];
            for (rgba, bgra) in bytes[row * row_bytes..(row + 1) * row_bytes]
                .as_chunks::<4>()
                .0
                .iter()
                .zip(destination.as_chunks_mut::<4>().0.iter_mut())
            {
                bgra.copy_from_slice(&[rgba[2], rgba[1], rgba[0], rgba[3]]);
            }
        }
        encoder.send_frame(&frame)?;
        drain(&mut encoder, &mut container)?;
    }
    if !input.fill_buf()?.is_empty() {
        return Err("More PNG frames than the declared frame count".into());
    }
    encoder.send_eof()?;
    drain(&mut encoder, &mut container)?;
    container.write_trailer()?;
    Ok(())
}

pub fn decode_rgba(
    input: &Path,
    output: &mut impl Write,
) -> Result<u64, Box<dyn std::error::Error>> {
    if !input.is_absolute() {
        return Err("input path must be absolute".into());
    }
    ffmpeg::init()?;
    let mut input = ffmpeg::format::input(input)?;
    let stream = input
        .streams()
        .best(ffmpeg::media::Type::Video)
        .ok_or(ffmpeg::Error::StreamNotFound)?;
    let index = stream.index();
    let mut decoder = ffmpeg::codec::context::Context::from_parameters(stream.parameters())?
        .decoder()
        .video()?;
    let mut scaler: Option<(ffmpeg::format::Pixel, u32, u32, Context)> = None;
    let mut count = 0;
    let mut drain =
        |decoder: &mut ffmpeg::decoder::Video| -> Result<(), Box<dyn std::error::Error>> {
            let mut frame = Video::empty();
            loop {
                match decoder.receive_frame(&mut frame) {
                    Ok(()) => {}
                    Err(ffmpeg::Error::Eof) => break,
                    Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => break,
                    Err(error) => return Err(error.into()),
                }
                let shape = (frame.format(), frame.width(), frame.height());
                if scaler
                    .as_ref()
                    .is_none_or(|(format, width, height, _)| (*format, *width, *height) != shape)
                {
                    scaler = Some((
                        shape.0,
                        shape.1,
                        shape.2,
                        Context::get(
                            shape.0,
                            shape.1,
                            shape.2,
                            ffmpeg::format::Pixel::RGBA,
                            shape.1,
                            shape.2,
                            Flags::BILINEAR,
                        )?,
                    ));
                }
                let mut rgba = Video::empty();
                scaler
                    .as_mut()
                    .ok_or("scaler unavailable")?
                    .3
                    .run(&frame, &mut rgba)?;
                let row_bytes = usize::try_from(rgba.width())?
                    .checked_mul(4)
                    .ok_or("RGBA row overflow")?;
                for row in 0..rgba.height() as usize {
                    let start = row
                        .checked_mul(rgba.stride(0))
                        .ok_or("RGBA stride overflow")?;
                    output.write_all(
                        rgba.data(0)
                            .get(start..start + row_bytes)
                            .ok_or("invalid RGBA plane")?,
                    )?;
                }
                count += 1;
            }
            Ok(())
        };
    let mut packet = ffmpeg::Packet::empty();
    loop {
        match packet.read(&mut input) {
            Ok(()) => {}
            Err(ffmpeg::Error::Eof) => break,
            Err(error) => return Err(error.into()),
        }
        if packet.stream() == index {
            decoder.send_packet(&packet)?;
            drain(&mut decoder)?;
        }
    }
    decoder.send_eof()?;
    drain(&mut decoder)?;
    Ok(count)
}
