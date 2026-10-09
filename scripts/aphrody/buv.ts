import { resolve } from "node:path";
import { indexCargo } from "./pyjs-index.ts";
import { runRecorded } from "./pyjs-runs.ts";
import { BunPython } from "./pyjs-store.ts";

const root = resolve(import.meta.dir, "../..");
const actions = {
  check: ["check", "--workspace", "--locked", "--no-default-features"],
  test: ["test", "--workspace", "--locked", "--no-default-features", "--lib"],
  lint: ["clippy", "--workspace", "--locked", "--no-default-features", "--", "-D", "warnings"],
  fmt: ["fmt", "--all", "--check"],
  metadata: ["metadata", "--format-version=1", "--locked"],
  docs: ["doc", "--workspace", "--locked", "--no-default-features", "--no-deps"],
  embedded: ["run", "bd", "test", "test/js/first_party/runtime/python-cli.test.ts"],
} satisfies Record<string, string[]>;
const action = process.argv[2] as keyof typeof actions;
if (!Object.hasOwn(actions, action))
  throw new Error(`Expected uv workspace command: ${Object.keys(actions).join(", ")}`);
using registry = new BunPython();
const cargoCommand: unknown = process.env.BUN_UV_CARGO_COMMAND
  ? JSON.parse(process.env.BUN_UV_CARGO_COMMAND)
  : ["cargo"];
if (
  !Array.isArray(cargoCommand) ||
  !cargoCommand.length ||
  cargoCommand.some(arg => typeof arg !== "string" || !arg.length)
) {
  throw new Error("BUN_UV_CARGO_COMMAND must be a nonempty JSON array of command arguments");
}
const command = [
  ...(action === "embedded" ? [process.execPath] : cargoCommand),
  ...actions[action],
  ...process.argv.slice(3),
];
const cwd = action === "embedded" ? root : resolve(root, "vendor/uv");
const output = action === "metadata" ? resolve(root, "tmp/bun-python/cargo-uv-resolved.json") : undefined;
const code = await runRecorded(registry, `buv-${action}`, command, cwd, output);
if (output && code === 0) {
  indexCargo(registry, registry.repository("uv", "source", cwd), await Bun.file(output).json());
}
globalThis.process.exitCode = code;
