use ffmpeg::software::scaling::{context::Context, flag::Flags};
use ffmpeg::util::frame::video::Video;
use ffmpeg_next as ffmpeg;
use std::{io::Write, path::Path};

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
                .chunks_exact(4)
                .zip(destination.chunks_exact_mut(4))
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
