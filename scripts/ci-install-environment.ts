export function setupInstallEnvironment(
  environment: Record<string, string | undefined> = {},
  persistentCache?: string,
): Record<string, string | undefined> {
  return {
    // Browser fixtures own their per-run downloads, not the setup installs.
    PUPPETEER_SKIP_DOWNLOAD: "1",
    ...environment,
    // spawnBun deletes its temporary cache after this call, including store entries.
    ...(persistentCache ? { BUN_INSTALL_CACHE_DIR: persistentCache } : { BUN_INSTALL_GLOBAL_STORE: "0" }),
  };
}
