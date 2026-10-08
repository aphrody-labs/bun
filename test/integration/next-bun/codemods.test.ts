// Codemods of @aphrody/next-bun (packages/bun-next/codemods): Next 14/15 -> 16, Tailwind 3 -> 4, Pages Router hints.
import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  appTarget,
  awaitRequestApis,
  awaitRouteProps,
  classListV3ToV4,
  CODEMODS,
  featureNotes,
  legacyImage,
  middlewareToProxy,
  nextConfigTo16,
  packageJsonTo16,
  pagesHints,
  postcssConfigV4,
  revalidateTagProfile,
  runCodemods,
  selectCodemods,
  tailwindClassesV4,
  tailwindConfigToCss,
  tailwindCssV4,
  tailwindPackageJsonV4,
} from "../../../packages/bun-next/codemods/index.ts";
import { runCodemodCli } from "../../../packages/bun-next/codemods/cli.ts";
import { unchanged } from "../../../packages/bun-next/codemods/types.ts";
import { matching, properties, skippedSpans } from "../../../packages/bun-next/codemods/lex.ts";

describe("lex", () => {
  test("brackets match outside strings, comments and templates", () => {
    const src = 'const a = { b: "}", c: `${ {x: 1}.x }`, // }\n d: [1, {e: 2}] };';
    expect(matching(src, src.indexOf("{"))).toBe(src.lastIndexOf("}"));
  });

  test("properties: identifier, quoted and shorthand keys, nested values, comments", () => {
    const src = `{ a: 1, "b-c": { d: 2 }, e, /* x */ f: [1, 2], g: fn(1, 2) }`;
    const props = properties(src, 0);
    expect(props.map(p => p.key)).toEqual(["a", "b-c", "e", "f", "g"]);
    expect(props.map(p => p.value)).toEqual(["1", "{ d: 2 }", "e", "[1, 2]", "fn(1, 2)"]);
  });

  test("properties: type literals separated by semicolons", () => {
    const props = properties("{ params: { id: string }; searchParams: { q?: string } }", 0);
    expect(props.map(p => p.key)).toEqual(["params", "searchParams"]);
    expect(props[0]!.value).toBe("{ id: string }");
  });

  test("skippedSpans finds a template with a nested template", () => {
    const src = "a `x ${`y`} z` b";
    expect(skippedSpans(src)).toEqual([{ start: 2, end: 14 }]);
  });
});

