const probes = "/home/ubuntu/build/tmp/media-sdk-abi-probes-20261013";
const targets = ["x64-gnu", "arm64-gnu", "x64-musl", "arm64-musl"];
const results = [];
for (const target of targets) {
  const binary = Bun.file(`${probes}/${target}`);
  const output = (await Bun.file(`${probes}/${target}.log`).text()).trim();
  if (output !== "ABI_FUNCTIONAL_PASS math=10 fcntl=noarg,int,64bit-lock glob=offsets,two-paths") throw new Error("adapter functional probe failed");
  const versions = await Bun.file(`${probes}/${target}.versions.txt`).text();
  const glibcVersions = [...new Set(versions.match(/GLIBC_[0-9.]+/g) ?? [])].sort((a, b) => {
    const left = a.slice(6).split(".").map(Number), right = b.slice(6).split(".").map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const diff = (left[i] ?? 0) - (right[i] ?? 0);
      if (diff) return diff;
    }
    return 0;
  });
  if (target.endsWith("musl") && glibcVersions.length) throw new Error("musl requires glibc");
  results.push({ target, execution: target.startsWith("arm64") ? "qemu-aarch64-sysroot" : target.endsWith("musl") ? "sysroot-musl-loader" : "native-host", output, sha256: new Bun.CryptoHasher("sha256").update(await binary.bytes()).digest("hex"), requiredGLIBC: glibcVersions });
}
const receipt = { schema: 1, sourceCommit: "165df62bc02539eaa74e29126355a860e0738405", adapterProbesPassed: true, SDKBuildsWithELFAndCPUProof: ["linux-x64"], finalSDKBundleQualification: "GNU-x64-ELF-closure-functional-PNG-MPV-pass", completeSDKBuildsPending: ["linux-arm64", "linux-x64-musl", "linux-arm64-musl"], hostLibcChanged: false, results };
await Bun.write(`${probes}/receipt.json`, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ adapterProbesPassed: true, targets: targets.length }));
