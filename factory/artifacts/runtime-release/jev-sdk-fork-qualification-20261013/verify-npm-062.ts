const expected = "0.6.2";
const packageName = "@aphrody/typesafe-sdk";
const base = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
async function metadata(url: string) {
  const response = await fetch(url, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`PUBLIC_REGISTRY_HTTP_${response.status}`);
  return response.json();
}
const [version, index] = await Promise.all([metadata(`${base}/${expected}`), metadata(base)]);
if (version.name !== packageName || version.version !== expected || index["dist-tags"].latest !== expected) throw new Error("public npm version/tag differ");
// Read the exact expected integrity supplied by the package producer receipt.
const integrityFile = "factory/artifacts/runtime-release/jev-sdk-fork-qualification-20261013/expected-integrity.txt";
const actualExpectedIntegrity = (await Bun.file(integrityFile).text()).trim();
if (version.dist?.integrity !== actualExpectedIntegrity) throw new Error("public npm tarball differs from the qualified bytes");
const tarballURL = new URL(version.dist.tarball);
if (tarballURL.protocol !== "https:" || tarballURL.hostname !== "registry.npmjs.org" || tarballURL.username || tarballURL.password) throw new Error("npm artifact URL differs from its owner");
const archive = await fetch(tarballURL, { signal: AbortSignal.timeout(15_000) });
if (!archive.ok) throw new Error(`PUBLIC_TARBALL_HTTP_${archive.status}`);
const bytes = await archive.bytes();
if (bytes.length > 4 * 1024 * 1024) throw new Error("SDK tarball exceeded its bound");
const digest = `sha512-${new Bun.CryptoHasher("sha512").update(bytes).digest("base64")}`;
if (digest !== actualExpectedIntegrity) throw new Error("public SDK download digest differs");
const receipt = { schema: 1, package: packageName, version: expected, tag: "latest", tarballURL: tarballURL.href, bytes: bytes.length, integrity: digest, publisher: version._npmUser?.name ?? null, repository: version.repository?.url ?? null, sourceCommit: "82d82d5134737fbefd6ae0889e24dcdf4fee6bfe", registryGitHead: version.gitHead ?? null, verifiedAt: new Date().toISOString(), provenanceOIDC: "not-requested-no-OIDC-available" };
await Bun.write("factory/artifacts/runtime-release/jev-sdk-fork-qualification-20261013/npm-publication-receipt.json", JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
