use ffmpeg::software::scaling::{context::Context, flag::Flags};
use ffmpeg::util::frame::video::Video;
use ffmpeg_next as ffmpeg;
use std::{io::Write, path::Path};

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
