import { basename, extname, isAbsolute, resolve } from "node:path";
import { normalizeXVideoUrl, XVideoSource } from "./x-source";
import type { YtDlpProgress, YtDlpResult } from "./ytdlp";

export type MediaJob =
  | {
      readonly action: "download";
      readonly url: string;
      readonly output: string;
      readonly signal?: AbortSignal;
      readonly maxBytes?: number;
      readonly maxDurationSeconds?: number;
      readonly onProgress?: (progress: YtDlpProgress) => void;
    }
  | { readonly action: "inspect"; readonly source: string; readonly signal?: AbortSignal }
  | {
      readonly action: "cut";
      readonly input: string;
      readonly output: string;
      readonly startSeconds: number;
      readonly durationSeconds: number;
      readonly signal?: AbortSignal;
    }
  | {
      readonly action: "compress";
      readonly input: string;
      readonly output: string;
      readonly quality?: number;
      readonly preset?: "ultrafast" | "fast" | "medium" | "slow" | "veryslow";
      readonly signal?: AbortSignal;
    };

function outputPath(input: string, label: string): string {
  if (!input || input.includes("\0")) throw new TypeError(`${label} path is required`);
  const path = resolve(input);
  if (!isAbsolute(path) || basename(path) === "." || extname(path) === "")
    throw new TypeError(`${label} must be an absolute media filename with an extension`);
  return path;
}

function localInput(input: string): string {
  if (!input || input.includes("\0")) throw new TypeError("Input path is required");
  const path = resolve(input);
  if (!isAbsolute(path)) throw new TypeError("Input path must be absolute");
  return path;
}

async function editWithFFmpeg(
  args: string[],
  signal?: AbortSignal,
): Promise<{ readonly output: string; readonly bytes: number }> {
  signal?.throwIfAborted();
  const { mediaAssets } = await import("bun-video:media-runtime");
  const child = Bun.spawn([mediaAssets.ffmpegExecutable, "-hide_banner", "-nostdin", "-n", ...args], {
    stdout: "ignore",
    stderr: "pipe",
    signal,
  });
  const [status, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (status !== 0) {
    const detail = stderr.split("\n").filter(Boolean).slice(-8).join("\n").slice(-2000);
    throw new Error(`FFmpeg exited with status ${status}${detail ? `: ${detail}` : ""}`);
  }
  const output = args.at(-1)!;
  const file = Bun.file(output);
  if (!(await file.exists()) || file.size === 0) throw new Error("FFmpeg did not produce a non-empty output file");
  return { output, bytes: file.size };
}

/** One typed entry point for source inspection, acquisition, timeline cuts and compression. */
export async function executeMediaJob(job: MediaJob) {
  job.signal?.throwIfAborted();
  if (job.action === "download") {
    const output = outputPath(job.output, "Output");
    const parsed = new URL(job.url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new TypeError("Source must use HTTP(S)");
    const controls = {
      ...(job.signal ? { signal: job.signal } : {}),
      ...(job.maxBytes !== undefined ? { maxBytes: job.maxBytes } : {}),
      ...(job.maxDurationSeconds !== undefined ? { maxDurationSeconds: job.maxDurationSeconds } : {}),
      ...(job.onProgress ? { onProgress: job.onProgress } : {}),
    };
    const xStatus = (() => {
      try {
        return normalizeXVideoUrl(parsed.href);
      } catch {
        return undefined;
      }
    })();
    let result: YtDlpResult & { readonly localPath: string };
    if (xStatus) {
      const { downloadYtDlp } = await import("./ytdlp");
      const source = new XVideoSource({
        ytdlp: { format: "bestvideo+bestaudio/best", merge_output_format: "mp4" },
        download: (url, path, options) => downloadYtDlp(url, path, options, controls),
      });
      const metadata = await source.download(xStatus.url, output);
      result = { ...metadata, localPath: output };
    } else {
      const { downloadYtDlp } = await import("./ytdlp");
      result = await downloadYtDlp(
        parsed.href,
        output,
        { no_playlist: true, format: "bestvideo+bestaudio/best", merge_output_format: "mp4" },
        controls,
      );
    }
    return { action: job.action, output: result.localPath, bytes: Bun.file(result.localPath).size, metadata: result } as const;
  }

  if (job.action === "inspect") {
    let url: URL | undefined;
    try {
      url = new URL(job.source);
    } catch {}
    if (url) {
      if (!/^https?:$/.test(url.protocol) || url.username || url.password)
        throw new TypeError("Source URL must use HTTP(S) without credentials");
      const { extractYtDlp } = await import("./ytdlp");
      return { action: job.action, metadata: await extractYtDlp(url.href, { no_playlist: true }) } as const;
    }
    const input = localInput(job.source);
    if (!(await Bun.file(input).exists())) throw new Error("Input media file does not exist");
    const nativeVideo = (Bun as unknown as {
      Video?: { available: boolean; new (source: string): { metadata(): Promise<unknown> } };
    }).Video;
    if (!nativeVideo?.available) throw new Error("Native Bun.Video metadata provider is unavailable");
    const video = new nativeVideo(input);
    return { action: job.action, input, metadata: await video.metadata() } as const;
  }

  const input = localInput(job.input);
  const output = outputPath(job.output, "Output");
  if (input === output) throw new TypeError("Input and output paths must differ");
  if (!(await Bun.file(input).exists()) || Bun.file(input).size === 0) throw new Error("Input media is missing or empty");
  if (await Bun.file(output).exists()) throw new Error("Output already exists; choose a new path");

  if (job.action === "cut") {
    if (!Number.isFinite(job.startSeconds) || job.startSeconds < 0 || job.startSeconds > 86400)
      throw new RangeError("Start time must be between 0 and 86400 seconds");
    if (!Number.isFinite(job.durationSeconds) || job.durationSeconds <= 0 || job.durationSeconds > 86400)
      throw new RangeError("Cut duration must be between 0 and 86400 seconds");
    return {
      action: job.action,
      ...(await editWithFFmpeg(
        ["-ss", String(job.startSeconds), "-i", input, "-t", String(job.durationSeconds), "-map", "0:v?", "-map", "0:a?", "-c", "copy", output],
        job.signal,
      )),
    } as const;
  }

  const quality = job.quality ?? 23;
  if (!Number.isSafeInteger(quality) || quality < 0 || quality > 51) throw new RangeError("Quality must be 0..51");
  const preset = job.preset ?? "medium";
  const webm = extname(output).toLowerCase() === ".webm";
  const webmSpeed: Readonly<Record<typeof preset, string>> = {
    ultrafast: "8",
    fast: "6",
    medium: "4",
    slow: "2",
    veryslow: "0",
  };
  return {
    action: job.action,
    ...(await editWithFFmpeg(
      [
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        ...(webm
          ? ["-c:v", "libvpx-vp9", "-crf", String(quality), "-b:v", "0", "-cpu-used", webmSpeed[preset]]
          : ["-c:v", "libx264", "-crf", String(quality), "-preset", preset]),
        "-c:a",
        webm ? "libopus" : "aac",
        output,
      ],
      job.signal,
    )),
  } as const;
}
