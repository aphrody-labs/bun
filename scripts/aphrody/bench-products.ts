import { mkdirSync, readFileSync } from "node:fs";
import { cpus, freemem, loadavg, platform, release, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

export type Variant = { label: string; argv: string[]; cwd?: string; env?: Record<string, string> };
export type ProductCase = {
  id: string;
  category: string;
  description: string;
  platforms?: string[];
  left: Variant;
  right: Variant;
  metric: "workMs" | "wallMs";
  expected?: string;
};
export type Sample = {
  wallMs: number;
  workMs?: number;
  rssKiB?: number;
  userMs?: number;
  systemMs?: number;
  value: string;
};
export function summary(values: number[]) {
  if (!values.length || values.some(value => !Number.isFinite(value) || value <= 0))
    throw new Error("Measurements must be finite, positive and nonempty");
  const sorted = values.toSorted((a, b) => a - b);
  const n = sorted.length,
    mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { n, median, p95: sorted[Math.ceil(n * 0.95) - 1]!, min: sorted[0]!, max: sorted[n - 1]! };
}
export function pairedInterval(left: number[], right: number[], repetitions = 2000) {
  if (left.length !== right.length) throw new Error("Unpaired measurements");
  summary(left);
  summary(right);
  let seed = 144;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const ratios: number[] = [];
  for (let i = 0; i < repetitions; i++) {
    const l: number[] = [],
      r: number[] = [];
    for (let j = 0; j < left.length; j++) {
      const k = Math.floor(random() * left.length);
      l.push(left[k]!);
      r.push(right[k]!);
    }
    ratios.push(summary(r).median / summary(l).median);
  }
  ratios.sort((a, b) => a - b);
  return {
    ratio: summary(right).median / summary(left).median,
    low: ratios[Math.floor(ratios.length * 0.025)]!,
    high: ratios[Math.ceil(ratios.length * 0.975) - 1]!,
  };
}
export function parseMeasurement(stdout: string, wallMs: number): Sample {
  const line = stdout
    .trim()
    .split("\n")
    .findLast(line => line.startsWith("BENCH_RESULT "));
  if (!line) throw new Error("Missing checked benchmark result");
  const result = JSON.parse(line.slice(13));
  if (typeof result.value !== "string" || !result.value) throw new Error("Missing correctness value");
  if (result.workMs !== undefined && (!Number.isFinite(result.workMs) || result.workMs <= 0))
    throw new Error("Invalid work duration");
  return { wallMs, workMs: result.workMs, value: result.value };
}
export function validatePair(left: Sample, right: Sample, expected?: string) {
  if (left.value !== right.value || (expected !== undefined && left.value !== expected))
    throw new Error("Compared products returned different or invalid results");
}
export function reportCsv(report: {
  cases: { id: string; status: string; raw?: { sample: number; order: string; left: Sample; right: Sample }[] }[];
}): string {
  const rows: unknown[][] = [
    ["case", "sample", "order", "variant", "wallMs", "workMs", "rssKiB", "userMs", "systemMs", "value"],
  ];
  for (const entry of report.cases) {
    for (const pair of entry.raw ?? []) {
      for (const variant of ["left", "right"] as const) {
        const sample = pair[variant];
        rows.push([
          entry.id,
          pair.sample,
          pair.order,
          variant,
          sample.wallMs,
          sample.workMs,
          sample.rssKiB,
          sample.userMs,
          sample.systemMs,
          sample.value,
        ]);
      }
    }
  }
  return (
    rows.map(row => row.map(value => '"' + String(value ?? "").replaceAll('"', '""') + '"').join(",")).join("\n") + "\n"
  );
}
const ROOT = resolve(import.meta.dir, "../..");
async function measure(variant: Variant, out: string, name: string): Promise<Sample> {
  const resource = join(out, name + ".resources");
  const time = platform() === "linux" ? "/usr/bin/time" : undefined;
  const argv = time ? [time, "-f", "%M;%U;%S", "-o", resource, ...variant.argv] : variant.argv;
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1", ...variant.env };
  for (const key of Object.keys(env))
    if (key.startsWith("BUN_JSC_")) delete (env as Record<string, string | undefined>)[key];
  const start = performance.now();
  await using child = Bun.spawn({
    cmd: argv,
    cwd: variant.cwd ?? ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(600_000),
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const elapsed = performance.now() - start;
  if (code !== 0) throw new Error(variant.label + " exit " + code + ": " + stderr.slice(-2000));
  const sample = parseMeasurement(stdout, elapsed);
  if (time) {
    const [rss, user, system] = readFileSync(resource, "utf8").trim().split(";").map(Number);
    if (![rss, user, system].every(Number.isFinite)) throw new Error("Invalid resource sample");
    Object.assign(sample, { rssKiB: rss, userMs: user! * 1000, systemMs: system! * 1000 });
  }
  return sample;
}
function git(args: string[]) {
  const result = Bun.spawnSync(["git", "-C", ROOT, ...args], { stdout: "pipe", stderr: "pipe" });
  if (!result.success) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
export function reportMarkdown(report: any): string {
  const code = (value: unknown) =>
    JSON.stringify(value, null, 2)
      .split("\n")
      .map(line => "    " + line)
      .join("\n");
  const rows = report.cases
    .map((entry: any) =>
      entry.status !== "measured"
        ? "| " + entry.id + " | " + entry.status + " | — | — | — |"
        : "| " +
          entry.id +
          " | " +
          entry.metric +
          " | " +
          entry.left.median.toFixed(4) +
          " | " +
          entry.right.median.toFixed(4) +
          " | " +
          entry.interval.ratio.toFixed(3) +
          " [" +
          entry.interval.low.toFixed(3) +
          ", " +
          entry.interval.high.toFixed(3) +
          "] |",
    )
    .join("\n");
  return [
    "# Benchmarks des produits Bun",
    "",
    "Exécution SSH VPS : " +
      report.generatedAt +
      ". Runtime : " +
      report.environment.bunVersion +
      ". " +
      report.samples +
      " paires, " +
      report.warmup +
      " échauffements. Ordre AB/BA alterné, exécutions séquentielles, résultats identiques vérifiés avant calcul.",
    "",
    "| Cas | Mesure / statut | Bun médiane (ms) | Référence médiane (ms) | Référence / Bun, IC 95 % |",
    "| --- | --- | ---: | ---: | ---: |",
    rows,
    "",
    "Un ratio supérieur à 1 favorise Bun pour cette charge précise. L'intervalle vient d'un bootstrap apparié déterministe de 2000 tirages. Les latences internes et les temps de processus sont séparés. Le RSS GNU time est le maximum rapporté pour le processus et ses descendants, pas une somme instantanée de l'arbre. Le CPU est rapporté à la résolution de GNU time : les petits cas peuvent afficher zéro.",
    "",
    "Les cas non exécutés ne reçoivent aucune mesure. Ce rapport ne démontre ni une équivalence générale des API, ni une supériorité pour les applications réelles. Les cas Windows nécessitent un hôte Windows natif ; Wine n'est pas qualifié comme Windows natif.",
    "",
    "## Environnement et provenance",
    "",
    code(report.environment),
    "",
    "## Détail des charges",
    "",
    ...report.cases.flatMap((entry: any) => [
      "### " + entry.id,
      "",
      entry.description,
      "",
      entry.status === "measured"
        ? "Échantillons : " +
          entry.left.n +
          ". p95 Bun " +
          entry.left.p95.toFixed(4) +
          " ms ; référence " +
          entry.right.p95.toFixed(4) +
          " ms. Résultat validé : " +
          entry.value +
          "."
        : entry.reason,
      "",
      entry.status === "measured" ? code(entry.commands) : "",
      "",
    ]),
  ].join("\n");
}
if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    strict: true,
    options: {
      manifest: { type: "string" },
      out: { type: "string" },
      samples: { type: "string", default: "30" },
      warmup: { type: "string", default: "5" },
      "allow-debug": { type: "boolean" },
      plan: { type: "boolean" },
    },
  });
  if (!values.manifest || !values.out) throw new Error("--manifest and --out required");
  const samples = Number(values.samples),
    warmup = Number(values.warmup);
  if (
    !Number.isSafeInteger(samples) ||
    samples < 10 ||
    samples > 1000 ||
    !Number.isSafeInteger(warmup) ||
    warmup < 1 ||
    warmup > 100
  )
    throw new Error("Require 10..1000 samples and 1..100 warmups");
  const manifestPath = resolve(values.manifest),
    manifest = await Bun.file(manifestPath).json();
  if (!Array.isArray(manifest.cases) || !manifest.cases.length) throw new Error("Empty benchmark manifest");
  const version = Bun.spawnSync([manifest.bun, "-p", "Bun.version"], { stdout: "pipe", stderr: "pipe" });
  if (!version.success) throw new Error("Cannot probe benchmark runtime");
  const bunVersion = version.stdout.toString().trim();
  if (bunVersion.includes("debug") && !values["allow-debug"])
    throw new Error("Performance reports require a release binary");
  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  const report: any = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    samples,
    warmup,
    environment: {
      executor: "ssh-vps",
      os: platform(),
      kernel: release(),
      arch: process.arch,
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytes: freemem(),
      loadAverage: loadavg(),
      bunVersion,
      bunRevision: Bun.spawnSync([manifest.bun, "-p", "Bun.revision"], { stdout: "pipe", stderr: "pipe" })
        .stdout.toString()
        .trim(),
      bunExecutableSha256: new Bun.CryptoHasher("sha256")
        .update(await Bun.file(manifest.bun).arrayBuffer())
        .digest("hex"),
      runnerSha256: new Bun.CryptoHasher("sha256").update(await Bun.file(import.meta.path).arrayBuffer()).digest("hex"),
      sourceCommit: git(["rev-parse", "HEAD"]),
      candidatePatchSha256: new Bun.CryptoHasher("sha256").update(git(["diff", "--binary"])).digest("hex"),
      manifestSha256: new Bun.CryptoHasher("sha256").update(await Bun.file(manifestPath).arrayBuffer()).digest("hex"),
      products: manifest.products,
      affinity: Bun.spawnSync(["taskset", "-pc", String(process.pid)], { stdout: "pipe", stderr: "ignore" })
        .stdout.toString()
        .trim(),
      flags: "release, no custom JSC flags; telemetry disabled",
      notes: manifest.notes,
    },
    cases: [],
  };
  for (const entry of manifest.cases as ProductCase[]) {
    if (values.plan || (entry.platforms && !entry.platforms.includes(platform()))) {
      report.cases.push({
        ...entry,
        status: values.plan ? "planned" : "unsupported-host",
        reason: "Requires " + (entry.platforms?.join(", ") ?? "execution") + "; actual host " + platform(),
      });
      continue;
    }
    const left: number[] = [],
      right: number[] = [],
      raw: any[] = [];
    try {
      for (let i = -warmup; i < samples; i++) {
        const pair = new Map<Variant, Sample>();
        for (const variant of i % 2 ? [entry.right, entry.left] : [entry.left, entry.right])
          pair.set(
            variant,
            await measure(variant, out, entry.id + "-" + i + "-" + (variant === entry.left ? "bun" : "reference")),
          );
        const l = pair.get(entry.left)!,
          r = pair.get(entry.right)!;
        validatePair(l, r, entry.expected);
        const lMetric = l[entry.metric],
          rMetric = r[entry.metric];
        if (lMetric === undefined || rMetric === undefined) throw new Error("Missing requested metric");
        if (i >= 0) {
          left.push(lMetric);
          right.push(rMetric);
          raw.push({ sample: i, order: i % 2 ? "BA" : "AB", left: l, right: r });
        }
      }
      const interval = pairedInterval(left, right);
      report.cases.push({
        id: entry.id,
        category: entry.category,
        description: entry.description,
        status: "measured",
        metric: entry.metric,
        left: summary(left),
        right: summary(right),
        interval,
        value: raw[0].left.value,
        raw,
        commands: { left: entry.left, right: entry.right },
      });
      console.log(
        entry.id +
          ": reference/Bun " +
          interval.ratio.toFixed(3) +
          " [" +
          interval.low.toFixed(3) +
          ", " +
          interval.high.toFixed(3) +
          "]",
      );
    } catch (error) {
      report.cases.push({ ...entry, status: "failed", reason: String(error), raw });
      console.error(entry.id + ": " + String(error));
    }
    await Bun.write(join(out, "product-benchmarks.json"), JSON.stringify(report, null, 2) + "\n");
    await Bun.write(join(out, "README.md"), reportMarkdown(report));
    await Bun.write(join(out, "product-benchmarks.csv"), reportCsv(report));
  }
  await Bun.write(join(out, "product-benchmarks.json"), JSON.stringify(report, null, 2) + "\n");
  await Bun.write(join(out, "README.md"), reportMarkdown(report));
  await Bun.write(join(out, "product-benchmarks.csv"), reportCsv(report));
  if (report.cases.some((entry: any) => entry.status === "failed")) process.exitCode = 1;
}
