import { parseTime, parseTimestamps, renderReport, watch, type WatchDetail, type WatchOptions } from "./watch";

const usage = `bun-video watch <url-or-file> [--detail transcript|efficient|balanced|token-burner] [--start T --end T]
  [--timestamps T1,T2] [--max-frames N] [--resolution W] [--fps F] [--no-dedup] [--captions FILE.vtt|srt]
  [--whisper groq|openai] [--no-whisper] [--sub-lang CODE] [--cookies FILE] [--out-dir DIR] [--json]`;

const DETAILS = ["transcript", "efficient", "balanced", "token-burner"];

function take(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function flag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function numeric(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number`);
  return number;
}

export async function run(argv: string[]): Promise<void> {
  const args = [...argv];
  if (!args.length || flag(args, "--help")) {
    console.log(usage);
    return;
  }
  const json = flag(args, "--json");
  const noDedup = flag(args, "--no-dedup");
  const noWhisper = flag(args, "--no-whisper");
  const whisper = take(args, "--whisper");
  if (noWhisper && whisper) throw new Error("--no-whisper conflicts with --whisper");
  if (whisper && whisper !== "groq" && whisper !== "openai") throw new Error("--whisper must be groq or openai");
  const detail = take(args, "--detail");
  if (detail && !DETAILS.includes(detail)) throw new Error(`--detail must be one of ${DETAILS.join(", ")}`);
  const options: WatchOptions = {
    source: "",
    detail: detail as WatchDetail | undefined,
    start: parseTime(take(args, "--start")),
    end: parseTime(take(args, "--end")),
    timestamps: parseTimestamps(take(args, "--timestamps")),
    maxFrames: numeric(take(args, "--max-frames"), "--max-frames"),
    resolution: numeric(take(args, "--resolution"), "--resolution"),
    fps: numeric(take(args, "--fps"), "--fps"),
    captions: take(args, "--captions"),
    subLang: take(args, "--sub-lang"),
    cookiesFile: take(args, "--cookies"),
    outDir: take(args, "--out-dir"),
    dedup: !noDedup,
    whisper: noWhisper ? "none" : (whisper as "groq" | "openai" | undefined),
  };
  const [source, ...rest] = args;
  if (!source || rest.length) throw new Error(`Expected exactly one source.\n${usage}`);
  options.source = source;
  const report = await watch(options);
  console.log(json ? JSON.stringify(report, null, 2) : renderReport(report));
  if (report.errors.length && !report.frames.length && !report.transcript.length) process.exitCode = 1;
}
