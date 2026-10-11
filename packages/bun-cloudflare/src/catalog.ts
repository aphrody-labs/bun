// Official Cloudflare npm packages bundled by @aphrody/bun-cloudflare, grouped by platform area.
// Keep in sync with package.json "dependencies" (checked by test/cloudflare.test.ts).

export type Category =
  | "tooling"
  | "types"
  | "api"
  | "frameworks"
  | "runtime"
  | "ai"
  | "browser"
  | "realtime"
  | "crypto";

export type CatalogEntry = {
  name: string;
  category: Category;
  product: string;
  docs: string;
  /** Command-line entry points the package installs, run through `bun-cloudflare exec <bin>`. */
  bins?: string[];
};

const dev = "https://developers.cloudflare.com";

export const catalog: CatalogEntry[] = [
  {
    name: "wrangler",
    category: "tooling",
    product: "Wrangler CLI",
    docs: `${dev}/workers/wrangler/`,
    bins: ["wrangler", "wrangler2"],
  },
  {
    name: "miniflare",
    category: "tooling",
    product: "Miniflare local simulator",
    docs: `${dev}/workers/testing/miniflare/`,
  },
  {
    name: "workerd",
    category: "tooling",
    product: "workerd runtime",
    docs: "https://github.com/cloudflare/workerd",
    bins: ["workerd"],
  },
  {
    name: "create-cloudflare",
    category: "tooling",
    product: "C3 project scaffolding",
    docs: `${dev}/pages/get-started/c3/`,
    bins: ["create-cloudflare"],
  },
  { name: "@cloudflare/vite-plugin", category: "tooling", product: "Vite plugin", docs: `${dev}/workers/vite-plugin/` },
  {
    name: "@cloudflare/vitest-plugin",
    category: "tooling",
    product: "Vitest integration",
    docs: `${dev}/workers/testing/vitest-integration/`,
  },
  {
    name: "@cloudflare/config",
    category: "tooling",
    product: "Workers configuration",
    docs: "https://github.com/cloudflare/workers-sdk",
  },
  {
    name: "@cloudflare/autoconfig",
    category: "tooling",
    product: "Framework autoconfig",
    docs: "https://github.com/cloudflare/workers-sdk",
  },
  {
    name: "@cloudflare/codemods",
    category: "tooling",
    product: "Upgrade codemods",
    docs: "https://github.com/cloudflare/workers-sdk",
  },
  {
    name: "@cloudflare/build-output-utils",
    category: "tooling",
    product: "Build Output Specification",
    docs: "https://github.com/cloudflare/workers-sdk",
  },
  {
    name: "@cloudflare/pages-functions",
    category: "tooling",
    product: "Pages Functions compiler",
    docs: `${dev}/pages/functions/`,
  },
  {
    name: "@cloudflare/unenv-preset",
    category: "tooling",
    product: "Node.js compatibility preset",
    docs: `${dev}/workers/runtime-apis/nodejs/`,
  },
  {
    name: "@cloudflare/worker-bundler",
    category: "tooling",
    product: "Runtime Worker bundling",
    docs: `${dev}/dynamic-workers/`,
  },
  {
    name: "@cloudflare/kv-asset-handler",
    category: "tooling",
    product: "KV asset serving",
    docs: "https://github.com/cloudflare/workers-sdk",
  },
  {
    name: "@cloudflare/workers-types",
    category: "types",
    product: "Workers runtime types",
    docs: `${dev}/workers/languages/typescript/`,
  },
  {
    name: "@cloudflare/runtime-types",
    category: "types",
    product: "Runtime type generation",
    docs: `${dev}/workers/languages/typescript/`,
  },
  {
    name: "@cloudflare/types",
    category: "types",
    product: "API data types",
    docs: "https://github.com/cloudflare/cf-ui",
  },
  { name: "cloudflare", category: "api", product: "REST API SDK", docs: `${dev}/api/` },
  { name: "chanfana", category: "api", product: "OpenAPI routing for Workers", docs: "https://chanfana.pages.dev/" },
  {
    name: "@cloudflare/cabidela",
    category: "api",
    product: "JSON Schema validation",
    docs: "https://github.com/cloudflare/cabidela",
  },
  {
    name: "@opennextjs/cloudflare",
    category: "frameworks",
    product: "OpenNext adapter",
    docs: "https://opennext.js.org/cloudflare",
    bins: ["opennextjs-cloudflare"],
  },
  {
    name: "vinext",
    category: "frameworks",
    product: "vinext (Next.js on Vite)",
    docs: `${dev}/workers/framework-guides/web-apps/nextjs/`,
    bins: ["vinext"],
  },
  { name: "@cloudflare/containers", category: "runtime", product: "Containers", docs: `${dev}/containers/` },
  { name: "@cloudflare/sandbox", category: "runtime", product: "Sandbox SDK", docs: `${dev}/sandbox/` },
  {
    name: "@cloudflare/actors",
    category: "runtime",
    product: "Durable Objects actors",
    docs: `${dev}/durable-objects/`,
  },
  {
    name: "@cloudflare/streamline",
    category: "runtime",
    product: "Session primitives",
    docs: "https://github.com/cloudflare/streamline",
  },
  {
    name: "@cloudflare/dynamic-workflows",
    category: "runtime",
    product: "Workflows on Dynamic Workers",
    docs: `${dev}/workflows/`,
  },
  {
    name: "@cloudflare/workers-oauth-provider",
    category: "runtime",
    product: "OAuth provider",
    docs: "https://github.com/cloudflare/workers-oauth-provider",
  },
  { name: "@cloudflare/workers-response-store", category: "runtime", product: "R2 response store", docs: `${dev}/r2/` },
  { name: "@cloudflare/flagship", category: "runtime", product: "Flagship feature flags", docs: `${dev}/flagship/` },
  {
    name: "@cloudflare/computer",
    category: "runtime",
    product: "Virtual filesystem",
    docs: "https://github.com/cloudflare/agents",
  },
  { name: "agents", category: "ai", product: "Agents SDK", docs: `${dev}/agents/` },
  { name: "@cloudflare/ai-chat", category: "ai", product: "Agents chat", docs: `${dev}/agents/` },
  { name: "@cloudflare/think", category: "ai", product: "Chat agent loop", docs: `${dev}/agents/` },
  { name: "@cloudflare/codemode", category: "ai", product: "Code Mode", docs: `${dev}/agents/` },
  { name: "@cloudflare/shell", category: "ai", product: "Sandboxed JS shell", docs: `${dev}/agents/` },
  { name: "@cloudflare/ai-gateway", category: "ai", product: "AI Gateway", docs: `${dev}/ai-gateway/` },
  { name: "@cloudflare/tanstack-ai", category: "ai", product: "TanStack AI provider", docs: `${dev}/workers-ai/` },
  { name: "workers-ai-provider", category: "ai", product: "Workers AI provider (AI SDK)", docs: `${dev}/workers-ai/` },
  {
    name: "@cloudflare/puppeteer",
    category: "browser",
    product: "Browser Run (Puppeteer)",
    docs: `${dev}/browser-rendering/`,
  },
  {
    name: "@cloudflare/playwright",
    category: "browser",
    product: "Browser Run (Playwright)",
    docs: `${dev}/browser-rendering/`,
  },
  {
    name: "@cloudflare/speedtest",
    category: "browser",
    product: "Speed test",
    docs: "https://github.com/cloudflare/speedtest",
  },
  {
    name: "@cloudflare/realtimekit",
    category: "realtime",
    product: "RealtimeKit",
    docs: `${dev}/realtime/realtimekit/`,
  },
  { name: "partyserver", category: "realtime", product: "PartyServer", docs: "https://github.com/cloudflare/partykit" },
  { name: "partysocket", category: "realtime", product: "PartySocket", docs: "https://github.com/cloudflare/partykit" },
  { name: "@cloudflare/privacypass-ts", category: "crypto", product: "Privacy Pass", docs: `${dev}/privacy-pass/` },
  {
    name: "@cloudflare/voprf-ts",
    category: "crypto",
    product: "VOPRF",
    docs: "https://github.com/cloudflare/voprf-ts",
  },
  {
    name: "@cloudflare/blindrsa-ts",
    category: "crypto",
    product: "Blind RSA",
    docs: "https://github.com/cloudflare/blindrsa-ts",
  },
];

export function findPackage(name: string): CatalogEntry | undefined {
  return catalog.find(entry => entry.name === name);
}

/** The installed version of a catalog package, or `null` when it is not resolvable from `from`. */
export function installedVersion(name: string, from: string = import.meta.dir): string | null {
  try {
    const manifest = Bun.resolveSync(`${name}/package.json`, from);
    return require(manifest).version ?? null;
  } catch {
    return null;
  }
}
