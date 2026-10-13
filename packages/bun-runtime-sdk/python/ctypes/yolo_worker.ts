// SPDX-License-Identifier: Apache-2.0
/** Private stdio adapter. All question, answer and primitive validation belongs to bun:yolo. */
const PROTOCOL = "bun.yolo/1";
const MAX_BYTES = 1024 * 1024;
type YoloAPI = Pick<
  typeof import("bun:yolo"),
  "inspect" | "decide" | "value" | "jev" | "code" | "confidenceThreshold" | "selections"
>;
type Envelope = {
  protocol: typeof PROTOCOL;
  operation: "inspect" | "decide" | "value";
  request?: import("bun:yolo").Request;
  answer?: import("bun:yolo").AnswerFor<import("bun:yolo").Question>;
  question?: import("bun:yolo").Question;
  options?: Pick<import("bun:yolo").Options, "timeout" | "maxRetries" | "threshold">;
  minimumConfidence?: number;
  provider?: { kind: "jev"; baseURL?: string; model?: string } | { kind: "code"; response: unknown };
};

export async function applyYoloEnvelope(input: unknown, api?: YoloAPI) {
  const envelope = input as Envelope;
  if (!envelope || envelope.protocol !== PROTOCOL || !["inspect", "decide", "value"].includes(envelope.operation))
    throw new Error("Invalid Yolo bridge operation");
  const owner: YoloAPI = api ?? (await import("bun:yolo"));
  const minimumConfidence =
    envelope.minimumConfidence === undefined ? undefined : owner.confidenceThreshold(envelope.minimumConfidence);
  if (minimumConfidence !== undefined && envelope.operation !== "inspect")
    throw new Error("Choice selections require an inspected result");
  if (envelope.operation === "value")
    return owner.value(envelope.answer!, envelope.question!, envelope.options?.threshold);
  const options: import("bun:yolo").Options = envelope.options ?? {};
  if (envelope.provider) {
    if (envelope.provider.kind === "jev")
      options.provider = owner.jev({ baseURL: envelope.provider.baseURL, model: envelope.provider.model });
    else if (envelope.provider.kind === "code") {
      const response = envelope.provider.response;
      options.provider = owner.code(() => response);
    } else throw new Error("Unknown Yolo bridge provider");
  }
  if (envelope.operation === "inspect" && minimumConfidence !== undefined) {
    const result = await owner.inspect(envelope.request!, options);
    return { ...result, selections: owner.selections(envelope.request!, result, minimumConfidence) };
  }
  return owner[envelope.operation](envelope.request!, options);
}

export async function readYoloEnvelope(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) throw new Error("Yolo bridge input exceeds its byte budget");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export function yoloErrorEnvelope(error: unknown) {
  const value = error as { name?: unknown; code?: unknown };
  return {
    protocol: PROTOCOL,
    ok: false,
    error: {
      name: typeof value?.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value.name) ? value.name : "Error",
      code:
        typeof value?.code === "string" && /^ERR_[A-Z0-9_]{1,96}$/.test(value.code) ? value.code : "ERR_YOLO_BRIDGE",
    },
  };
}

if (import.meta.main) {
  // Also bounds startup/partial stdin; the supervisor owns process-group cancellation.
  const timer = setTimeout(() => process.exit(2), 125000);
  try {
    const request = await readYoloEnvelope(Bun.stdin.stream());
    const result = await applyYoloEnvelope(request);
    const output = JSON.stringify({
      protocol: PROTOCOL,
      ok: true,
      result,
      runtime: { version: Bun.version, revision: Bun.revision },
    });
    if (Buffer.byteLength(output + "\n", "utf8") > MAX_BYTES)
      throw new Error("Yolo bridge output exceeds its byte budget");
    await Bun.write(Bun.stdout, output + "\n");
  } catch (error) {
    await Bun.write(Bun.stdout, JSON.stringify(yoloErrorEnvelope(error)) + "\n");
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}
