import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
const ROOT = resolve(import.meta.dir, "../../..");
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    out: { type: "string" },
    bun: { type: "string", default: process.execPath },
    python: { type: "string", default: "/usr/bin/python3" },
    node: { type: "string", default: Bun.which("node") ?? "" },
    dotnet: { type: "string", default: join(process.env.HOME ?? "", ".dotnet/dotnet") },
    "python-host": { type: "string" },
    libpython: { type: "string", default: "/usr/lib/x86_64-linux-gnu/libpython3.14.so" },
    "skip-install": { type: "boolean" },
  },
  strict: true,
});
if (!values.out) throw new Error("--out required");
const out = resolve(values.out),
  bun = resolve(values.bun!),
  node = resolve(values.node!),
  dotnet = resolve(values.dotnet!),
  python = resolve(values.python!);
mkdirSync(out, { recursive: true });
function run(argv: string[], cwd: string) {
  const proc = Bun.spawnSync(argv, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (!proc.success) throw new Error(argv.slice(0, 3).join(" ") + "\n" + proc.stdout + "\n" + proc.stderr);
  return proc.stdout.toString().trim();
}
const fixtures = join(ROOT, "bench/aphrody/products"),
  tailwind = join(out, "tailwind");
mkdirSync(tailwind, { recursive: true });
writeFileSync(
  join(tailwind, "package.json"),
  JSON.stringify({
    name: "benchmark-tailwind-fixture",
    private: true,
    type: "module",
    dependencies: { "@tailwindcss/node": "4.3.3", "@tailwindcss/oxide": "4.3.3", tailwindcss: "4.3.3" },
  }),
);
writeFileSync(
  join(tailwind, "style.css"),
  '@import "tailwindcss" source(none);\n@source inline("flex grid p-4 m-2 text-red-500 bg-blue-500 rounded-lg hover:underline sm:grid-cols-3");\n',
);
if (!values["skip-install"]) run([bun, "install", "--no-save"], tailwind);
const cs = join(out, "dotnet");
mkdirSync(cs, { recursive: true });
copyFileSync(join(fixtures, "Fixture.cs"), join(cs, "Program.cs"));
writeFileSync(
  join(cs, "Fixture.csproj"),
  '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><AssemblyName>Fixture</AssemblyName><AllowUnsafeBlocks>true</AllowUnsafeBlocks><Optimize>true</Optimize></PropertyGroup></Project>',
);
const dotnetOutput = join(cs, "out");
if (!values["skip-install"])
  run([dotnet, "build", join(cs, "Fixture.csproj"), "-c", "Release", "--output", dotnetOutput, "--nologo"], cs);
const projects: Record<string, string> = {};
for (const variant of ["node", "bun-native", "bun-turbopack"]) {
  const project = join(out, "next-" + variant);
  projects[variant] = project;
  mkdirSync(join(project, "pages"), { recursive: true });
  writeFileSync(join(project, ".benchmark-owned"), "bun-products-benchmark-v1\n");
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({
      name: "benchmark-next-fixture",
      private: true,
      dependencies: { next: "16.4.0", react: "19.3.0", "react-dom": "19.3.0" },
    }),
  );
  writeFileSync(
    join(project, "pages/index.jsx"),
    "export default function Page(){return <main><h1>benchmark-42</h1><ul>{Array.from({length:100},(_,i)=><li key={i}>item-{i}</li>)}</ul></main>}\n",
  );
  const common = { experimental: { cpus: 1 }, generateBuildId: async () => "benchmark-fixed" };
  const config =
    variant === "node"
      ? "module.exports=" +
        JSON.stringify({ experimental: { cpus: 1 } }) +
        '; module.exports.generateBuildId=async()=>"benchmark-fixed";\n'
      : "const {withBun}=require(" +
        JSON.stringify(join(ROOT, "packages/bun-next")) +
        ');module.exports=withBun({experimental:{cpus:1},generateBuildId:async()=>"benchmark-fixed"},{projectDir:__dirname,bundler:' +
        JSON.stringify(variant === "bun-native" ? "bun" : "turbopack") +
        "});\n";
  void common;
  writeFileSync(join(project, "next.config.js"), config);
  if (!values["skip-install"]) {
    run([bun, "install", "--no-save"], project);
    if (variant === "bun-native")
      run([bun, join(ROOT, "packages/bun-next/bin/next-bun.js"), "patch", project], project);
  }
}
const host = resolve(
  values["python-host"] ?? join(ROOT, "packages/bun-python-native/target/release/libbun_python_host.so"),
);
const env = {
  BUN_PYTHON_HOST_LIBRARY: host,
  BUN_PYTHON_LIBPYTHON: resolve(values.libpython!),
  BUN_PYTHON_EXECUTABLE: python,
  BUV_RUNTIME: resolve(python, "../.."),
};
const cases: any[] = [];
for (const mode of ["startup", "sum", "json", "sha256", "bridge"])
  cases.push({
    id: "python-" + mode,
    category: "Python",
    description:
      "CPython 3.14 partagé identique dans bun:python et dans le CLI CPython ; " +
      mode +
      ". L'embedding vérifie que le PID Python est le PID Bun. La charge bridge mesure 10000 eval scalaires, et non un moteur Python différent.",
    metric: mode === "startup" ? "wallMs" : "workMs",
    left: { label: "bun:python", argv: [bun, join(fixtures, "python.ts")], env: { ...env, BENCH_MODE: mode } },
    right: { label: "CPython", argv: [python, join(fixtures, "python.py")], env: { BENCH_MODE: mode } },
  });
