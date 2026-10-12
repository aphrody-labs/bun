import { captureNativeWebViewFrames, type NativeWebViewContext } from "./hyperframes-native";
import type { FramePlan } from "./frame-plan";

export async function* captureCompositionFrames(
  context: NativeWebViewContext,
  plan: FramePlan & { frameStride?: number },
): AsyncGenerator<{ frame: number; png: Uint8Array }> {
  const stride = plan.frameStride ?? 1;
  if (plan.kind === "hyperframes") {
    yield* captureNativeWebViewFrames(context, {
      url: plan.compositionUrl,
      fps: plan.fps,
      startFrame: plan.startFrame,
      endFrame: plan.endFrame,
      frameStride: stride,
    });
    return;
  }
  await context.navigate(plan.compositionUrl);
  for (let frame = plan.startFrame; frame < plan.endFrame; frame += stride) {
    await context.evaluate(`window.remotion_setFrame(${frame}, ${JSON.stringify(plan.composition)}, 0)`);
    for (;;) {
      const state = await context.evaluate<{ ready: boolean; error: string | null }>(
        "({ready: window.remotion_renderReady === true, error: window.remotion_cancelledError ?? null})",
      );
      if (state.error !== null) throw new Error(state.error);
      if (state.ready) break;
      await Bun.sleep(10);
    }
    await context.evaluate("document.fonts.ready.then(() => true)");
    yield { frame, png: await context.screenshot() };
  }
}
