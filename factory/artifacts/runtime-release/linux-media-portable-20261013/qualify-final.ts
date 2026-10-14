import { qualifyLinuxMediaSDK } from "../../../../scripts/aphrody/media-sdk-factory";
import { verifyMediaSDKLayout } from "../../../../packages/bun-video/src/sdk";
import { join } from "node:path";

const factory = "/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk";
const ffmpeg = join(factory, "ffmpeg-linux-x64-portable");
const mpv = join(factory, "mpv-linux-x64-portable");
const sourceCommit = "165df62bc02539eaa74e29126355a860e0738405";
async function run(argv: string[]) {
  await using child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", timeout: 20_000 });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (await child.exited) throw new Error(`qualification failed: ${argv[0]}\n${stderr.slice(0, 4096)}`);
  return stdout;
}
const raw = new Uint8Array(64 * 64 * 4);
for (let i = 0; i < raw.length; i += 4) { raw[i] = 255; raw[i + 3] = 255; }
await Bun.write(join(ffmpeg, "red-source.rgba"), raw);
const executable = join(ffmpeg, "prefix/bin/ffmpeg");
await run([executable, "-v", "error", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "64x64", "-framerate", "1", "-i", join(ffmpeg, "red-source.rgba"), "-frames:v", "1", "-c:v", "png", "-threads", "1", "-filter_threads", "1", "-y", join(ffmpeg, "red.png")]);
await run([executable, "-v", "error", "-i", join(ffmpeg, "red.png"), "-frames:v", "1", "-pix_fmt", "rgba", "-f", "rawvideo", "-threads", "1", "-filter_threads", "1", "-y", join(ffmpeg, "red-decoded.rgba")]);
const decoded = await Bun.file(join(ffmpeg, "red-decoded.rgba")).bytes();
if (decoded.length !== raw.length || decoded.some((byte, i) => byte !== raw[i])) throw new Error("PNG pixel roundtrip differs");
await run([executable, "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=4", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=8000", "-frames:v", "4", "-t", "1", "-c:v", "ffv1", "-c:a", "pcm_s16le", "-threads", "1", "-filter_threads", "1", "-y", join(ffmpeg, "fixture.mkv")]);
const probe = JSON.parse(await run([join(ffmpeg, "prefix/bin/ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", join(ffmpeg, "fixture.mkv")]));
const video = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
const audio = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "audio");
if (video?.codec_name !== "ffv1" || video.width !== 64 || video.height !== 64 || audio?.codec_name !== "pcm_s16le") throw new Error("synthetic media metadata differs");
const frames = await run([executable, "-v", "error", "-i", join(ffmpeg, "fixture.mkv"), "-map", "0:v:0", "-f", "framemd5", "-threads", "1", "-filter_threads", "1", "-"]);
if (frames.split("\n").filter(line => /^0,/.test(line)).length !== 4) throw new Error("video frame count differs");
const api = (await run(["/home/ubuntu/build/tmp/media-sdk-mpv-probe", join(ffmpeg, "fixture.mkv")])).trim();
if (api !== "MPV_API_PASS major=2 minor>=5 cpu=64x64 pause=roundtrip end=EOF") throw new Error("MPV API qualification differs");
const cli = await run([join(mpv, "prefix/bin/mpv"), "--no-config", "--vo=null", "--ao=null", "--hwdec=no", "--vd-lavc-threads=1", join(ffmpeg, "fixture.mkv")]);
if (!cli.includes("VO: [null] 64x64") || !cli.includes("Exiting... (End of file)")) throw new Error("MPV CLI qualification differs");
for (const [component, owner, sourceRevision] of [
  ["ffmpeg", ffmpeg, "7e93014c5bbb61e7c22afebb478bf92f7a08d59a"],
  ["mpv", mpv, "c3ac7f39514c7f45bc38a18e66887240539ee33c"],
] as const) {
  const source = join("/home/ubuntu/src", component);
  if ((await run(["git", "-C", source, "rev-parse", "HEAD"])).trim() !== sourceRevision || (await run(["git", "-C", source, "status", "--porcelain"])).trim()) throw new Error("qualification source pin changed");
  const linuxABI = await qualifyLinuxMediaSDK("linux-x64", join(owner, "prefix"));
  const layout = await verifyMediaSDKLayout(component, "linux-x64", join(owner, "prefix"));
  const licenses = Object.fromEntries(await Promise.all(layout.licenses.map(async name => [name, new Bun.CryptoHasher("sha256").update(await Bun.file(join(owner, "prefix", name)).bytes()).digest("hex")])));
  const receipt = { schema: 1, component, target: "linux-x64", sourceCommit, noticesCommit: "d3916f15622783ed9add7cd65d55f56c00177093", sourceRevision, sourceClean: true, passed: true, linuxABI, layout, licenses, functional: component === "ffmpeg" ? { PNG: { exactRGBABytes: raw.length, dimensions: [64, 64] }, video: { codec: "ffv1", frames: 4, dimensions: [64, 64] }, audio: { codec: "pcm_s16le", sampleRate: 8000 } } : { api, cli: { nullOutput: true, dimensions: [64, 64], EOF: true } }, oldGLIBCExecution: "not-performed", graphics: "not-qualified", archivePublished: false };
  await Bun.write(join(owner, "native-qualification-portable.json"), JSON.stringify(receipt, null, 2));
  await Bun.write(join(owner, "linux-abi.json"), JSON.stringify(linuxABI, null, 2));
  console.log(JSON.stringify({ component, passed: true, maximumGLIBC: linuxABI.maximumGLIBC, ELFMembers: linuxABI.files.length }));
}
