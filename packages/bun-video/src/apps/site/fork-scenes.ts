/**
 * Scenes that present the Aphrody runtime. Each one is a small program or project from the docs that
 * scripts/fork-runs.ts runs with the runtime on a platform that supports it; a scene shows its first file and the
 * output recorded by that run, never text written for the video.
 */
export interface ForkScene {
  id: string;
  /** Module, API or command the scene presents. */
  title: string;
  description: string;
  /** Docs page of the feature on the Bun site. */
  docs: string;
  /** Files written into an empty directory before the run; the first one is shown in the video. */
  files: Readonly<Record<string, string>>;
  /** Arguments of the `bun` command run in that directory. */
  args: readonly string[];
  /** Platforms whose runtime can run the scene (process.platform values). */
  platforms: readonly string[];
  /** Repository files copied into the directory as well (name in the directory → repository path). */
  fixtures?: Readonly<Record<string, string>>;
}

export interface ForkRun {
  id: string;
  platform: string;
  os: string;
  bun: { version: string; revision: string };
  command: string;
  exitCode: number;
  stdout: string;
  durationMs: number;
}

export interface ForkRuns {
  schema: "bun-video/fork-runs/v1";
  runs: ForkRun[];
}

export const forkScenes: readonly ForkScene[] = [
  {
    id: "fork-video",
    title: "Bun.Video",
    description: "Read a video's metadata, decode a frame and encode it with Bun.Image, without FFmpeg.",
    docs: "/docs/runtime/video",
    files: {
      "video.ts": `const video = new Bun.Video("clip.mp4");
const { width, height, duration, codec, frameCount } = await video.metadata();
console.log({ width, height, duration, codec, frameCount });

await video.frame(1).resize(320, 180).webp().write("frame.webp");
console.log(await new Bun.Image("frame.webp").metadata());
`,
    },
    args: ["video.ts"],
    platforms: ["win32", "linux", "darwin"],
    fixtures: { "clip.mp4": "packages/bun-video/hyperframes/player/tests/perf/fixtures/10-video-grid/sample.mp4" },
  },
  {
    id: "fork-python",
    title: "bun:python",
    description: "CPython runs inside the Bun process: execute Python and read its values as JSON.",
    docs: "/docs/runtime/python",
    files: {
      "python.ts": `import { Python } from "bun:python";

using py = Python.open();
py.exec\`import math; value = {"text": "café", "n": 42}\`;
console.log(py.version().split(" ")[0]);
console.log(py.evalJSON("value"));
console.log(py.eval("math.sqrt(2)"));
`,
    },
    args: ["python.ts"],
    platforms: ["win32", "linux"],
  },
  {
    id: "fork-windows",
    title: "bun:windows",
    description: "Call Windows directly from TypeScript: the system version and the process elevation.",
    docs: "/docs/runtime/windows",
    files: {
      "windows.ts": `import windows from "bun:windows";

const { productName, build } = windows.version();
console.log(productName, build);
console.log("elevated:", windows.isElevated());
`,
    },
    args: ["windows.ts"],
    platforms: ["win32"],
  },
  {
    id: "fork-linux",
    title: "bun:linux",
    description:
      "Read the kernel from TypeScript: its release, the process cgroup and the io_uring operations allowed.",
    docs: "/docs/runtime/linux",
    files: {
      "linux.ts": `import linux from "bun:linux";

console.log(linux.sysctl.get("kernel.ostype"), linux.sysctl.get("kernel.osrelease"));
console.log("cgroup:", linux.cgroup.current());
const { supported, ops } = linux.ioUring.probe();
console.log("io_uring:", supported, ops.length, "operations");
`,
    },
    args: ["linux.ts"],
    platforms: ["linux"],
  },
  {
    id: "fork-graph",
    title: "bun:graph-native",
    description: "Build the call graph of source files and find the path from one function to another.",
    docs: "/docs/runtime/graph",
    files: {
      "graph.ts": `import { executeGraph } from "bun:graph-native";

const scope = { source: "graph:demo", profile: "bun" } as const;
const files = [{ path: "a.ts", content: "export function a() { return b(); }\\nfunction b() { return 1; }\\n" }];
const built = await executeGraph({ op: "build", scope, files });
console.log(built.result.graph.nodes.length, "nodes,", built.result.stats.calls, "call");
const path = await executeGraph({ op: "path", scope, graph: built.result.graph, from: "a", to: "b" });
console.log(path.result.hops.map(hop => hop.node).join(" -> "));
`,
    },
    args: ["graph.ts"],
    platforms: ["win32", "linux", "darwin"],
  },
  {
    id: "fork-n2b",
    title: "bun n2b",
    description: "Find the Node.js code of a project that has a Bun equivalent; --fix rewrites it.",
    docs: "/docs/runtime/n2b",
    files: {
      "package.json": `{
  "name": "app",
  "type": "module",
  "scripts": { "start": "node server.js" }
}
`,
      "server.js": `import { createServer } from "node:http";
createServer((req, res) => res.end("ok")).listen(3000);
`,
    },
    args: ["n2b"],
    platforms: ["win32", "linux", "darwin"],
  },
];
