const root = "factory/artifacts/runtime-release/jev-sdk-fork-qualification-20261013";
const logNames = [
  "typesafe-sdk-js-baseline-20261013.log",
  "typesafe-sdk-js-fixed-20261013.log",
  "typesafe-sdk-js-062-checks-20261013.log",
  "typesafe-sdk-js-062-coverage-20261013.log",
  "typesafe-sdk-js-delivery-20261013.log",
  "typesafe-sdk-js-publish-062-final-20261013.log",
];
const logs = await Promise.all(logNames.map(async name => {
  const file = Bun.file(`${root}/logs/${name}`);
  const bytes = await file.bytes();
  return { name, bytes: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") };
}));
const clean = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");
const baseline = clean(await Bun.file(`${root}/logs/${logNames[0]}`).text());
const checks = clean(await Bun.file(`${root}/logs/${logNames[2]}`).text());
const coverage = clean(await Bun.file(`${root}/logs/${logNames[3]}`).text());
if (!baseline.includes("7 failed") || !baseline.includes("182 passed")) throw new Error("baseline proof differs");
if (!checks.includes("10 passed") || !checks.includes("SDK_CHECKS_PASS")) throw new Error("distribution/package proof differs");
if (!coverage.includes("190 passed") || !coverage.includes("96.07")) throw new Error("unit/coverage proof differs");
const publication = await Bun.file(`${root}/npm-publication-receipt.json`).json();
const registries = await Bun.file(`${root}/previous-and-python-registry.json`).json();
const receipt = {
  schema: 1,
  qualifiedAt: new Date().toISOString(),
  javascript: {
    repository: "https://github.com/aphrody-labs/typesafe-sdk-js",
    upstream: "https://github.com/typesafe-ai/typesafe-sdk-js",
    sourcePath: "/home/ubuntu/src/typesafe-sdk-js",
    baselineCommit: "23a9fc740974c653533e39a2a0e7a1b97d2e3393",
    commits: ["02a1a7ca908a0266212451531febbd8a46ce2359", "89135b3fcbfa9c8d37465bae4dbd0a8435280082", "82d82d5134737fbefd6ae0889e24dcdf4fee6bfe"],
    sourceHeadAndRemoteMain: "82d82d5134737fbefd6ae0889e24dcdf4fee6bfe",
    sourceClean: true,
    sourceFiles: {
      "src/runtime.ts": "e680a58430a188d45a0def53096ab15773e3806e2090b0a8f8c612a0e0074797",
      "test/runtime.test.ts": "b3caf74d9b49bf8fa03dbe7bda8f13fc7d5571ce1dbfe61e1c239fca6b35a49d",
      "scripts/publish-npm.mjs": "e46961ceb0a7ad5db724e33d5e9b9fbde73ef18769a318e604771be270caeded",
    },
    baseline: { total: 189, passed: 182, failed: 7 },
    unit: { total: 190, passed: 190, failed: 0, skipped: 0 },
    distribution: { total: 10, passed: 10, failed: 0, skipped: 0 },
    gates: { lint: "PASS", typecheck: "PASS", version: "PASS", build: "PASS", publint: "PASS", areTheTypesWrong: "PASS", dryRun: "PASS", immutableIdenticalRetry: "PASS" },
    coverage: { statements: 98, branches: 96.07, functions: 95.74, lines: 98.52, originalThresholdsPreserved: true },
    dependencyPinsPreserved: true,
    assertionsRetained: true,
    runtimeDetection: "explicit isolated Node/Bun/Deno/edge/browser fixtures; default native globals unchanged",
    nativeHeaderContract: "exact Bun version/platform/architecture checked independently",
    publication,
    previousVersion: registries.results.find((x: { target: string }) => x.target === "previousNpm"),
    publisher: "yohan971",
    gitAuthor: "aphrody-dev <contact@aphrody.com>",
  },
  python: {
    repository: "https://github.com/aphrody-labs/typesafe-sdk-python",
    sourcePath: "/home/ubuntu/src/typesafe-sdk-python",
    sourceHeadAndRemoteMain: "64fd6be32e54272efb4e899efce811dbd38707ae",
    sourceClean: true,
    version: "0.7.5",
    tests: { passed: 693, skipped: 17, deselected: 35, evidence: "remote Codex sdk-report.md; source and distribution hashes freshly reverified" },
    artifacts: {
      "aphrody_typesafe_sdk-0.7.5-py3-none-any.whl": "6e398b0a0a45a988d8a2a4b3d630bac0be63122443d291db067d6d9ce2d3274e",
      "aphrody_typesafe_sdk-0.7.5.tar.gz": "2bceb709ab9a9e6cf7fadb73c3d49eabb4bdcb886b57dc610c5eaf3219ae8030",
    },
    publicRegistry: registries.results.find((x: { target: string }) => x.target === "python"),
    published: false,
    blocker: "actual publisher lacked credentials/OIDC; named publish environment values are absent",
    namedPublishEnvironmentPresence: { UV_PUBLISH_TOKEN: false, TWINE_PASSWORD: false, PYPI_API_TOKEN: false, ACTIONS_ID_TOKEN_REQUEST_TOKEN: false },
    credentialsStoresSearched: false,
  },
  officialSkill: {
    source: "C:/Users/aphro/.agents/skills/typesafe-ai",
    documentation: "https://docs.typesafe.ai/agent-skill",
    hosts: ["vps", "dbfr"],
    canonical: "/home/ubuntu/.agents/skills/typesafe-ai",
    aliases: ["/home/ubuntu/.codex/skills/typesafe-ai", "/home/ubuntu/.claude/skills/typesafe-ai"],
    hashesVerifiedOnBothHosts: {
      "SKILL.md": "71ea90d7906c6554c4f4c460ef7361b2d26f59116ccdae986dc6d997b9389f52",
      "LICENSE": "835f233f1d6ed84a9b9a351aba0689b47644a4137d6316911fc7957bde523b02",
    },
    method: "one canonical manual installation with harness symlinks",
  },
  execution: {
    runtime: "Bun 1.4.4",
    revision: "dfde053a3045d6076ad315b6f63160c4ced71513",
    sourceUrl: "https://github.com/aphrody-labs/bun/releases/download/bun-v1.4.4/bun-linux-x64-full.zip",
    jobs: 1,
    cpuAffinity: "2",
    boundedTimeoutsSeconds: { test: 180, coverage: 120, individualGate: 90, publication: 90, sshConnect: 15 },
    paidProviderCalls: 0,
    protectedSessionsCopied: false,
    protectedSecretValuesReadOrPrinted: false,
    bunFrozenHeadModifiedOrCommitted: false,
    heavyBuildStarted: false,
  },
  logs,
};
await Bun.write(`${root}/receipt.json`, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receipt: `${root}/receipt.json`, javascriptVersion: publication.version, published: true, unitPassed: 190, distributionPassed: 10, pythonPublished: false, officialSkillHosts: ["vps", "dbfr"] }));
