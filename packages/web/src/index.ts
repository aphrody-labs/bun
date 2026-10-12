import { resolve } from "node:path";
import { startWebOS, type WebOSOptions, type ExplorerOptions } from "@aphrody/bun-webos";

export { APHRODY_DOMAINS, canonicalUrl, domainForHost } from "./domains.ts";
export type { AphrodyDomain, AphrodySurface } from "./domains.ts";
export type { ExplorerOptions, WebOSOptions };

export type AphrodyWebOptions = WebOSOptions & {
  appUiRoot?: string;
};

/** Canonical Bun composition for the public UI, WebOS and AI-capable APIs. */
export async function startAphrodyWeb(options: AphrodyWebOptions = {}) {
  const { appUiRoot, ...webos } = options;
  return startWebOS({
    ...webos,
    publicSite: appUiRoot ? { staticRoot: resolve(appUiRoot) } : webos.publicSite,
  });
}
