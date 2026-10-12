import { runYtDlp, type YtDlpOptions } from "./ytdlp";
import { MpvClient } from "./mpv";
import { nativeWebGpuInfo, type WebGpuOptions } from "./webgpu";

export interface VideoPipelineOptions {
  readonly url: string;
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
  const source = await runYtDlp({ url: options.url, options: { quiet: true, ...options.ytDlp }, signal: options.signal });
  options.signal?.throwIfAborted();
  const gpu = options.webgpu === false ? null : await nativeWebGpuInfo(options.webgpu ?? {});
  options.signal?.throwIfAborted();
  const player = options.mpvLibraryPath ? MpvClient.open({ libraryPath: options.mpvLibraryPath }) : null;
  return { source, gpu, player };
}
