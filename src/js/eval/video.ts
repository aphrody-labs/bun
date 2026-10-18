// Lazy CLI entry over the native Bun.Video API; embedded by bundle-modules.
const { open: openFile, mkdir, rmdir, unlink } = require("node:fs/promises");
const { dirname, extname, join, resolve } = require("node:path");

const help = `Usage: bun video <command> [options]

  info [--json]                         Native provider and runtime identity
  metadata <input> [--json]              MP4 media metadata
  frame <input> <output> [options]       Extract and transform one frame
  frames <input> <new-directory>         Export a bounded PNG frame batch
  audio <input> <output.wav>             Extract PCM16 WAV audio
  gif <input> <output.gif>               Export a bounded palette GIF
  remux <input> <output>                 Copy packets into a new .mp4, .mov, .mkv or .webm
  hls <input> <new-directory>            Cut CMAF segments and a VOD playlist.m3u8

Frame options: --time SECONDS --width N --height N --format png|jpeg|webp|heic|avif
Batch options: --start SECONDS --end SECONDS --step SECONDS --max-frames N
Audio options: --start SECONDS --duration SECONDS --stream N --sample-rate N
GIF options:   --start SECONDS --duration SECONDS --fps N --width N
HLS options:   --segment-seconds SECONDS (0.5 to 60, default 6)
Every command accepts --json and --help. Existing output files are refused.

Optional compiled extension: remotion, hyperframes, site, workers, ytdlp,
capabilities, media-probe, encode, mcp. Requires the qualified adjacent bun-video.
`;

function parse(args: string[], names: readonly string[]) {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg === "--json" || arg === "--help" || arg === "-h") {
      flags[arg === "--json" ? "json" : "help"] = true;
      continue;
    }
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    const equal = arg.indexOf("=");
    const name = equal < 0 ? arg.slice(2) : arg.slice(2, equal);
    const inline = equal < 0 ? undefined : arg.slice(equal + 1);
    if (!arg.startsWith("--") || !names.includes(name!)) throw new Error(`Unknown video option ${arg}`);
    const value = inline ?? args[++i];
    if (value === undefined || value === "") throw new Error(`--${name} requires a value`);
    flags[name!] = value;
  }
  return { flags, positionals };
}

