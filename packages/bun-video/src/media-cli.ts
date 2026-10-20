import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { executeMediaJob, type MediaJob } from "./media-workflow";
import { createMediaTimelineServer } from "./media-timeline";
import type { YtDlpProgress } from "./ytdlp";

const usage = `bun-video media inspect <file-or-url>
bun-video media download <url> <output>
bun-video media cut <input> <output> --start <seconds> --duration <seconds>
bun-video media compress <input> <output> [--crf 0..51] [--preset ultrafast|fast|medium|slow|veryslow]
bun-video media serve [--root <directory>] [--port <1..65535>]`;

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function numberOption(args: string[], name: string, required = false): number | undefined {
  const value = option(args, name);
  if (required && value === undefined) throw new Error(`${name} is required`);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number`);
  return number;
}

function progress(progress: YtDlpProgress) {
  const amount =
    progress.percentage === null
      ? `${(progress.downloadedBytes / 1048576).toFixed(1)} MiB`
      : `${progress.percentage.toFixed(1)}%`;
  process.stderr.write(`\r${progress.status}: ${amount}`);
  if (progress.status === "finished") process.stderr.write("\n");
}

async function serve(args: string[]) {
  const root = resolve(option(args, "--root") ?? "var/media");
  const port = numberOption(args, "--port") ?? 8787;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new RangeError("Port must be 0..65535");
  if (args.length) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
  await mkdir(root, { recursive: true });
  const server = createMediaTimelineServer(root, port);
  console.log(JSON.stringify({ service: "bun-video", url: server.url.href, mediaRoot: root }));
}

export async function run(args: string[]) {
  const [action, ...rest] = args;
  if (!action || action === "help" || action === "--help" || action === "-h") {
    console.log(usage);
    return;
  }
  if (action === "serve") return serve(rest);

  let job: MediaJob;
  if (action === "inspect") {
    if (rest.length !== 1) throw new Error(usage);
    job = { action, source: rest[0]! };
  } else if (action === "download") {
    const maxBytes = numberOption(rest, "--max-bytes");
    const maxDurationSeconds = numberOption(rest, "--max-duration");
    if (rest.length !== 2) throw new Error(usage);
    job = {
      action,
      url: rest[0]!,
      output: rest[1]!,
      onProgress: progress,
      ...(maxBytes !== undefined ? { maxBytes } : {}),
      ...(maxDurationSeconds !== undefined ? { maxDurationSeconds } : {}),
    };
  } else if (action === "cut") {
    const startSeconds = numberOption(rest, "--start", true)!;
    const durationSeconds = numberOption(rest, "--duration", true)!;
    if (rest.length !== 2) throw new Error(usage);
    job = { action, input: rest[0]!, output: rest[1]!, startSeconds, durationSeconds };
  } else if (action === "compress") {
    const quality = numberOption(rest, "--crf");
    const presetValue = option(rest, "--preset");
    if (presetValue !== undefined && !["ultrafast", "fast", "medium", "slow", "veryslow"].includes(presetValue))
      throw new Error("Preset must be ultrafast, fast, medium, slow or veryslow");
    const preset = presetValue as "ultrafast" | "fast" | "medium" | "slow" | "veryslow" | undefined;
    if (rest.length !== 2) throw new Error(usage);
    job = {
      action,
      input: rest[0]!,
      output: rest[1]!,
      ...(quality !== undefined ? { quality } : {}),
      ...(preset ? { preset } : {}),
    };
  } else {
    throw new Error(`Unknown media action: ${action}\n${usage}`);
  }
  if (rest.some(value => value.startsWith("--")))
    throw new Error(`Unknown option: ${rest.find(value => value.startsWith("--"))}`);
  console.log(JSON.stringify(await executeMediaJob(job), null, 2));
}
