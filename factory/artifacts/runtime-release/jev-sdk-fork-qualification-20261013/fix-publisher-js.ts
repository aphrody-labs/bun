const file = "/home/ubuntu/src/typesafe-sdk-js/scripts/publish-npm.mjs";
const original = await Bun.file(file).text();
const before = '["publish", tarball, "--access", "public", "--tag", "latest", "--provenance"]';
if (!original.includes(before)) throw new Error("Publisher source changed");
await Bun.write(file, original.replace(before, '["publish", tarball, "--access", "public", "--tag", "latest", "--ignore-scripts"]'));
console.log("SDK_PUBLISHER_NATIVE_FLAGS_READY");
