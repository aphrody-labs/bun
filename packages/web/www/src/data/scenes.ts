/** A program the home page runs for real: it is executed by scripts/record.ts and its output is stored beside it. */
export interface Scene {
  id: string;
  /** Label of the tab. */
  tab: string;
  /** File the program is saved as, shown above it. */
  file: string;
  code: string;
  /** Arguments of the `bun` command. */
  args: string[];
  /** `process.platform` values that can run it. */
  platforms: string[];
  /** Repository files copied next to the program (name in the directory, path in the repository). */
  fixtures?: Record<string, string>;
  /** Docs page of the feature. */
  docs: string;
}

export interface Recorded extends Scene {
  platform: string;
  os: string;
  bun: string;
  output: string;
  durationMs: number;
}

export const SCENES: Scene[] = [
  {
    id: "video",
    tab: "Bun.Video",
    file: "video.ts",
    code: `const video = new Bun.Video("clip.mp4");
const { width, height, duration } = await video.metadata();
console.log(\`\${width}x\${height}, \${duration} s\`);

await video.frame(1).resize(320, 180).webp().write("f.webp");
console.log(Bun.file("f.webp").size, "bytes");
`,
    args: ["video.ts"],
    platforms: ["win32", "linux", "darwin"],
    fixtures: { "clip.mp4": "packages/bun-video/hyperframes/player/tests/perf/fixtures/10-video-grid/sample.mp4" },
    docs: "/docs/runtime/video",
  },
  {
    id: "python",
    tab: "bun:python",
    file: "python.ts",
    code: `import { Python } from "bun:python";

using py = Python.open();
py.exec\`import math\`;
console.log(py.eval("math.sqrt(2)"));
console.log(py.version().split(" ")[0]);
`,
    args: ["python.ts"],
    platforms: ["win32", "linux"],
    docs: "/docs/runtime/python",
  },
  {
    id: "windows",
    tab: "bun:windows",
    file: "windows.ts",
    code: `import windows from "bun:windows";

const { productName, build } = windows.version();
console.log(productName, build);
console.log("elevated:", windows.isElevated());
`,
    args: ["windows.ts"],
    platforms: ["win32"],
    docs: "/docs/runtime/windows",
  },
  {
    id: "linux",
    tab: "bun:linux",
    file: "linux.ts",
    code: `import linux from "bun:linux";

console.log(linux.sysctl.get("kernel.osrelease"));
console.log(linux.cgroup.current());
console.log(linux.ioUring.probe().ops.length, "io_uring ops");
`,
    args: ["linux.ts"],
    platforms: ["linux"],
    docs: "/docs/runtime/linux",
  },
];
