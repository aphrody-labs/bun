export type AphrodySurface = "site" | "runtime" | "os" | "api" | "ai" | "static" | "reserved";

export type AphrodyDomain = {
  host: string;
  canonical: string;
  surface: AphrodySurface;
  redirects?: readonly string[];
  routes: readonly string[];
  indexable: boolean;
};

export const APHRODY_DOMAINS = Object.freeze([
  {
    host: "aphrody.com",
    canonical: "https://aphrody.com",
    surface: "site",
    routes: ["/", "/docs/*", "/templates/*", "/material/*", "/api/search"],
    indexable: true,
  },
  {
    host: "www.aphrody.com",
    canonical: "https://aphrody.com",
    surface: "site",
    redirects: ["https://aphrody.com"],
    routes: ["/*"],
    indexable: false,
  },
  // aphrody.app and www.aphrody.app belong to the Bun OS desktop (aphrody-webos); the Bun site lives on bun.*.
  {
    host: "bun.aphrody.app",
    canonical: "https://bun.aphrody.app",
    surface: "runtime",
    routes: ["/", "/runtime/*", "/docs/*", "/downloads/*", "/api/*"],
    indexable: true,
  },
  {
    host: "os.aphrody.com",
    canonical: "https://os.aphrody.com",
    surface: "os",
    routes: ["/", "/desktop/*", "/api/webos/*"],
    indexable: true,
  },
  {
    host: "bun.aphrody.com",
    canonical: "https://bun.aphrody.app",
    surface: "runtime",
    redirects: ["https://bun.aphrody.app"],
    routes: ["/*"],
    indexable: false,
  },
  {
    host: "ai.aphrody.com",
    canonical: "https://aphrody.com/ai",
    surface: "ai",
    redirects: ["https://aphrody.com/ai"],
    routes: ["/", "/v1/*", "/api/*"],
    indexable: false,
  },
  {
    host: "cdn.aphrody.com",
    canonical: "https://cdn.aphrody.com",
    surface: "static",
    routes: ["/assets/*", "/fonts/*", "/robots.txt"],
    indexable: false,
  },
  {
    host: "downloads.aphrody.com",
    canonical: "https://downloads.aphrody.com",
    surface: "static",
    routes: ["/*"],
    indexable: false,
  },
  {
    host: "mcp.aphrody.com",
    canonical: "https://aphrody.com/mcp",
    surface: "reserved",
    redirects: ["https://aphrody.com/mcp"],
    routes: ["/*"],
    indexable: false,
  },
] satisfies readonly AphrodyDomain[]);

export function domainForHost(host: string): AphrodyDomain | undefined {
  return APHRODY_DOMAINS.find(domain => domain.host === host.toLowerCase().replace(/:\d+$/, ""));
}

export function canonicalUrl(host: string, path = "/"): string | undefined {
  const domain = domainForHost(host);
  if (!domain) return undefined;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${domain.canonical.replace(/\/$/, "")}${normalized === "/" ? "" : normalized}`;
}
