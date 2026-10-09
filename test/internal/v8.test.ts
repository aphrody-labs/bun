import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";
import { join, resolve } from "node:path";
import {
  arenaCases,
  parseArenaReport,
  v8HeaderVersion,
  v8RuntimeVersion,
  validateArenaPair,
} from "../../scripts/aphrody/v8.ts";

const report = (runtime: "bun" | "deno") => ({
  workload: "json",
  lane: "engine",
  runtime,
  checksum: "abc12300",
  checksums: { roundtrip: 42 },
  cold: { roundtrip: 2 },
  samples: { roundtrip: [1] },
  hwm: 8192,
  hwmSource: "rss",
  info: {},
});

describe("Bun / V8 arena protocol", () => {
  test("rejects malformed measurements before benchmark ingestion", () => {
    for (const patch of [
      { samples: { roundtrip: [] } },
      { samples: { roundtrip: [-1] } },
      { samples: { roundtrip: [null] } },
      { samples: { other: [1] } },
      { checksums: { roundtrip: null } },
      { cold: { roundtrip: -1 } },
      { runtime: "v8" },
      { hwm: -1 },
    ])
      expect(() => parseArenaReport(JSON.stringify({ ...report("bun"), ...patch }))).toThrow();
  });

  test("requires equal kernels and checksums while allowing distinct timings", () => {
    const left = parseArenaReport(JSON.stringify(report("bun")));
    const right = parseArenaReport(JSON.stringify({ ...report("deno"), samples: { roundtrip: [3] } }));
    expect(validateArenaPair(left, right)).toEqual(["roundtrip"]);
    expect(() => validateArenaPair(left, { ...right, checksums: { roundtrip: 43 } })).toThrow("checksum");
    expect(() => validateArenaPair(left, { ...right, workload: "compute" })).toThrow("results differ");
    expect(() => validateArenaPair(left, { ...right, lane: "runtime" })).toThrow("results differ");
  });

  test("V8 source version uses all four components and rejects compatibility versions", () => {
    const source = ["MAJOR_VERSION 15", "MINOR_VERSION 0", "BUILD_NUMBER 245", "PATCH_LEVEL 2"]
      .map(line => `#define V8_${line}`)
      .join("\r\n");
    expect(v8HeaderVersion(source)).toBe("15.0.245.2");
    expect(v8RuntimeVersion("15.0.245.2-rusty")).toBe("15.0.245.2");
    expect(() => v8HeaderVersion(source.replace("#define V8_PATCH_LEVEL 2", ""))).toThrow("PATCH_LEVEL");
    expect(() => v8RuntimeVersion("14.6.202.34-node.20")).toThrow("Unsupported");
  });

  test.concurrent.skipIf(!Bun.which("deno"))(
    "the existing JSON arena executes the same source under Bun and Deno",
    async () => {
      const root = resolve(import.meta.dir, "../..");
      const json = arenaCases(bunExe(), Bun.which("deno")!, root).find(entry => entry.name.endsWith("json"))!;
      const env = { ...bunEnv, ARENA_ITERS: "1", ARENA_WARMUP: "1", DENO_NO_UPDATE_CHECK: "1" };
      const execute = async (argv: string[]) => {
        await using proc = Bun.spawn({ cmd: argv, cwd: root, env, stdout: "pipe", stderr: "pipe" });
        const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
        expect(stderr).toBe("");
        expect(stdout.trim()).toStartWith('{"workload":"json"');
        expect(code).toBe(0);
        return parseArenaReport(stdout);
      };
      const [left, right] = await Promise.all([execute(json.left.argv), execute(json.right.argv)]);
      expect(validateArenaPair(left, right)).toEqual(["roundtrip"]);
      expect(left.samples.roundtrip).toHaveLength(1);
      expect(right.samples.roundtrip).toHaveLength(1);
      expect(json.left.argv.at(-1)).toBe(join(root, "bench", "aphrody", "arena", "shared", "json.mjs"));
    },
  );
});
