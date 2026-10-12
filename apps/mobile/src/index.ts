import { resolve } from "node:path";
import { startWebOS, type WebOSOptions } from "@aphrody/desktop";

export { APHRODY_DOMAINS, canonicalUrl, domainForHost } from "@aphrody/web";
export type { AphrodyDomain, AphrodySurface } from "@aphrody/web";

export type MobileAphrodyOptions = Omit<WebOSOptions, "hostAccess"> & {
  /** Canonical responsive app-ui distribution. */
  appUiRoot?: string;
};

/** Mobile/public entry: shares the canonical UI and APIs but never grants host access. */
export async function startMobileAphrody(options: MobileAphrodyOptions = {}) {
  const { appUiRoot, ...webos } = options;
  return startWebOS({
    ...webos,
    publicSite: appUiRoot ? { staticRoot: resolve(appUiRoot) } : webos.publicSite,
    hostAccess: false,
  });
}