describe("next-config", () => {
  test("experimental flags move to the top level; ppr becomes cacheComponents", () => {
    const src = `const nextConfig = {
  reactStrictMode: true,
  experimental: {
    dynamicIO: true,
    turbo: { rules: { "*.svg": { loaders: ["@svgr/webpack"] } } },
    typedRoutes: true,
    serverComponentsExternalPackages: ["sharp"],
    staleTimes: { dynamic: 30 },
  },
};
export default nextConfig;
`;
    const out = nextConfigTo16(src);
    expect(out.code).toContain("  cacheComponents: true,");
    expect(out.code).toContain('  turbopack: { rules: { "*.svg": { loaders: ["@svgr/webpack"] } } },');
    expect(out.code).toContain("  typedRoutes: true,");
    expect(out.code).toContain('  serverExternalPackages: ["sharp"],');
    expect(out.code).toMatch(/experimental: \{\s*staleTimes: \{ dynamic: 30 \},\s*\}/);
    expect(out.code).not.toContain("dynamicIO");
    expect(out.code).not.toContain("experimental: {\n    turbo");
    expect(out.changes).toContain("moved experimental.dynamicIO to cacheComponents");
  });

  test("an emptied experimental block is removed", () => {
    const out = nextConfigTo16(`module.exports = {\n  experimental: {\n    ppr: true,\n  },\n};\n`);
    expect(out.code).toBe("module.exports = {\n  cacheComponents: true,\n};\n");
    expect(out.warnings[0]).toContain("experimental_ppr");
  });

  test("ppr: false and instrumentationHook just go", () => {
    const out = nextConfigTo16(`export default { experimental: { ppr: false, instrumentationHook: true, other: 1 } };`);
    expect(out.code).toContain("other: 1");
    expect(out.code).not.toContain("ppr");
    expect(out.code).not.toContain("instrumentationHook");
    expect(out.code).not.toContain("cacheComponents");
  });

  test("an existing top-level key wins and the experimental one is dropped with a warning", () => {
    const out = nextConfigTo16(`export default { typedRoutes: false, experimental: { typedRoutes: true } };`);
    expect(out.code.match(/typedRoutes/g)).toHaveLength(1);
    expect(out.warnings[0]).toContain("already set");
  });

  test("eslint, skipMiddlewareUrlNormalize and images.domains", () => {
    const src = `export default {
  eslint: { ignoreDuringBuilds: true },
  skipMiddlewareUrlNormalize: true,
  images: {
    domains: ["cdn.example.com", "img.example.org"],
  },
};
`;
    const out = nextConfigTo16(src);
    expect(out.code).not.toContain("eslint");
    expect(out.code).toContain("skipProxyUrlNormalize: true");
    expect(out.code).toContain('{ protocol: "https", hostname: "cdn.example.com" }');
    expect(out.code).toContain('{ protocol: "https", hostname: "img.example.org" }');
    expect(out.code).not.toContain("domains");
  });

  test("nothing to do is a no-op; removed runtime config warns", () => {
    const clean = "export default { reactStrictMode: true };\n";
    expect(nextConfigTo16(clean)).toEqual({ code: clean, changes: [], warnings: [] });
    expect(nextConfigTo16("export default { serverRuntimeConfig: { a: 1 } };").warnings[0]).toContain(
      "serverRuntimeConfig",
    );
  });

  test("the result is still balanced, parseable JavaScript", () => {
    const out = nextConfigTo16(
      `export default { experimental: { dynamicIO: true, turbo: { resolveAlias: { a: "b" } } }, images: { domains: ["x.com"] } };`,
    );
    expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(out.code)).not.toThrow();
  });
});

describe("middleware-to-proxy", () => {
  test("renames the file, the function and drops the edge runtime", () => {
    const src = `import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
`;
    const out = middlewareToProxy(src, "middleware.ts");
    expect(out.rename).toBe("proxy.ts");
    expect(out.code).toContain("export function proxy(request: NextRequest)");
    expect(out.code).not.toContain("runtime");
    expect(out.code).toContain('matcher: ["/dashboard/:path*"]');
  });

  test("default export, const export and export lists", () => {
    expect(middlewareToProxy("export default function middleware(r) {}", "src/middleware.js").code).toBe(
      "export default function proxy(r) {}",
    );
    expect(middlewareToProxy("export const middleware = (r) => r;", "middleware.ts").code).toBe(
      "export const proxy = (r) => r;",
    );
    expect(middlewareToProxy("function middleware(r) {}\nexport { middleware };", "middleware.ts").code).toBe(
      "function proxy(r) {}\nexport { proxy };",
    );
    expect(middlewareToProxy("export default middleware;", "middleware.ts").code).toBe("export default proxy;");
  });

  test("NextFetchEvent is flagged", () => {
    expect(
      middlewareToProxy("export function middleware(r, e: NextFetchEvent) { e.waitUntil(x) }", "middleware.ts")
        .warnings[0],
    ).toContain("after()");
  });
});

describe("async-request-apis", () => {
  test("cookies(), headers() and draftMode() are awaited and the function becomes async", () => {
    const src = `import { cookies, headers } from "next/headers";

export default function Page() {
  const jar = cookies();
  const theme = cookies().get("m3-theme")?.value;
  const ua = headers().get("user-agent");
  return <p>{theme}{ua}</p>;
}
`;
    const out = awaitRequestApis(src);
    expect(out.code).toContain("export default async function Page()");
    expect(out.code).toContain("const jar = await cookies();");
    expect(out.code).toContain('(await cookies()).get("m3-theme")?.value');
    expect(out.code).toContain('(await headers()).get("user-agent")');
    expect(() => new Bun.Transpiler({ loader: "tsx" }).transformSync(out.code)).not.toThrow();
  });

  test("an already awaited call and an async function are left alone", () => {
    const src = `import { cookies } from "next/headers";
export async function GET() {
  const jar = await cookies();
  return Response.json(jar.getAll());
}
`;
    expect(awaitRequestApis(src).code).toBe(src);
  });

  test("arrow functions assigned at module level, and nested callbacks warn", () => {
    const out = awaitRequestApis(`import { cookies } from "next/headers";
export const getTheme = () => {
  return cookies().get("t");
};
export function list() {
  return [1].map(() => cookies().get("x"));
}
`);
    expect(out.code).toContain("export const getTheme = async () => {");
    expect(out.code).toContain('return (await cookies()).get("t");');
    expect(out.warnings.some(w => w.includes("nested callback"))).toBe(true);
    expect(out.code).toContain('map(() => cookies().get("x"))');
  });

  test("a file that does not import from next/headers is untouched; strings and comments are skipped", () => {
    const own = "function cookies() {}\ncookies();\n";
    expect(awaitRequestApis(own).code).toBe(own);
    const src = `import { cookies } from "next/headers";\n// cookies()\nexport async function f() { return "cookies()"; }\n`;
    expect(awaitRequestApis(src).code).toBe(src);
  });
});

