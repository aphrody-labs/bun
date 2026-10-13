export interface PixelComparison {
  width: number;
  height: number;
  differingPixels: number;
  differingPixelRatio: number;
  meanAbsoluteChannelError: number;
  maxChannelError: number;
  exact: boolean;
  passed: boolean;
}
export interface PixelLimits {
  width: number;
  height: number;
  channelTolerance?: number;
  maxDifferingPixelRatio?: number;
}

/** Compare decoded RGBA, never encoded PNG bytes or thumbnail approximations. */
export function compareRGBAFrames(reference: Uint8Array, candidate: Uint8Array, options: PixelLimits): PixelComparison {
  const { width, height } = options;
  const tolerance = options.channelTolerance ?? 0,
    ratio = options.maxDifferingPixelRatio ?? 0;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 7680 * 4320
  )
    throw new RangeError("Invalid bounded pixel dimensions");
  if (
    !Number.isSafeInteger(tolerance) ||
    tolerance < 0 ||
    tolerance > 255 ||
    !Number.isFinite(ratio) ||
    ratio < 0 ||
    ratio > 1
  )
    throw new RangeError("Invalid explicit pixel comparison tolerance");
  if (reference.byteLength !== width * height * 4 || candidate.byteLength !== reference.byteLength)
    throw new RangeError("RGBA byte lengths must match the exact reference dimensions");
  let differingPixels = 0,
    sum = 0,
    maxChannelError = 0;
  for (let pixel = 0; pixel < reference.length; pixel += 4) {
    let differs = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(reference[pixel + channel]! - candidate[pixel + channel]!);
      sum += delta;
      maxChannelError = Math.max(maxChannelError, delta);
      if (delta > tolerance) differs = true;
    }
    if (differs) differingPixels++;
  }
  const differingPixelRatio = differingPixels / (width * height);
  return {
    width,
    height,
    differingPixels,
    differingPixelRatio,
    meanAbsoluteChannelError: sum / reference.length,
    maxChannelError,
    exact: maxChannelError === 0,
    passed: differingPixelRatio <= ratio,
  };
}

async function decodeFrame(
  path: string,
  options: PixelLimits & {
    ffmpegExecutable: string;
    ffprobeExecutable: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<Uint8Array> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 30000)])
    : AbortSignal.timeout(options.timeoutMs ?? 30000);
  signal.throwIfAborted();
  const probe = Bun.spawn(
    [
      options.ffprobeExecutable,
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      path,
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const abortProbe = () => probe.kill();
  signal.addEventListener("abort", abortProbe, { once: true });
  try {
    const [text, error, code] = await Promise.all([probe.stdout.text(), probe.stderr.text(), probe.exited]);
    signal.throwIfAborted();
    if (code !== 0) throw new Error(`Frame probe failed (${code}): ${error}`);
    const stream = JSON.parse(text).streams?.[0];
    if (stream?.width !== options.width || stream?.height !== options.height)
      throw new Error("Frame dimensions differ from the reference; resizing is not a pixel comparison");
  } finally {
    signal.removeEventListener("abort", abortProbe);
    if (probe.exitCode === null) probe.kill();
    await probe.exited;
  }
  const child = Bun.spawn(
    [
      options.ffmpegExecutable,
      "-v",
      "error",
      "-i",
      path,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const abort = () => child.kill();
  signal.addEventListener("abort", abort, { once: true });
  const diagnostics = child.stderr.text();
  const bytes = new Uint8Array(options.width * options.height * 4);
  let offset = 0;
  try {
    for await (const chunk of child.stdout) {
      signal.throwIfAborted();
      if (offset + chunk.length > bytes.length) throw new Error("Decoded frame exceeds declared RGBA bounds");
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const code = await child.exited;
    const error = await diagnostics;
    signal.throwIfAborted();
    if (code !== 0 || offset !== bytes.length) throw new Error(`RGBA frame decode failed (${code}): ${error}`);
    return bytes;
  } finally {
    signal.removeEventListener("abort", abort);
    if (child.exitCode === null) child.kill();
    await child.exited;
    await diagnostics;
  }
}

export async function verifyPixelFrames(
  input: PixelLimits & {
    frames: readonly { frame: number; reference: string; candidate: string }[];
    ffmpegExecutable: string;
    ffprobeExecutable: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
) {
  if (!input.frames.length || input.frames.length > 1000)
    throw new RangeError("Compare 1..1000 selected reference frames");
  // Validate bounds before any decoder allocation.
  compareRGBAFrames(new Uint8Array(4), new Uint8Array(4), {
    width: 1,
    height: 1,
    channelTolerance: input.channelTolerance,
    maxDifferingPixelRatio: input.maxDifferingPixelRatio,
  });
  if (
    !Number.isSafeInteger(input.width) ||
    !Number.isSafeInteger(input.height) ||
    input.width < 1 ||
    input.height < 1 ||
    input.width * input.height > 7680 * 4320
  )
    throw new RangeError("Invalid bounded pixel dimensions");
  const results: { frame: number; comparison: PixelComparison }[] = [];
  const seen = new Set<number>();
  for (const frame of input.frames) {
    if (!Number.isSafeInteger(frame.frame) || frame.frame < 0 || seen.has(frame.frame))
      throw new RangeError("Reference frames must be unique nonnegative integers");
    seen.add(frame.frame);
    const reference = await decodeFrame(frame.reference, input),
      candidate = await decodeFrame(frame.candidate, input);
    results.push({ frame: frame.frame, comparison: compareRGBAFrames(reference, candidate, input) });
  }
  return {
    passed: results.every(result => result.comparison.passed),
    exact: results.every(result => result.comparison.exact),
    scope: "selected-reference-frames" as const,
    frames: results,
  };
}
