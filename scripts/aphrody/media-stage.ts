import { isAbsolute, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const prefix = resolve(Bun.env.BUN_MEDIA_PREFIX ?? join(root, "build/media"));
const destination = process.argv[2];
const apply = process.argv[3] === "--apply";
if (!destination || !isAbsolute(destination)) throw new Error("usage: bun run media:stage ABS_BUN_DIRECTORY [--apply]");
if (process.platform !== "win32") throw new Error("Windows native bundle staging currently required");
if (!(await Bun.file(join(destination, "bun.exe")).exists())) throw new Error("Destination must contain bun.exe");
const source = join(prefix, "bin");
const names = ["ffmpeg.exe", "ffprobe.exe"];
for await (const name of new Bun.Glob("*.dll").scan(source)) names.push(name);
for (const required of [
  "mpv-2.dll",
  "bun_video_native.dll",
  "avcodec-63.dll",
  "avformat-63.dll",
  "avutil-61.dll",
  "avfilter-12.dll",
  "swscale-10.dll",
  "swresample-7.dll",
  "avdevice-63.dll",
])
  if (!names.includes(required)) throw new Error(`Missing native asset ${required}`);
const files = [];
for (const name of names.sort()) {
  const bytes = await Bun.file(join(source, name)).arrayBuffer();
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const target = Bun.file(join(destination, name));
  if (await target.exists()) {
    const existing = new Bun.CryptoHasher("sha256").update(await target.arrayBuffer()).digest("hex");
    if (existing !== sha256) throw new Error(`Destination asset differs: ${name}`);
  }
  files.push({ name, sha256, bytes: bytes.byteLength });
}
if (apply) {
  for (const { name } of files) await Bun.write(join(destination, name), Bun.file(join(source, name)));
  await Bun.write(join(destination, "bun-media.json"), JSON.stringify({ schemaVersion: 1, files }, null, 2));
}
console.log(JSON.stringify({ applied: apply, destination, files }, null, 2));