describe("async-route-props", () => {
  test("destructured params with a type: the type becomes a Promise and uses are awaited", () => {
    const src = `export default function Page({ params }: { params: { id: string } }) {
  return <h1>{params.id}</h1>;
}
`;
    const out = awaitRouteProps(src, "app/posts/[id]/page.tsx");
    expect(out.code).toContain("export default async function Page({ params }: { params: Promise<{ id: string }> })");
    expect(out.code).toContain("{(await params).id}");
    expect(() => new Bun.Transpiler({ loader: "tsx" }).transformSync(out.code)).not.toThrow();
  });

  test("nested destructuring moves into the body; searchParams too", () => {
    const src = `export default function Page({ params: { slug }, searchParams }: { params: { slug: string }; searchParams: { q?: string } }) {
  return <p>{slug}{searchParams.q}</p>;
}
`;
    const out = awaitRouteProps(src, "app/[slug]/page.tsx");
    expect(out.code).toContain(
      "async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> })",
    );
    expect(out.code).toContain("const { slug } = await params;");
    expect(out.code).toContain("(await searchParams).q");
    expect(() => new Bun.Transpiler({ loader: "tsx" }).transformSync(out.code)).not.toThrow();
  });

  test("a props identifier", () => {
    const src = `export async function generateMetadata(props: { params: { id: string } }) {
  return { title: props.params.id };
}
`;
    const out = awaitRouteProps(src, "app/p/[id]/page.tsx");
    expect(out.code).toContain("props: { params: Promise<{ id: string }> }");
    expect(out.code).toContain("title: (await props.params).id");
  });

  test("route handlers take params in the second argument", () => {
    const src = `export function GET(request: Request, { params }: { params: { id: string } }) {
  return Response.json({ id: params.id });
}
`;
    const out = awaitRouteProps(src, "app/api/x/[id]/route.ts");
    expect(out.code).toContain("export async function GET(");
    expect(out.code).toContain("params: Promise<{ id: string }>");
    expect(out.code).toContain("id: (await params).id");
  });

  test("a named props type warns; non-route files are untouched", () => {
    const named = `export default function Page({ params }: PageProps) { return <p>{params.id}</p>; }`;
    expect(awaitRouteProps(named, "app/page.tsx").warnings[0]).toContain("named type");
    const other = `export function util({ params }: { params: { id: string } }) { return params.id; }`;
    expect(awaitRouteProps(other, "lib/util.ts").code).toBe(other);
  });
});

