import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sdkRoot = fileURLToPath(new URL("..", import.meta.url));
async function command(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { output: stdout + stderr, status };
}

test("published SDK includes the complete private Yolo bridge without fixtures", async () => {
  const process = Bun.spawn([Bun.which("bun")!, "pm", "pack", "--dry-run", "--ignore-scripts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  const output = stdout + stderr;
  expect(output).toContain("src/yolo.ts");
  const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json();
  expect(manifest.exports["./yolo"]).toEqual({ types: "./src/yolo-types.d.ts", default: "./src/yolo.ts" });
  for (const name of ["bun_yolo.py", "yolo_runtime.py", "yolo_worker.ts"])
    expect(output).toContain("python/ctypes/" + name);
  expect(output).not.toContain("test_bun_yolo.py");
  expect(output).not.toContain("yolo_worker.test.ts");
  expect(status).toBe(0);
});

test("packed Yolo declarations match the canonical owner and typecheck in an isolated consumer", async () => {
  const root = await mkdtemp(join(tmpdir(), "bun-sdk-yolo-consumer-"));
  try {
    const packed = await command([Bun.which("bun")!, "pm", "pack", "--filename", join(root, "sdk.tgz")], sdkRoot);
    expect(packed.status).toBe(0);
    const installed = join(root, "node_modules/@aphrody/bun-runtime-sdk");
    await mkdir(installed, { recursive: true });
    expect(
      (await command(["tar", "-xzf", join(root, "sdk.tgz"), "--strip-components=1", "-C", installed], root)).status,
    ).toBe(0);
    const canonical = await Bun.file(new URL("../../bun-types/yolo.d.ts", import.meta.url)).text();
    const body = canonical.match(/^declare module "bun:yolo" {\n([\s\S]*?)\n}\n\ndeclare module "bun:Yolo"/);
    expect(body).not.toBeNull();
    const declaration = await Bun.file(join(installed, "src/yolo-types.d.ts")).text();
    expect(declaration).toBe(body![1] + "\n");
    const receipt = await Bun.file(join(installed, "src/yolo-types-source.json")).json();
    expect(receipt.sourceSha256).toBe(new Bun.CryptoHasher("sha256").update(canonical).digest("hex"));
    expect(receipt.declarationSha256).toBe(new Bun.CryptoHasher("sha256").update(declaration).digest("hex"));
    await Bun.write(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ESNext",
          module: "Preserve",
          moduleResolution: "bundler",
          types: [],
          lib: ["ESNext", "DOM"],
          noEmit: true,
          skipLibCheck: false,
        },
        include: ["consumer.ts"],
      }),
    );
    await Bun.write(
      join(root, "consumer.ts"),
      `import Yolo, { choice, decide, noul, selections, type Provider } from "@aphrody/bun-runtime-sdk/yolo";
declare const provider: Provider;
const request = {state: "public fixture", questions: {route: choice("Route?", {supported: "Evidence", uncertain: "Unknown"}), valid: noul("Valid?")}};
const result = await decide(request, {provider});
const route: "supported" | "uncertain" = result.route;
const valid: boolean = result.valid;
const ask: typeof Yolo.ask = Yolo;
const abstain: typeof selections = Yolo.selections;
// @ts-expect-error Choice must preserve the named keys.
const invalid: "absent" = result.route;
void [route, valid, ask, abstain, invalid];
`,
    );
    const checked = await command(
      [Bun.which("bun")!, "check", "--threads=2", "--project", join(root, "tsconfig.json")],
      root,
    );
    expect(checked.output).toContain("No type errors");
    expect(checked.status).toBe(0);
    await Bun.write(join(root, "canonical-yolo.d.ts"), canonical);
    const config = await Bun.file(join(root, "tsconfig.json")).json();
    config.include.push("canonical-yolo.d.ts");
    await Bun.write(join(root, "tsconfig.json"), JSON.stringify(config));
    const dual = await command(
      [Bun.which("bun")!, "check", "--threads=2", "--project", join(root, "tsconfig.json")],
      root,
    );
    expect(dual.output).toContain("No type errors");
    expect(dual.status).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
