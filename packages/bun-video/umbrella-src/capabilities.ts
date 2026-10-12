import remotion from "../packages/remotion/UPSTREAM.json";
import hyperframes from "../packages/hyperframes/UPSTREAM.json";

export async function capabilities() {
  const { BrowserRuntime } = await import("../../../packages/bun-runtime-sdk/src/browser");
  let nativeBrowser: { providerLoaded: boolean; renderingQualified: false; error?: string };
  try {
    using runtime = BrowserRuntime.load();
    nativeBrowser = { providerLoaded: !runtime.closed, renderingQualified: false };
  } catch (error) {
    nativeBrowser = { providerLoaded: false, renderingQualified: false, error: String(error) };
  }
  return {
    name: "bun-video",
    runtime: {
      version: Bun.version,
      revision: Bun.revision,
      platform: process.platform,
      arch: process.arch,
    },
    upstream: { remotion, hyperframes },
    nativeBrowser,
    backends: {
      remotion: "Complete upstream CLI with its renderer requirements",
      hyperframes: "Complete upstream CLI with its renderer requirements",
      native: "Explicit served-composition PNG capture; requires a qualified browser-enabled provider",
    },
  };
}
