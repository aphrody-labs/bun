import { remotion, hyperframes } from "./upstream-provenance";

export async function capabilities() {
  const { BrowserRuntime } = await import("@aphrody/bun-runtime-sdk/browser");
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
      remotion: "Official upstream library; renderer dependencies must be available",
      hyperframes: "Official upstream library; renderer dependencies must be available",
      native:
        "Explicit served-composition PNG capture; requires a qualified browser-enabled provider",
    },
  };
}
