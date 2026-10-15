#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0

const exportPaths = [
  "",
  "/mcp",
  "/capabilities",
  "/hls",
  "/dash",
  "/mpd",
  "/har",
  "/bitmovin",
  "/crunchyroll",
  "/oauth",
  "/secrets",
];
const labs = ["hls", "dash", "har", "keychain", "crunchyroll", "shortcuts"];

export async function probeBunVideoConsumer(
  project: string,
  expectedVersion?: string,
  pins?: { commit: string; sha256: string },
) {
  if (pins && (!/^[a-f0-9]{40}$/.test(pins.commit) || !/^[a-f0-9]{64}$/.test(pins.sha256)))
    throw new Error("Consumer pins must be a full commit and SHA-256 digest.");
  if (!/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(project)) throw new Error("Consumer project path must be absolute.");
  const packageRoot = `${project}/node_modules/@aphrody/bun-video`;
  const manifest = await Bun.file(`${packageRoot}/package.json`).json();
  if (manifest.name !== "@aphrody/bun-video" || (expectedVersion && manifest.version !== expectedVersion))
    throw new Error("Installed package identity or version differs from the pinned consumer plan.");
  const modules: Record<string, Record<string, unknown>> = {};
  for (const path of exportPaths) {
    const name = `@aphrody/bun-video${path}`;
    try {
      modules[path] = (await import(Bun.resolveSync(name, project))) as Record<string, unknown>;
    } catch {
      throw new Error(`Consumer export import failed: ${name}.`);
    }
  }
  const interpolate = modules[""]?.interpolate;
  if (typeof interpolate !== "function" || interpolate(5, [0, 10], [0, 100]) !== 50)
    throw new Error("Root interpolation consumer gate failed.");
  const lazyImports: string[] = [];
  for (const name of ["loadRemotionCore", "loadHyperframesCore", "loadHyperframesEngine"]) {
    const loader = modules[""]?.[name];
    if (typeof loader !== "function") throw new Error(`Missing consumer lazy loader: ${name}.`);
    try {
      const loaded = await loader();
      if (!loaded || Object.keys(loaded).length === 0) throw new Error("Empty module");
    } catch {
      throw new Error(`Consumer lazy import failed: ${name}.`);
    }
    lazyImports.push(name);
  }
  let rendererQualified = false;
  let rendererErrorClassification: string | null = null;
  const rendererLoader = modules[""]?.loadRemotionRenderer;
  if (typeof rendererLoader !== "function") throw new Error("Missing renderer lazy loader.");
  try {
    const renderer = await rendererLoader();
    if (typeof renderer.renderMedia !== "function") throw new Error("Missing renderer export");
    rendererQualified = true;
  } catch (error) {
    const remotion = await import(Bun.resolveSync("remotion/no-react", packageRoot));
    const minimum = remotion.NoReactInternals.MIN_BUN_VERSION;
    const expected = `Remotion requires at least Bun ${minimum}. You currently have ${Bun.version}. Update your Bun version to ${minimum} to use Remotion.`;
    if (
      typeof minimum !== "string" ||
      !(error instanceof Error) ||
      error.message !== expected ||
      !Bun.version.includes("-") ||
      Bun.semver.satisfies(Bun.version, `>=${minimum}`) ||
      !Bun.semver.satisfies(Bun.version.split("-")[0]!, `>=${minimum}`)
    )
      throw new Error("Consumer renderer import failed outside the known upstream prerelease gate.");
    rendererErrorClassification = "upstream-bun-prerelease-version-gate";
  }
  const cli: Array<{ lab: string; stdoutBytes: number; stderrBytes: number }> = [];
  for (const lab of labs) {
    const child = Bun.spawn([process.execPath, `${packageRoot}/umbrella-src/cli.ts`, lab, "--help"], {
      cwd: project,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const timeout = setTimeout(() => child.kill(), 30_000);
    try {
      const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
      if (exitCode !== 0 || !stdout.trim()) throw new Error(`Consumer CLI help gate failed: ${lab}.`);
      cli.push({
        lab,
        stdoutBytes: new TextEncoder().encode(stdout).byteLength,
        stderrBytes: new TextEncoder().encode(stderr).byteLength,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  const check = Bun.spawn([process.execPath, `${packageRoot}/src/apps/hls-live.ts`, "--check"], {
    cwd: project,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const checkTimeout = setTimeout(() => check.kill(), 30_000);
  try {
    const [stdout, , exitCode] = await Promise.all([check.stdout.text(), check.stderr.text(), check.exited]);
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      throw new Error("Consumer HLS check returned invalid qualification data.");
    }
    if (exitCode !== 0 || result.syntheticGates !== "PASS" || result.realPlaybackQualified !== false)
      throw new Error("Consumer HLS synthetic check gate failed.");
  } finally {
    clearTimeout(checkTimeout);
  }
  const shortcuts = (await import(`${packageRoot}/src/apps/crunchyroll-shortcuts.ts`)) as {
    startCrunchyrollShortcuts(options: {
      port: number;
    }): Promise<{ url: URL; stop(closeActiveConnections?: boolean): void }>;
  };
  const server = await shortcuts.startCrunchyrollShortcuts({ port: 0 });
  try {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(server.url.hostname))
      throw new Error("Consumer shortcut server did not bind to loopback.");
    const response = await fetch(new URL("/health", server.url), {
      signal: AbortSignal.timeout(10_000),
    });
    const health = await response.json();
    if (response.status !== 200 || health.service !== "bun-crunchyroll-shortcuts")
      throw new Error("Consumer loopback health gate failed.");
    const assetRoutes = [
      "/health",
      "/pwa/",
      "/pwa/manifest.webmanifest",
      "/pwa/icons/icon192.png",
      "/extension/manifest.json",
      "/extension/_locales/ar/messages.json",
    ];
    for (const route of assetRoutes.slice(1)) {
      const asset = await fetch(new URL(route, server.url), {
        signal: AbortSignal.timeout(10_000),
      });
      if (asset.status !== 200) throw new Error(`Consumer asset gate failed: ${route}.`);
      if (route.endsWith("icon192.png")) {
        const bytes = new Uint8Array(await asset.arrayBuffer());
        const view = new DataView(bytes.buffer);
        if (
          bytes.length < 24 ||
          bytes[0] !== 137 ||
          String.fromCharCode(...bytes.slice(1, 4)) !== "PNG" ||
          view.getUint32(16) !== 192 ||
          view.getUint32(20) !== 192
        )
          throw new Error("Consumer install icon gate failed.");
      } else if (route.endsWith("manifest.webmanifest")) {
        const data = await asset.json();
        if (data.start_url !== "/pwa/" || !data.icons?.some((icon: { sizes: string }) => icon.sizes === "192x192"))
          throw new Error("Consumer PWA manifest gate failed.");
      } else if (route.endsWith("manifest.json")) {
        const data = await asset.json();
        if (data.manifest_version !== 3 || data.permissions?.length || data.host_permissions?.length)
          throw new Error("Consumer extension permission gate failed.");
      } else if (route.endsWith("messages.json")) {
        const data = await asset.json();
        if (
          !Object.keys(data).length ||
          Object.values(data).some(
            value =>
              !value ||
              typeof (value as { message?: unknown }).message !== "string" ||
              !(value as { message: string }).message.trim(),
          )
        )
          throw new Error("Consumer Arabic catalog gate failed.");
      } else if (!(await asset.text()).includes("<!doctype html>")) {
        throw new Error("Consumer PWA shell gate failed.");
      }
    }
    return {
      package: manifest.name,
      version: manifest.version,
      bunVersion: Bun.version,
      bunRevision: Bun.revision,
      importedExports: exportPaths.map(path => `@aphrody/bun-video${path}`),
      interpolation: 50,
      capabilityFunctions: Object.entries(modules["/capabilities"]!)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name)
        .sort(),
      pins: pins ?? null,
      lazyImports,
      rendererQualified,
      rendererErrorClassification,
      cli,
      hlsSyntheticCheckValidated: true,
      assetRoutes,
      loopbackHealthValidated: true,
      persistentServiceInstalled: false,
      browserPlaybackValidated: false,
      drmValidated: false,
    };
  } finally {
    server.stop(true);
  }
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const index = args.indexOf("--project");
  if (args.includes("--help") || index < 0)
    console.log(
      "bun bun-video-vps.ts --project <absolute-installed-consumer-directory> --version <pinned-version> --commit <full-source-commit> --sha256 <artifact-digest>\nRead-only installed-package qualification with an ephemeral loopback server; no installation, publication or persistent service. Artifact digest must be verified before installation; these pins identify the receipt.",
    );
  else {
    const option = (name: string) => {
      const at = args.indexOf(name);
      const value = at < 0 ? undefined : args[at + 1];
      if (!value || value.startsWith("--") || args.lastIndexOf(name) !== at)
        throw new Error(`Missing or repeated consumer option: ${name}.`);
      return value;
    };
    const result = await probeBunVideoConsumer(option("--project"), option("--version"), {
      commit: option("--commit"),
      sha256: option("--sha256"),
    });
    console.log(JSON.stringify(result, null, 2));
  }
}