describe("revalidate-tag, legacy-image, package.json", () => {
  test("revalidateTag gets the max profile once", () => {
    const out = revalidateTagProfile(
      `import { revalidateTag } from "next/cache";\nrevalidateTag("posts");\nrevalidateTag(tag, "hours");\nrevalidateTag(\`a,b\`);\n`,
    );
    expect(out.code).toContain('revalidateTag("posts", "max");');
    expect(out.code).toContain('revalidateTag(tag, "hours");');
    expect(out.code).toContain('revalidateTag(`a,b`, "max");');
  });

  test("next/legacy/image", () => {
    const out = legacyImage(
      `import Image from "next/legacy/image";\n<Image src={a} layout="fill" objectFit="cover" />`,
    );
    expect(out.code).toContain('from "next/image"');
    expect(out.warnings[0]).toContain("legacy layout");
  });

  test("package.json: versions, next lint and --turbo", () => {
    const src =
      JSON.stringify(
        {
          scripts: { dev: "next dev --turbo", build: "next build --turbopack", lint: "next lint" },
          dependencies: { next: "^14.2.0", react: "^18.3.0", "react-dom": "^18.3.0" },
          devDependencies: {
            "@types/react": "^18",
            "eslint-config-next": "14.2.0",
            typescript: "^5",
          },
        },
        null,
        2,
      ) + "\n";
    const out = packageJsonTo16(src);
    const pkg = JSON.parse(out.code);
    expect(pkg.dependencies.next).toBe("^16.0.0");
    expect(pkg.dependencies.react).toBe("^19.2.0");
    expect(pkg.devDependencies["@types/react"]).toBe("^19.0.0");
    expect(pkg.devDependencies.typescript).toBe("^5");
    expect(pkg.scripts).toEqual({ dev: "next dev", build: "next build", lint: "oxlint ." });
    expect(out.code.endsWith("\n")).toBe(true);
    expect(out.warnings[0]).toContain("next lint");
  });

  test("a package.json without next, and catalog versions, are left alone", () => {
    const plain = JSON.stringify({ dependencies: { react: "^18" } });
    expect(packageJsonTo16(plain).code).toBe(plain);
    const cat = JSON.stringify({ dependencies: { next: "catalog:", react: "catalog:" } });
    expect(packageJsonTo16(cat).code).toBe(cat);
  });
});