function number(flags: Record<string, string | boolean>, name: string, fallback?: number): number | undefined {
  if (flags[name] === undefined) return fallback;
  const value = Number(flags[name]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a finite non-negative number`);
  return value;
}

function integer(flags: Record<string, string | boolean>, name: string, fallback?: number): number | undefined {
  const value = number(flags, name, fallback);
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
    throw new Error(`--${name} must be a positive integer`);
  return value;
}

function report(value: object, json: unknown) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else
    for (const [name, entry] of Object.entries(value))
      console.log(`${name}: ${typeof entry === "object" ? JSON.stringify(entry) : entry}`);
}

async function writeNew(path: string, produce: () => Promise<Uint8Array>) {
  const file = await openFile(path, "wx", 0o600);
  let closed = false;
  try {
    const data = await produce();
    await file.writeFile(data);
    return data.byteLength;
  } catch (error) {
    await file.close();
    closed = true;
    await unlink(path);
    throw error;
  } finally {
    if (!closed) await file.close();
  }
}

async function extension(command: string, args: string[]) {
  const root = dirname(process.execPath);
  const name = process.platform === "win32" ? "bun-video.exe" : "bun-video";
  const executable = join(root, name);
  const file = Bun.file(executable);
  const receipt = Bun.file(join(root, "bun-media-release.json"));
  if (!(await file.exists()) || !(await receipt.exists()))
    throw new Error("Qualified bun-video extension is not installed beside this Bun runtime");
  const manifest = await receipt.json();
  const expected = manifest.files?.[name];
  if (
    manifest.schema !== 1 ||
    manifest.kind !== "bun-media-release" ||
    manifest.source !== Bun.revision ||
    manifest.version !== Bun.version ||
    typeof manifest.completeFactoryReleaseQualified !== "boolean" ||
    !["candidate", "stable"].includes(manifest.channel) ||
    !/^[a-f0-9]{64}$/.test(expected?.sha256 ?? "") ||
    expected.bytes !== file.size ||
    file.size > 2 * 1024 * 1024 * 1024
  )
    throw new Error("Bun Video extension receipt does not match this runtime or artifact");
  const requiredGates = [
    "runtime-channel",
    "runtime-identity",
    "video-channel",
    "video-identity",
    "image-video",
    "media-library-abi",
    "native-encode",
    "native-decode",
    "native-pixels",
    "video-cli",
  ];
  if (!Array.isArray(manifest.gates)) throw new Error("Bun Video extension lacks native release gate receipts");
  for (const id of requiredGates) {
    const gates = manifest.gates.filter((gate: { id: string }) => gate.id === id);
    if (
      gates.length !== 1 ||
      gates[0].passed !== true ||
      !/^qualification\/[a-z0-9-]+\.log$/.test(gates[0].log) ||
      !/^[a-f0-9]{64}$/.test(gates[0].sha256)
    )
      throw new Error(`Bun Video extension lacks its native ${id} gate`);
    const log = Bun.file(join(root, gates[0].log));
    if (
      !(await log.exists()) ||
      log.size > 4 * 1024 * 1024 ||
      new Bun.CryptoHasher("sha256").update(await log.bytes()).digest("hex") !== gates[0].sha256
    )
      throw new Error(`Bun Video extension gate evidence differs: ${id}`);
  }
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of file.stream()) hash.update(chunk);
  if (hash.digest("hex") !== expected.sha256)
    throw new Error("Bun Video extension checksum differs from its release receipt");
  const child = Bun.spawn([executable, command, ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  return await child.exited;
}

async function main() {
  const argv = process.argv.slice(1);
  const at = argv.indexOf("video");
  if (at === -1) throw new Error("Expected bun video");
  const [command, ...args] = argv.slice(at + 1);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    process.stdout.write(help);
    return 0;
  }
  if (
    ["remotion", "hyperframes", "site", "workers", "ytdlp", "capabilities", "media-probe", "encode", "mcp"].includes(
      command,
    )
  )
    return await extension(command, args);
  const options: Record<string, readonly string[]> = {
    info: [],
    metadata: [],
    remux: [],
    hls: ["segment-seconds"],
    frame: ["time", "width", "height", "format"],
    frames: ["start", "end", "step", "max-frames"],
    audio: ["start", "duration", "stream", "sample-rate"],
    gif: ["start", "duration", "fps", "width"],
  };
  if (!Object.hasOwn(options, command)) throw new Error(`Unknown video command ${command}`);
  const { flags, positionals } = parse(args, options[command]!);
  if (flags.help) {
    process.stdout.write(help);
    return 0;
  }
  const count = command === "info" ? 0 : command === "metadata" ? 1 : 2;
  if (positionals.length !== count)
    throw new Error(`${command} requires ${count} path argument(s); see bun video --help`);
  if (command === "info") {
    const available = typeof Bun.Video === "function" && Bun.Video.available;
    report(
      {
        version: Bun.version,
        revision: Bun.revision,
        platform: process.platform,
        arch: process.arch,
        available,
        decoder: typeof Bun.Video === "function" ? Bun.Video.decoder : null,
        imageBackend: typeof Bun.Video === "function" ? Bun.Video.backend : null,
      },
      flags.json,
    );
    return 0;
  }
  if (typeof Bun.Video !== "function" || !Bun.Video.available)
    throw new Error("This runtime does not include the native Bun.Video provider");
  const source = resolve(positionals[0]!);
  const output = positionals[1] ? resolve(positionals[1]) : undefined;
  if (output === source) throw new Error("Video output must differ from its input");
  const video = new Bun.Video(source);
  if (command === "metadata") {
    report(await video.metadata(), flags.json);
    return 0;
  }
  if (command === "frame") {
    const time = number(flags, "time", 0)!;
    const width = integer(flags, "width");
    const height = integer(flags, "height");
    if (height !== undefined && width === undefined) throw new Error("--height requires --width");
    const format = (flags.format ?? (extname(output!).slice(1) || "png")) as string;
    const encoder = format === "jpg" ? "jpeg" : format;
    if (!["png", "jpeg", "webp", "heic", "avif"].includes(encoder)) throw new Error("Unsupported frame output format");
    video.frame(time);
    if (width !== undefined) video.resize(width, height);
    video[encoder as "png"]();
    const bytes = await writeNew(output!, () => video.bytes());
    report({ output, bytes, time, format: encoder }, flags.json);
  } else if (command === "frames") {
    const start = number(flags, "start", 0)!;
    const end = number(flags, "end");
    const step = number(flags, "step", 1)!;
    const maxFrames = integer(flags, "max-frames", 64)!;
    if (end === undefined || end <= start || step <= 0 || maxFrames > 64 || Math.ceil((end - start) / step) > maxFrames)
      throw new Error("Frame batch requires --end after --start, positive --step and at most 64 frames");
    await mkdir(output!);
    const owned: string[] = [];
    try {
      const frames = await video.frames({ start, end, step, maxFrames });
      const inventory: { time: number; file: string; bytes: number }[] = [];
      for (const [index, frame] of frames.entries()) {
        const name = `${String(index).padStart(6, "0")}.png`;
        await writeNew(join(output!, name), async () => frame.bytes);
        owned.push(name);
        inventory.push({ time: frame.time, file: name, bytes: frame.bytes.length });
      }
      await writeNew(join(output!, "frames.json"), async () =>
        new TextEncoder().encode(`${JSON.stringify(inventory, null, 2)}\n`),
      );
      owned.push("frames.json");
      report({ output, frames: inventory }, flags.json);
    } catch (error) {
      for (const name of owned) await unlink(join(output!, name));
      await rmdir(output!, undefined).catch(() => {});
      throw error;
    }
  } else if (command === "audio") {
    const start = number(flags, "start", 0)!;
    const duration = number(flags, "duration");
    const stream = number(flags, "stream", 0)!;
    const sampleRate = integer(flags, "sample-rate");
    if (!duration || duration > 30 || !Number.isSafeInteger(stream))
      throw new Error("Audio requires --duration within (0,30] and an integer stream index");
    const bytes = await writeNew(output!, () =>
      video.audio({ start, duration, stream, ...(sampleRate ? { sampleRate } : {}) }),
    );
    report({ output, bytes, start, duration, format: "pcm16-wav" }, flags.json);
  } else if (command === "gif") {
    const start = number(flags, "start", 0)!;
    const duration = number(flags, "duration");
    const fps = integer(flags, "fps", 12)!;
    const width = integer(flags, "width", 320)!;
    if (!duration || duration > 5 || fps > 24 || fps * duration > 120 || width > 640)
      throw new Error("GIF requires duration <=5 seconds, <=120 frames and width <=640");
    const bytes = await writeNew(output!, () => video.gif({ start, duration, fps, width }));
    report({ output, bytes, start, duration, fps, width, format: "palette-gif" }, flags.json);
  } else if (command === "remux") {
    const bytes = await video.remux(output!);
    report({ output, bytes, format: extname(output!).slice(1) }, flags.json);
  } else if (command === "hls") {
    const segmentSeconds = number(flags, "segment-seconds", 6)!;
    if (segmentSeconds < 0.5 || segmentSeconds > 60) throw new Error("--segment-seconds must be within [0.5, 60]");
    const segments = await video.hls(output!, { segmentSeconds });
    report({ output, segments, playlist: join(output!, "playlist.m3u8") }, flags.json);
  }
  return 0;
}

main().then(
  code => process.exit(code),
  error => {
    process.stderr.write(`error: ${error?.message ?? error}\n`);
    process.exit(1);
  },
);
