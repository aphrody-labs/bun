import type { YtDlpOptions, YtDlpResult } from "./ytdlp";
import { GpuRuntime, type GpuReport } from "@aphrody/bun-runtime-sdk/gpu";
import { MpvClient, mpvLibraryPath } from "./mpv";
import { FFmpeg, type FFmpegInput } from "./ffmpeg";
import type { WebGpuOptions } from "./webgpu";
import { materializeVideoSource, type VideoSource } from "./source";

export interface VideoPipelineOptions {
  readonly source: VideoSource;
  readonly ytDlp?: YtDlpOptions | false;
  readonly mpvLibraryPath?: string;
  readonly mediaDirectory?: string;
  readonly playback?: boolean;
  readonly playerOptions?: Readonly<Record<string, string>>;
  readonly webgpu?: WebGpuOptions | false;
  readonly signal?: AbortSignal;
}

export interface VideoPipelineResult {
  readonly source: unknown;
  readonly gpu: GpuReport | null;
  readonly gpuRuntime: GpuRuntime | null;
  readonly player: MpvClient | null;
  readonly ffmpeg: FFmpeg;
  readonly input: FFmpegInput;
  close(): void;
  [Symbol.dispose](): void;
}

/** Resolve a source, qualify the native GPU, and optionally attach a libmpv player. */
export async function openVideoPipeline(options: VideoPipelineOptions): Promise<VideoPipelineResult> {
  options.signal?.throwIfAborted();
  const input = await materializeVideoSource(options.source, options.signal);
  if (input.kind === "bytes" && options.playback)
    throw new TypeError("libmpv playback of memory sources requires a custom stream adapter");
  let source: typeof input | YtDlpResult = input;
  let media = input.kind === "file" ? input.path : input.kind === "remote" ? input.url : null;
  if (input.kind === "remote" && options.ytDlp && typeof options.ytDlp === "object") {
    const { runYtDlp } = await import("./ytdlp");
    source = await runYtDlp({ url: input.url, options: { quiet: true, ...options.ytDlp }, signal: options.signal });
    if (typeof source.url !== "string" || !source.url)
      throw new Error("yt-dlp did not select a directly playable media URL");
    media = source.url;
  }
  options.signal?.throwIfAborted();
  const ffmpeg = FFmpeg.open(options.mediaDirectory);
  let player: MpvClient | null = null;
  let gpuRuntime: GpuRuntime | null = null;
  const close = () => {
    try {
      player?.close();
    } finally {
      try {
        gpuRuntime?.close();
      } finally {
        ffmpeg.close();
      }
    }
  };
  try {
    const nativeInput =
      input.kind === "bytes"
        ? ffmpeg.openMemory(input.data instanceof Blob ? await input.data.arrayBuffer() : input.data)
        : ffmpeg.openInput(media!);
    let gpu: VideoPipelineResult["gpu"] = null;
    if (options.webgpu !== false) {
      if (options.webgpu?.backend === "chromium")
        throw new TypeError("The native video pipeline requires the native GPU backend");
      gpuRuntime = GpuRuntime.load(
        options.webgpu?.libraryPath === undefined ? {} : { libraryPath: options.webgpu.libraryPath },
      );
      const signals = [options.signal, options.webgpu?.signal].filter((signal): signal is AbortSignal => !!signal);
      gpu = await gpuRuntime.info(signals.length ? { signal: AbortSignal.any(signals) } : undefined);
    }
    options.signal?.throwIfAborted();
    player =
      options.playback || options.mpvLibraryPath
        ? MpvClient.open({
            libraryPath: options.mpvLibraryPath ?? mpvLibraryPath(options.mediaDirectory),
            options: options.playerOptions,
          })
        : null;
    if (player && options.playback) player.command("loadfile", media!);
    return { source, gpu, gpuRuntime, player, ffmpeg, input: nativeInput, close, [Symbol.dispose]: close };
  } catch (error) {
    close();
    throw error;
  }
}
