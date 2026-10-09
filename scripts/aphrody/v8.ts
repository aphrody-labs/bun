import { join } from "node:path";

export type ArenaReport = {
  workload: string;
  lane: "engine" | "runtime";
  runtime: "bun" | "deno";
  checksum: string;
  checksums: Record<string, string | number>;
  cold: Record<string, number>;
  samples: Record<string, number[]>;
  hwm: number;
  hwmSource: string;
  info: Record<string, unknown>;
};

export function parseArenaReport(stdout: string): ArenaReport {
  const value: unknown = JSON.parse(stdout.trim());
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid arena report");
  const report = value as Record<string, unknown>;
  if (
    typeof report.workload !== "string" ||
    (report.lane !== "engine" && report.lane !== "runtime") ||
    (report.runtime !== "bun" && report.runtime !== "deno") ||
    typeof report.checksum !== "string" ||
    typeof report.hwm !== "number" ||
    !Number.isFinite(report.hwm) ||
    report.hwm < 0 ||
    typeof report.hwmSource !== "string"
  )
    throw new Error("Invalid arena provenance");
  for (const key of ["samples", "checksums", "cold", "info"]) {
    const part = report[key];
    if (!part || typeof part !== "object" || Array.isArray(part)) throw new Error(`Invalid arena ${key}`);
  }
  const samples = report.samples as Record<string, unknown>;
  const checksums = report.checksums as Record<string, unknown>;
  const cold = report.cold as Record<string, unknown>;
  const names = Object.keys(samples).sort();
  if (
    !names.length ||
    JSON.stringify(names) !== JSON.stringify(Object.keys(checksums).sort()) ||
    JSON.stringify(names) !== JSON.stringify(Object.keys(cold).sort())
  )
    throw new Error("Arena metric sets differ");
  for (const name of names) {
    const times = samples[name];
    const checksum = checksums[name];
    const first = cold[name];
    if (
      !Array.isArray(times) ||
      !times.length ||
      times.some(time => typeof time !== "number" || !Number.isFinite(time) || time < 0)
    ) {
      throw new Error(`Invalid arena samples for ${name}`);
    }
    if (
      (typeof checksum !== "string" && typeof checksum !== "number") ||
      (typeof checksum === "number" && !Number.isFinite(checksum)) ||
      typeof first !== "number" ||
      !Number.isFinite(first) ||
      first < 0
    )
      throw new Error(`Invalid arena checksum or cold sample for ${name}`);
  }
  return report as ArenaReport;
}

export function validateArenaPair(left: ArenaReport, right: ArenaReport) {
  const names = Object.keys(left.samples).sort();
  if (
    left.runtime !== "bun" ||
    right.runtime !== "deno" ||
    left.workload !== right.workload ||
    left.lane !== right.lane ||
    left.checksum !== right.checksum ||
    JSON.stringify(names) !== JSON.stringify(Object.keys(right.samples).sort())
  )
    throw new Error("Arena runtime results differ");
  for (const name of names) {
    if (left.checksums[name] !== right.checksums[name]) throw new Error(`Arena checksum differs for ${name}`);
  }
  return names;
}

export function denoRun(executable: string, file: string, allowedRead: string) {
  if (allowedRead.includes(",")) throw new Error("Deno read scope cannot contain a comma");
  return [
    executable,
    "run",
    "--no-config",
    "--no-lock",
    "--no-check",
    "--no-remote",
    "--no-npm",
    `--allow-read=${allowedRead}`,
    "--allow-env=ARENA_ITERS,ARENA_WARMUP",
    file,
  ];
}

export function arenaCases(bun: string, deno: string, root: string) {
  const shared = join(root, "bench", "aphrody", "arena", "shared");
  return ["compute", "json", "gzip"].map(workload => {
    const file = join(shared, `${workload}.mjs`);
    return {
      name: `Bun vs Deno / arena ${workload}`,
      left: { name: "Bun / JSC", argv: [bun, file], arena: true },
      right: { name: "Deno / V8", argv: denoRun(deno, file, shared), arena: true },
    };
  });
}

export function v8HeaderVersion(source: string) {
  const fields = ["MAJOR_VERSION", "MINOR_VERSION", "BUILD_NUMBER", "PATCH_LEVEL"].map(name => {
    const match = new RegExp(`^#define V8_${name}\\s+(\\d+)\\s*$`, "m").exec(source);
    if (!match) throw new Error(`Missing V8_${name}`);
    return match[1]!;
  });
  return fields.join(".");
}

export function v8RuntimeVersion(version: string) {
  const match = /^(\d+\.\d+\.\d+\.\d+)(?:-rusty)?$/.exec(version);
  if (!match) throw new Error(`Unsupported V8 runtime version: ${version}`);
  return match[1]!;
}
