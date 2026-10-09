// PyTorch CUDA en local via uv du fork : bun scripts/aphrody/cuda-torch.ts [--dir D] [--cuda cu130] [--cpu] [--python 3.12] [--dry-run]
// Hôtes serveur : toujours --cpu (index cpu). Aucun accès réseau hors installation des roues.
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const flag = (n: string) => args.includes(`--${n}`);

const dir = opt("dir", join(process.env.APHRODY_HOME ?? join(homedir(), ".aphrody"), "venvs", "torch-cuda"))!;
const python = opt("python", "3.12")!;
const dry = flag("dry-run");

/** Version CUDA maximale du pilote -> suffixe d'index PyTorch (cu130, cu128, cu126). */
export function indexFor(driverCuda: string): string {
  const [maj, min] = driverCuda.split(".").map(Number);
  const v = maj * 10 + (min ?? 0);
  if (v >= 130) return "cu130";
  if (v >= 128) return "cu128";
  return "cu126";
}

async function detect(): Promise<string | null> {
  try {
    const out = await Bun.$`nvidia-smi`.quiet().text();
    return out.match(/CUDA Version:\s*([\d.]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

let target = opt("cuda") ?? "";
if (flag("cpu")) target = "cpu";
else if (!target) {
  const drv = await detect();
  if (!drv) {
    console.error("nvidia-smi absent ou sans GPU : utiliser --cpu");
    process.exit(2);
  }
  target = indexFor(drv);
}
const win = process.platform === "win32";
const py = join(dir, win ? "Scripts/python.exe" : "bin/python");
const steps = [
  ["uv", "venv", "--python", python, dir],
  ["uv", "pip", "install", "--python", py, "torch", "--index-url", `https://download.pytorch.org/whl/${target}`],
];
for (const s of steps) {
  console.log("$", s.join(" "));
  if (!dry && (await Bun.spawn(s, { stdio: ["inherit", "inherit", "inherit"] }).exited) !== 0) process.exit(1);
}
if (dry) process.exit(0);
const check = "import torch;print(torch.__version__,torch.cuda.is_available())";
const env = { ...process.env, VIRTUAL_ENV: dir, BUN_PYTHON_EXECUTABLE: py };
const p = Bun.spawn([process.execPath, "python", "-c", check], { env, stdio: ["inherit", "pipe", "inherit"] });
const out = (await new Response(p.stdout).text()).trim();
console.log(out);
if (target !== "cpu" && !out.endsWith("True")) process.exit(3);