describe("tailwind v3 -> v4", () => {
  test("renamed utilities, with variants and the important prefix", () => {
    const { value } = classListV3ToV4(
      "shadow-sm rounded ring hover:shadow outline-none flex-shrink-0 !p-4 md:!mt-2 bg-gradient-to-r blur backdrop-blur-sm",
    );
    expect(value).toBe(
      "shadow-xs rounded-sm ring-3 hover:shadow-sm outline-hidden shrink-0 p-4! md:mt-2! bg-linear-to-r blur-sm backdrop-blur-xs",
    );
  });

  test("opacity utilities merge into the colour", () => {
    expect(classListV3ToV4("bg-black bg-opacity-50 p-2").value).toBe("bg-black/50 p-2");
    expect(classListV3ToV4("hover:text-red-500 hover:text-opacity-75").value).toBe("hover:text-red-500/75");
    const ambiguous = classListV3ToV4("bg-opacity-50 p-2");
    expect(ambiguous.value).toBe("bg-opacity-50 p-2");
    expect(ambiguous.warnings[0]).toContain("/50");
  });

  test("arbitrary CSS variables use the parenthesis syntax", () => {
    expect(classListV3ToV4("bg-[--brand] w-[--w] p-[10px]").value).toBe("bg-(--brand) w-(--w) p-[10px]");
  });

  test("class lists in JSX, helper calls and template strings; text is untouched", () => {
    const src = `export const A = () => (
  <div className="shadow rounded p-2" data-label="shadow rounded">
    <span className={cn("shadow-sm", active && "ring", "text-sm")} />
    <b className={\`shadow \${x}\`} />
    shadow rounded
  </div>
);
const s = clsx("outline-none", { rounded: ok });
`;
    const out = tailwindClassesV4(src);
    expect(out.code).toContain('className="shadow-sm rounded-sm p-2"');
    expect(out.code).toContain('data-label="shadow rounded"');
    expect(out.code).toContain('cn("shadow-xs", active && "ring-3", "text-sm")');
    expect(out.code).toContain("`shadow ${x}`");
    expect(out.code).toContain("    shadow rounded\n");
    expect(out.code).toContain('clsx("outline-hidden", { rounded: ok })');
  });

  test("CSS: the three directives become one import; @layer utilities becomes @utility; theme()", () => {
    const css = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  .text-balance { text-wrap: balance; }
  .scrollbar-none { scrollbar-width: none; }
}

.card { color: theme(colors.red.500); padding: theme(spacing.4); }
`;
    const out = tailwindCssV4(css);
    expect(out.code.startsWith('@import "tailwindcss";\n')).toBe(true);
    expect(out.code).not.toContain("@tailwind");
    expect(out.code).toContain("@utility text-balance { text-wrap: balance; }");
    expect(out.code).toContain("@utility scrollbar-none { scrollbar-width: none; }");
    expect(out.code).toContain("color: var(--color-red-500)");
    expect(out.code).toContain("padding: calc(var(--spacing) * 4)");
    expect(out.code).not.toContain("@layer utilities");
  });

  test("CSS: only some directives; complex @layer utilities rules warn", () => {
    const out = tailwindCssV4(
      `@tailwind base;\n@tailwind utilities;\n@layer utilities {\n  .a:hover { color: red; }\n}\n`,
    );
    expect(out.code).toContain('@import "tailwindcss/preflight.css" layer(base);');
    expect(out.code).toContain('@import "tailwindcss/utilities.css" layer(utilities);');
    expect(out.warnings[0]).toContain("@layer utilities");
  });

  test("tailwind.config becomes @theme, @plugin and the dark variant", () => {
    const config = `const defaultTheme = require("tailwindcss/defaultTheme");
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { brand: { 500: "#6750a4", DEFAULT: "#4f378b" }, accent: "#ff0" },
      fontFamily: { display: ["Roboto Flex", "sans-serif"] },
      borderRadius: { xl2: "28px" },
      screens: { tablet: "640px" },
      keyframes: { x: {} },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
`;
    const out = tailwindConfigToCss(config, "tailwind.config.js");
    expect(out.rename).toBe("tailwind-theme.css");
    expect(out.code).toContain("@custom-variant dark (&:where(.dark, .dark *));");
    expect(out.code).toContain('@plugin "@tailwindcss/typography";');
    expect(out.code).toContain("--color-brand-500: #6750a4;");
    expect(out.code).toContain("--color-brand: #4f378b;");
    expect(out.code).toContain("--color-accent: #ff0;");
    expect(out.code).toContain("--font-display: Roboto Flex, sans-serif;");
    expect(out.code).toContain("--radius-xl2: 28px;");
    expect(out.code).toContain("--breakpoint-tablet: 640px;");
    expect(out.code.startsWith("/* From tailwind.config */\n")).toBe(true);
    expect(tailwindConfigToCss(config, "tailwind.config.js", ["/* x */"]).code.startsWith("/* x */\n")).toBe(true);
    expect(out.warnings.some(w => w.includes("content"))).toBe(true);
    expect(out.warnings.some(w => w.includes("keyframes"))).toBe(true);
  });

  test("postcss config and package.json", () => {
    const postcss = `module.exports = {\n  plugins: {\n    "postcss-import": {},\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
    const out = postcssConfigV4(postcss);
    expect(out.code).toBe(`module.exports = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n`);
    const pkg = tailwindPackageJsonV4(
      JSON.stringify(
        {
          devDependencies: { tailwindcss: "^3.4.1", autoprefixer: "^10", "postcss-import": "^16" },
        },
        null,
        2,
      ),
    );
    const parsed = JSON.parse(pkg.code);
    expect(parsed.devDependencies).toEqual({
      tailwindcss: "^4.1.0",
      "@tailwindcss/postcss": "^4.1.0",
    });
    const already = JSON.stringify({ devDependencies: { tailwindcss: "^4.2.0" } });
    expect(tailwindPackageJsonV4(already).code).toBe(already);
  });
});

describe("pages hints", () => {
  test("targets", () => {
    expect(appTarget("pages/index.tsx")).toEqual({ target: "app/page.tsx", kind: "route" });
    expect(appTarget("pages/blog/[slug].tsx")).toEqual({
      target: "app/blog/[slug]/page.tsx",
      kind: "route",
    });
    expect(appTarget("src/pages/docs/[...path].tsx")).toEqual({
      target: "src/app/docs/[...path]/page.tsx",
      kind: "route",
    });
    expect(appTarget("pages/docs/index.tsx").target).toBe("app/docs/page.tsx");
    expect(appTarget("pages/_app.tsx")).toEqual({ target: "app/layout.tsx", kind: "layout" });
    expect(appTarget("pages/_document.tsx").kind).toBe("document");
    expect(appTarget("pages/404.tsx")).toEqual({ target: "app/not-found.tsx", kind: "error" });
    expect(appTarget("pages/api/users/[id].ts")).toEqual({
      target: "app/api/users/[id]/route.ts",
      kind: "api",
    });
    expect(appTarget("pages/api/health.ts").target).toBe("app/api/health/route.ts");
  });

  test("feature notes", () => {
    const notes = featureNotes(
      `import Head from "next/head";\nimport { useRouter } from "next/router";\nexport const getServerSideProps = async () => ({ props: {} });\nexport const getStaticPaths = () => ({});\nconst [a, setA] = useState(0);`,
    );
    expect(notes.some(n => n.startsWith("getServerSideProps"))).toBe(true);
    expect(notes.some(n => n.startsWith("getStaticPaths -> generateStaticParams"))).toBe(true);
    expect(notes.some(n => n.startsWith("next/head"))).toBe(true);
    expect(notes.some(n => n.startsWith("next/router"))).toBe(true);
    expect(notes.some(n => n.includes('"use client"'))).toBe(true);
    expect(featureNotes("export default function A() { return null }")).toEqual([]);
  });

  test("walks a project and reports conflicts with an existing app route", async () => {
    using dir = tempDir("next-bun-pages", {
      "pages/index.tsx": "export const getStaticProps = () => ({ props: {} });\n",
      "pages/api/hello.ts": "export default function h(req, res) { res.status(200).json({}) }\n",
      "pages/_app.tsx": "export default function App({ Component, pageProps }: AppProps) { return null }\n",
      "app/page.tsx": "export default function P() { return null }\n",
      "node_modules/x/pages/a.tsx": "x",
    });
    {
      const hints = await pagesHints(String(dir));
      expect(hints.map(h => h.file)).toEqual(["pages/_app.tsx", "pages/api/hello.ts", "pages/index.tsx"]);
      const index = hints.find(h => h.file === "pages/index.tsx")!;
      expect(index.notes[0]).toContain("already exists");
      expect(index.notes.some(n => n.startsWith("getStaticProps"))).toBe(true);
      expect(hints.find(h => h.file === "pages/api/hello.ts")!.notes[0]).toContain("export async function GET");
    }
  });
});

function project() {
  return tempDir("next-bun-codemod", {
    "package.json":
      JSON.stringify(
        {
          scripts: { lint: "next lint" },
          dependencies: { next: "^15.0.0", react: "^18" },
          devDependencies: { tailwindcss: "^3.4.0", autoprefixer: "^10" },
        },
        null,
        2,
      ) + "\n",
    "next.config.js": "module.exports = { experimental: { dynamicIO: true } };\n",
    "middleware.ts": 'export function middleware() {}\nexport const config = { matcher: ["/a"] };\n',
    "app/page.tsx":
      'import { cookies } from "next/headers";\nexport default function Page() { const c = cookies(); return <div className="shadow rounded">{String(c)}</div>; }\n',
    "app/globals.css": "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
    "postcss.config.js": "module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n",
  });
}

describe("runner and CLI", () => {
  test("every codemod has a unique id, a group and a title", () => {
    expect(new Set(CODEMODS.map(c => c.id)).size).toBe(CODEMODS.length);
    for (const c of CODEMODS) {
      expect(["next16", "tailwind4"]).toContain(c.group);
      expect(c.title.length).toBeGreaterThan(10);
    }
  });

  test("selectCodemods takes ids, groups and all, from the default or a caller's set", () => {
    expect(selectCodemods(["next16"]).every(c => c.group === "next16")).toBe(true);
    expect(selectCodemods(["middleware-to-proxy"]).map(c => c.id)).toEqual(["middleware-to-proxy"]);
    expect(selectCodemods(["all"])).toHaveLength(CODEMODS.length);
    expect(() => selectCodemods(["nope"])).toThrow("unknown codemod");
    const extra = { id: "extra", group: "custom", title: "a codemod a caller adds", test: () => true, run: unchanged };
    expect(selectCodemods(["custom"], [...CODEMODS, extra])).toEqual([extra]);
  });

  test("a dry run reports and writes nothing", async () => {
    using project_ = project();
    const dir = String(project_);
    const before = await readFile(join(dir, "app/page.tsx"), "utf8");
    const reports = await runCodemods({ dir, ids: ["all"] });
    expect(reports.map(r => `${r.file}:${r.codemod}`)).toEqual(
      expect.arrayContaining([
        "app/globals.css:tailwind-css-v4",
        "app/page.tsx:async-request-apis",
        "app/page.tsx:tailwind-classes-v4",
        "middleware.ts:middleware-to-proxy",
        "next.config.js:next-config",
        "package.json:next-package-json",
        "package.json:tailwind-package-json",
        "postcss.config.js:postcss-config-v4",
      ]),
    );
    expect(await readFile(join(dir, "app/page.tsx"), "utf8")).toBe(before);
    expect(existsSync(join(dir, "middleware.ts"))).toBe(true);
  });

  test("--apply writes the changes and renames middleware.ts", async () => {
    using project_ = project();
    const dir = String(project_);
    await runCodemods({ dir, ids: ["all"], apply: true });
    expect(existsSync(join(dir, "middleware.ts"))).toBe(false);
    expect(await readFile(join(dir, "proxy.ts"), "utf8")).toContain("export function proxy()");
    expect(await readFile(join(dir, "next.config.js"), "utf8")).toBe("module.exports = { cacheComponents: true };\n");
    const page = await readFile(join(dir, "app/page.tsx"), "utf8");
    expect(page).toContain("async function Page()");
    expect(page).toContain("await cookies()");
    expect(page).toContain('className="shadow-sm rounded-sm"');
    expect(await readFile(join(dir, "app/globals.css"), "utf8")).toBe('@import "tailwindcss";\n');
    expect(await readFile(join(dir, "postcss.config.js"), "utf8")).toBe(
      'module.exports = { plugins: { "@tailwindcss/postcss": {} } };\n',
    );
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.dependencies.next).toBe("^16.0.0");
    expect(pkg.devDependencies).toEqual({ tailwindcss: "^4.1.0", "@tailwindcss/postcss": "^4.1.0" });
    expect(pkg.scripts.lint).toBe("oxlint .");
    // The class renames are not idempotent (v3 `shadow` and v4 `shadow-sm` are the same utility): a project on v4 is skipped.
    const again = await runCodemods({ dir, ids: ["all"] });
    expect(again.filter(r => r.changes.length > 0)).toEqual([]);
    expect(again.find(r => r.codemod === "tailwind-classes-v4")!.warnings[0]).toContain("already on Tailwind 4");
  });

  test("the CLI lists, reports and returns exit codes", async () => {
    using project_ = project();
    const dir = String(project_);
    const lines: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void lines.push(args.join(" "));
    try {
      expect(await runCodemodCli(["codemod", "--list"])).toBe(0);
      expect(lines.some(l => l.includes("middleware-to-proxy"))).toBe(true);
      lines.length = 0;
      expect(await runCodemodCli(["codemod", "next16", dir])).toBe(0);
      expect(lines[0]).toContain("Would apply");
      expect(lines.some(l => l.includes("middleware.ts  ->  proxy.ts"))).toBe(true);
      expect(await runCodemodCli(["codemod", "nope", dir])).toBe(2);
      lines.length = 0;
      expect(await runCodemodCli(["pages-hints", dir, "--json"])).toBe(0);
      expect(JSON.parse(lines.join("\n"))).toEqual([]);
      lines.length = 0;
      expect(await runCodemodCli(["codemod", "--help"], { program: "next-migrate", groupHelp: ["mui  extra"] })).toBe(
        0,
      );
      expect(lines.join("\n")).toContain("next-migrate codemod --list");
      expect(lines.join("\n")).toContain("mui  extra");
    } finally {
      console.log = log;
    }
  });

  test("the next-bun bin dispatches codemod and pages-hints", async () => {
    using project_ = project();
    await using proc = Bun.spawn({
      cmd: [
        bunExe(),
        join(import.meta.dir, "../../../packages/bun-next/bin/next-bun.js"),
        "codemod",
        "next16",
        String(project_),
      ],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toBe("");
    expect(stdout).toContain("middleware.ts  ->  proxy.ts  [middleware-to-proxy]");
    expect(exitCode).toBe(0);
  });
});
