import { runYtDlp, type YtDlpOptions } from "./ytdlp";
import { MpvClient } from "./mpv";
import { nativeWebGpuInfo, type WebGpuOptions } from "./webgpu";
import { resolveVideoSource, type VideoSource } from "./source";

export interface VideoPipelineOptions {
  readonly source: VideoSource;
  readonly ytDlp?: YtDlpOptions;
  readonly mpvLibraryPath?: string;
  readonly webgpu?: WebGpuOptions | false;
  readonly signal?: AbortSignal;
}

export interface VideoPipelineResult {
  readonly source: unknown;
  readonly gpu: Awaited<ReturnType<typeof nativeWebGpuInfo>> | null;
  readonly player: MpvClient | null;
}

/** Resolve a source, qualify the native GPU, and optionally attach a libmpv player. */
export async function openVideoPipeline(options: VideoPipelineOptions): Promise<VideoPipelineResult> {
  options.signal?.throwIfAborted();
  const input = resolveVideoSource(options.source);
  const source =
    input.kind === "remote"
      ? await runYtDlp({ url: input.url, options: { quiet: true, ...options.ytDlp }, signal: options.signal })
      : input;
  options.signal?.throwIfAborted();
  const gpu = options.webgpu === false ? null : await nativeWebGpuInfo(options.webgpu ?? {});
  options.signal?.throwIfAborted();
  const player = options.mpvLibraryPath ? MpvClient.open({ libraryPath: options.mpvLibraryPath }) : null;
  return { source, gpu, player };
}
