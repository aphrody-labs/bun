import { isAbsolute } from "node:path";
import { captureParallelFrames } from "./parallel-capture";
import { validateFramePlan, type FramePlan } from "./frame-plan";

export interface EncodeVideoOptions {
  nativeExecutable: string;
  output: string;
  codec?: "ffv1" | "nvenc" | "qsv" | "amf";
  allowLossy?: boolean;
  ffmpegExecutable?: string;
}

export async function encodeVideo(
  input: FramePlan,
  options: EncodeVideoOptions,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const plan = validateFramePlan(input);
  if (![options.nativeExecutable, options.output].every(isAbsolute))
    throw new TypeError("Executable and output paths must be absolute");
  if (options.ffmpegExecutable !== undefined && !isAbsolute(options.ffmpegExecutable))
    throw new TypeError("FFmpeg executable path must be absolute");
  if (options.allowLossy !== undefined && typeof options.allowLossy !== "boolean")
    throw new TypeError("allowLossy must be a boolean");
  const codec = options.codec ?? "ffv1";
  if (!["ffv1", "nvenc", "qsv", "amf"].includes(codec)) throw new TypeError("Unknown encoder");
  if (codec !== "ffv1" && !options.allowLossy)
    throw new Error("GPU H264 requires explicit allowLossy and drops alpha");
  const args = [
    options.nativeExecutable,
    "encode",
    codec,
    `${plan.fps.num}/${plan.fps.den}`,
    String(plan.endFrame - plan.startFrame),
    String(plan.workers),
    options.output,
  ];
  if (options.allowLossy) args.push("--allow-lossy");
  const child = Bun.spawn(args, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...(options.ffmpegExecutable ? { BUN_VIDEO_FFMPEG: options.ffmpegExecutable } : {}),
    },
  });
  const diagnostics = new Response(child.stderr).text();
  const output = new Response(child.stdout).text();
  const abort = () => child.kill();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for await (const frame of captureParallelFrames(plan, signal)) {
      if (child.exitCode !== null) throw new Error(`Encoder exited early: ${await diagnostics}`);
      child.stdin.write(frame.png);
      await child.stdin.flush();
    }
    await child.stdin.end();
    const code = await child.exited;
    const stderr = await diagnostics;
    await output;
    if (code !== 0) throw new Error(`Encoder failed (${code}): ${stderr}`);
    return {
      output: options.output,
      frames: plan.endFrame - plan.startFrame,
      codec,
      lossless: codec === "ffv1",
    };
  } finally {
    signal?.removeEventListener("abort", abort);
    if (child.exitCode === null) child.kill();
    await child.exited;
  }
}
