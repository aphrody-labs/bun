#[cfg(not(feature = "libav"))]
use bun_video_native::spawn_decode_rgba;
use bun_video_native::{Backend, EncodeOptions, probe_backend, probe_media};
use std::ffi::OsStr;
use std::io;
use std::path::PathBuf;

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let ffmpeg = std::env::var_os("BUN_VIDEO_FFMPEG").unwrap_or_else(|| "ffmpeg".into());
    match args.first().map(String::as_str) {
        Some("probe") => {
            for backend in [Backend::Ffv1, Backend::Nvenc, Backend::Qsv, Backend::Amf] {
                let ready = probe_backend(&ffmpeg, backend)?;
                println!("{{\"encoder\":\"{}\",\"runtimeReady\":{ready},\"exactRgba\":{}}}", backend.encoder(), backend == Backend::Ffv1);
            }
        }
        #[cfg(feature = "gpu")]
        Some("gpu-info") => {
            let adapters = bun_video_native::probe_gpu_adapters().map_err(io::Error::other)?;
            for adapter in adapters {
                println!(
                    "{{\"name\":{},\"driver\":{},\"deviceType\":{},\"supportsDecoding\":{},\"supportsEncoding\":{}}}",
                    json_string(&adapter.name),
                    json_string(&adapter.driver),
                    json_string(&adapter.device_type),
                    adapter.supports_decoding,
                    adapter.supports_encoding,
                );
            }
        }
        Some("media") if args.len() == 2 => {
            use std::io::Write;
            let ffprobe = std::env::var_os("BUN_VIDEO_FFPROBE").unwrap_or_else(|| "ffprobe".into());
            let output = probe_media(&ffprobe, &PathBuf::from(&args[1]))?;
            if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).into_owned().into()); }
            io::stdout().lock().write_all(&output.stdout)?;
        }
        Some("decode") if args.len() == 2 => {
            #[cfg(feature = "libav")]
            bun_video_native::libav::decode_rgba(&PathBuf::from(&args[1]), &mut io::stdout().lock())?;
            #[cfg(not(feature = "libav"))]
            {
            let mut child = spawn_decode_rgba(&ffmpeg, &PathBuf::from(&args[1]))?;
            let result = io::copy(&mut child.stdout.take().ok_or("decoder stdout unavailable")?, &mut io::stdout().lock());
            if let Err(error) = result { let _ = child.kill(); let _ = child.wait(); return Err(error.into()); }
            if !child.wait()?.success() { return Err("FFmpeg decode failed".into()); }
            }
        }
        Some("encode") if args.len() == 6 || args.len() == 7 => {
            let allow_lossy = args.len() == 7 && args[6] == "--allow-lossy";
            if args.len() == 7 && !allow_lossy { return Err("unknown flag".into()); }
            let opts = EncodeOptions { backend: Backend::parse(&args[1])?, fps: args[2].parse()?, frames: args[3].parse()?, threads: args[4].parse()?, allow_lossy };
            let path = PathBuf::from(&args[5]);
            opts.args(&path)?;
            #[cfg(feature = "libav")]
            if opts.backend == Backend::Ffv1 {
                bun_video_native::libav::encode_ffv1(&mut io::stdin().lock(), &path, &opts)?;
                return Ok(());
            }
            if opts.backend != Backend::Ffv1 && !probe_backend(&ffmpeg, opts.backend)? { return Err("requested GPU encoder unavailable on this host".into()); }
            let mut child = opts.spawn(OsStr::new(&ffmpeg), &path)?;
            let result = {
                let mut input = child.stdin.take().ok_or("encoder stdin unavailable")?;
                io::copy(&mut io::stdin().lock(), &mut input)
            };
            if let Err(error) = result { let _ = child.kill(); let _ = child.wait(); return Err(error.into()); }
            if !child.wait()?.success() { return Err("FFmpeg encode failed".into()); }
        }
        _ => return Err("usage: bun-video-native probe | gpu-info | media ABS_INPUT | decode ABS_INPUT | encode ffv1|nvenc|qsv|amf FPS FRAMES THREADS ABS_OUTPUT [--allow-lossy]; stdin: concatenated PNG frames".into()),
    }
    Ok(())
}

#[cfg(feature = "gpu")]
fn json_string(value: &str) -> String {
    let mut output = String::with_capacity(value.len() + 2);
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            character if character.is_control() => {
                output.push_str(&format!("\\u{:04x}", character as u32))
            }
            character => output.push(character),
        }
    }
    output.push('"');
    output
}

fn main() {
    if let Err(error) = run() {
        eprintln!("bun-video-native: {error}");
        std::process::exit(1);
    }
}