for (const size of [10, 1000])
  cases.push({
    id: "dotnet-calls-" + size,
    category: ".NET",
    description:
      "100000 appels, même méthode C# NoInlining compilée Release .NET 10. Bun passe par UnmanagedCallersOnly/bun:ffi ; C# appelle Compute directement. 100000 appels d'échauffement avant chronométrage ; cette paire mesure le coût de frontière et ne compare pas deux CLR.",
    metric: "workMs",
    left: {
      label: "bun:dotnet",
      argv: [bun, join(fixtures, "dotnet.ts")],
      env: { BENCH_DOTNET: dotnetOutput, BENCH_SIZE: String(size), DOTNET_ROOT: resolve(dotnet, "..") },
    },
    right: { label: "C# / dotnet", argv: [dotnet, join(dotnetOutput, "Fixture.dll"), String(size)] },
  });
for (const mode of ["workMs", "wallMs"])
  cases.push({
    id: "tailwind-" + (mode === "workMs" ? "compile" : "process"),
    category: "Tailwind CSS",
    description:
      "Même Tailwind CSS 4.3.3 et Oxide ; mêmes classes explicites, sans scan automatique, sans minification. Bun utilise TailwindRoot, Node utilise directement le compilateur amont et Oxide. SHA-256 du CSS exact identique requis.",
    metric: mode,
    left: {
      label: "Bun Tailwind plugin",
      argv: [bun, join(fixtures, "tailwind.mjs")],
      env: { BENCH_PROJECT: tailwind, BENCH_VARIANT: "bun-plugin" },
    },
    right: {
      label: "Tailwind upstream / Node",
      argv: [node, join(fixtures, "tailwind.mjs")],
      env: { BENCH_PROJECT: tailwind, BENCH_VARIANT: "node" },
    },
  });
for (const variant of ["bun-native", "bun-turbopack"])
  for (const cache of ["cold", "warm"])
    cases.push({
      id: "next-" + variant + "-" + cache,
      category: "Next.js",
      description:
        "Même Next.js 16.4.0, React 19.3.0, page statique 100 éléments, un worker, build ID fixe. Référence : Node et Turbopack amont. Bun : " +
        (variant === "bun-native" ? "Bun.build via next-bun patch, expérimental" : "même Turbopack via next-bun") +
        " ; cache " +
        cache +
        ". Vérification du contenu main et des manifests. Installation et patch hors mesure ; suppression de .next incluse dans wallMs du cache froid.",
      metric: "wallMs",
      left: {
        label: variant,
        argv: [bun, join(fixtures, "next.mjs")],
        env: {
          BENCH_PROJECT: projects[variant]!,
          BENCH_VARIANT: variant,
          BENCH_CACHE: cache,
          BENCH_BUN: bun,
          BENCH_NODE: node,
          BENCH_ROOT: ROOT,
        },
      },
      right: {
        label: "Next.js / Node / Turbopack",
        argv: [node, join(fixtures, "next.mjs")],
        env: {
          BENCH_PROJECT: projects.node!,
          BENCH_VARIANT: "node",
          BENCH_CACHE: cache,
          BENCH_BUN: bun,
          BENCH_NODE: node,
          BENCH_ROOT: ROOT,
        },
      },
    });
cases.push({
  id: "windows-kernel32-pid",
  category: "Windows",
  platforms: ["win32"],
  description:
    "100000 GetCurrentProcessId, résultat comparé au PID du processus ; bun:windows family kernel32 contre PowerShell P/Invoke kernel32.dll. Add-Type et chargement hors workMs ; 10000 appels d'échauffement. Nécessite Windows natif et @aphrody/bun-windows-kernel32 installé.",
  metric: "workMs",
  expected: "true",
  left: { label: "bun:windows / kernel32", argv: [bun, join(fixtures, "windows.ts")] },
  right: {
    label: "PowerShell / kernel32 PInvoke",
    argv: ["pwsh", "-NoLogo", "-NoProfile", "-File", join(fixtures, "windows.ps1")],
  },
});
const hashes: Record<string, string> = {};
for (const path of new Bun.Glob("*").scanSync({ cwd: fixtures, onlyFiles: true }))
  hashes[path] = new Bun.CryptoHasher("sha256").update(readFileSync(join(fixtures, path))).digest("hex");
const products = {
  bun: run([bun, "--version"], ROOT),
  node: run([node, "--version"], ROOT),
  python: run([python, "--version"], ROOT),
  dotnet: run([dotnet, "--version"], ROOT),
  next: "16.4.0",
  react: "19.3.0",
  tailwind: "4.3.3",
  fixtures: hashes,
  pythonLibrary: values.libpython,
  pythonHost: host,
};
writeFileSync(
  join(out, "manifest.json"),
  JSON.stringify(
    {
      schema: 1,
      bun,
      products,
      notes: [
        "Native Linux VPS execution. Windows cases must be run on a native Windows SSH target.",
        "Build/install/patch setup excluded from timed samples.",
        "No debug runtime results are accepted by default.",
      ],
      cases,
    },
    null,
    2,
  ) + "\n",
);
console.log(join(out, "manifest.json"));
