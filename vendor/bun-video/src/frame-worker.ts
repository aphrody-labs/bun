import { BrowserRuntime } from "../../../packages/bun-runtime-sdk/src/browser";
import { captureNativeWebViewFrames } from "../hyperframes/packages/engine/src/services/nativeWebViewCapture";
import type { FramePlan } from "./frame-plan";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
let resume: (() => void) | undefined;
let running = false;
scope.onmessage = (event) => {
  if (event.data?.type === "next") {
    resume?.();
    resume = undefined;
    return;
  }
  if (event.data?.type !== "capture" || running) return;
  running = true;
  void capture(event.data.plan).catch((error) =>
    scope.postMessage({ type: "error", message: String(error) }),
  );
};

async function capture(plan: FramePlan & { frameStride?: number }) {
  const operationSignal = () => AbortSignal.timeout(plan.timeoutMs ?? 30000);
  const frameStride = plan.frameStride ?? 1;
  if (!Number.isSafeInteger(frameStride) || frameStride < 1)
    throw new RangeError("Invalid frame stride");
  using runtime = BrowserRuntime.load({ libraryPath: plan.libraryPath });
  using context = runtime.createContext({
    allowedOrigins: [new URL(plan.compositionUrl).origin],
    allowPrivateNetwork: plan.allowPrivateNetwork,
    width: plan.width,
    height: plan.height,
    timeoutMs: plan.timeoutMs,
  });
  const send = async (frame: number, png: Uint8Array) => {
    const ack = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const bytes =
      png.byteOffset === 0 &&
      png.byteLength === png.buffer.byteLength &&
      png.buffer instanceof ArrayBuffer
        ? png.buffer
        : png.slice().buffer;
    scope.postMessage({ type: "frame", frame, png: bytes }, [bytes]);
    await ack;
  };
  if (plan.kind === "hyperframes") {
    const boundedContext = {
      navigate: (url: string) => context.navigate(url, { signal: operationSignal() }),
      evaluate: <T>(expression: string) =>
        context.evaluate<T>(expression, { signal: operationSignal() }),
      screenshot: () => context.screenshot({ signal: operationSignal() }),
    };
    for await (const frame of captureNativeWebViewFrames(boundedContext, {
      url: plan.compositionUrl,
      fps: plan.fps,
      startFrame: plan.startFrame,
      endFrame: plan.endFrame,
      frameStride,
    }))
      await send(frame.frame, frame.png);
  } else {
    await context.navigate(plan.compositionUrl, { signal: operationSignal() });
    const contract = await context.evaluate(
      'typeof window.remotion_setFrame === "function" && typeof window.remotion_renderReady === "boolean"',
      { signal: operationSignal() },
    );
    if (!contract)
      throw new Error("Served React composition lacks initialized Remotion render globals");
    for (let frame = plan.startFrame; frame < plan.endFrame; frame += frameStride) {
      const signal = operationSignal();
      await context.evaluate(
        `window.remotion_setFrame(${frame}, ${JSON.stringify(plan.composition)}, 0)`,
        { signal },
      );
      for (;;) {
        const state = await context.evaluate<{ ready: boolean; error: string | null }>(
          "({ready: window.remotion_renderReady === true, error: window.remotion_cancelledError ?? null})",
          { signal },
        );
        if (state.error !== null) throw new Error(state.error);
        if (state.ready) break;
        signal.throwIfAborted();
        await Bun.sleep(10);
      }
      await context.evaluate("document.fonts.ready.then(() => true)", { signal });
      await send(frame, await context.screenshot({ signal }));
    }
  }
  scope.postMessage({ type: "done" });
}
