import { BrowserRuntime } from "@aphrody/bun-runtime-sdk/browser";
import { captureCompositionFrames } from "./render-frame";
import type { FramePlan } from "./frame-plan";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
let resume: (() => void) | undefined;
let running = false;
scope.onmessage = event => {
  if (event.data?.type === "next") {
    resume?.();
    resume = undefined;
    return;
  }
  if (event.data?.type !== "capture" || running) return;
  running = true;
  void capture(event.data.plan).catch(error => scope.postMessage({ type: "error", message: String(error) }));
};

async function capture(plan: FramePlan & { frameStride?: number }) {
  const operationSignal = () => AbortSignal.timeout(plan.timeoutMs ?? 30000);
  const frameStride = plan.frameStride ?? 1;
  if (!Number.isSafeInteger(frameStride) || frameStride < 1) throw new RangeError("Invalid frame stride");
  using runtime = BrowserRuntime.load({ libraryPath: plan.libraryPath });
  using context = runtime.createContext({
    allowedOrigins: [new URL(plan.compositionUrl).origin],
    allowPrivateNetwork: plan.allowPrivateNetwork,
    width: plan.width,
    height: plan.height,
    timeoutMs: plan.timeoutMs,
  });
  const send = async (frame: number, png: Uint8Array) => {
    const ack = new Promise<void>(resolve => {
      resume = resolve;
    });
    const bytes =
      png.byteOffset === 0 && png.byteLength === png.buffer.byteLength && png.buffer instanceof ArrayBuffer
        ? png.buffer
        : png.slice().buffer;
    scope.postMessage({ type: "frame", frame, png: bytes }, [bytes]);
    await ack;
  };
  const boundedContext = {
    navigate: (url: string) => context.navigate(url, { signal: operationSignal() }),
    evaluate: <T>(expression: string) => context.evaluate<T>(expression, { signal: operationSignal() }),
    screenshot: () => context.screenshot({ signal: operationSignal() }),
  };
  for await (const frame of captureCompositionFrames(boundedContext, { ...plan, frameStride }))
    await send(frame.frame, frame.png);
  scope.postMessage({ type: "done" });
}
