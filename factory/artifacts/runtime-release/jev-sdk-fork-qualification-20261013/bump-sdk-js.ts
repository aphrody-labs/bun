const root = "/home/ubuntu/src/typesafe-sdk-js/";
for (const file of ["package.json", "package-lock.json", "jsr.json"]) {
  const value = await Bun.file(root + file).json();
  if (value.version !== "0.6.1") throw new Error(`SDK metadata pin changed: ${file}`);
  value.version = "0.6.2";
  if (file === "package-lock.json") {
    if (value.packages[""].version !== "0.6.1") throw new Error("SDK lock metadata pin changed");
    value.packages[""].version = "0.6.2";
  }
  await Bun.write(root + file, JSON.stringify(value, null, 2) + "\n");
}
const version = root + "src/version.ts";
const content = await Bun.file(version).text();
if (!content.includes('VERSION = "0.6.1"')) throw new Error("SDK runtime version changed");
await Bun.write(version, content.replace('VERSION = "0.6.1"', 'VERSION = "0.6.2"'));
const lock = root + "bun.lock";
const original = await Bun.file(lock).text();
if (!original.includes('"name": "@typesafe-ai/sdk"')) throw new Error("SDK Bun workspace metadata changed");
await Bun.write(lock, original.replace('"name": "@typesafe-ai/sdk"', '"name": "@aphrody/typesafe-sdk"'));
console.log("SDK_NEXT_PATCH_METADATA_READY 0.6.2");
