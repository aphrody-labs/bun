import { parseArgs } from "node:util";

export async function captureRuntimeFacts(gates: string[] = []) {
  const video = Bun.Video;
  const gateFacts = [];
  for (const path of gates) {
    const body = await Bun.file(path).text();
    const passed = [...body.matchAll(/\b(\d+) pass\b/g)].at(-1);
    const failed = [...body.matchAll(/\b(\d+) fail\b/g)].at(-1);
    const assertions = [...body.matchAll(/\b(\d+) expect\(\) calls/g)].at(-1);
    if (!passed || !failed || Number(failed[1]) !== 0) throw new Error("Runtime gate is missing or failed");
    gateFacts.push({
      sha256: new Bun.CryptoHasher("sha256").update(body).digest("hex"),
      passed: Number(passed[1]),
      failed: Number(failed[1]),
      assertions: assertions ? Number(assertions[1]) : null,
    });
  }
  const binary = await Bun.file(process.execPath).bytes();
  return {
    schema: 1,
    capturedAt: new Date().toISOString(),
    source: Bun.revision,
    version: Bun.version,
    target: process.platform + "-" + process.arch,
    binary: { sha256: new Bun.CryptoHasher("sha256").update(binary).digest("hex"), bytes: binary.length },
    nativeVideo: {
      available: video?.available === true,
      methods: video
        ? Object.getOwnPropertyNames(video.prototype)
            .filter(name => name !== "constructor")
            .sort()
        : [],
    },
    nativeImage: {
      available: typeof Bun.Image === "function",
      methods:
        typeof Bun.Image === "function"
          ? Object.getOwnPropertyNames(Bun.Image.prototype)
              .filter(name => name !== "constructor")
              .sort()
          : [],
    },
    sql: typeof Bun.SQL === "function",
    webView: "WebView" in Bun,
    qualification:
      "Measured runtime surfaces on this target; test counts belong to the supplied zero-failure gate logs. Other targets and providers require their own qualification.",
    gates: gateFacts,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { out: { type: "string" }, gate: { type: "string", multiple: true } },
    strict: true,
  });
  const facts = await captureRuntimeFacts(values.gate);
  if (values.out) await Bun.write(values.out, JSON.stringify(facts, null, 2) + "\n");
  else console.log(JSON.stringify(facts));
}
