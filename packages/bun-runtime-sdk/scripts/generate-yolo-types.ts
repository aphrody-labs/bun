// Generated declarations stay owned by packages/bun-types/yolo.d.ts.
const canonical = await Bun.file(new URL("../../bun-types/yolo.d.ts", import.meta.url)).text();
const prefix = 'declare module "bun:yolo" {\n';
const boundary = '\n}\n\ndeclare module "bun:Yolo" {';
const end = canonical.indexOf(boundary);
if (!canonical.startsWith(prefix) || end < prefix.length || canonical.indexOf(boundary, end + 1) !== -1)
  throw new Error("Canonical Yolo declaration module boundary changed");
const body = canonical.slice(prefix.length, end) + "\n";
const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
await Bun.write(new URL("../src/yolo-types.d.ts", import.meta.url), body);
await Bun.write(
  new URL("../src/yolo-types-source.json", import.meta.url),
  JSON.stringify(
    {
      schema: "bun-runtime-sdk-yolo-types/v1",
      source: "packages/bun-types/yolo.d.ts",
      sourceSha256: sha256(canonical),
      declarationSha256: sha256(body),
    },
    null,
    2,
  ) + "\n",
);
