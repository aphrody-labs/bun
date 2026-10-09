// Checks generated WinRT families against the real Windows SDK ABI headers (Include\<sdk>\winrt\<namespace>.h):
// interface IIDs, vtable slot order and ABI parameter counts.
//   bun scripts/aphrody/winrt/verify.ts [--sdk 10.0.26100.0] Windows.System.Profile ...
// Reads the headers in place; nothing from them is written anywhere.
import { join } from "node:path";
import { loadModel } from "./gen.ts";

const args = process.argv.slice(2);
const sdkIndex = args.indexOf("--sdk");
const sdk = sdkIndex >= 0 ? args.splice(sdkIndex, 2)[1] : "10.0.26100.0";
const kits = process.env.WindowsSdkDir ?? "C:/Program Files (x86)/Windows Kits/10";
const model = loadModel(join(kits, "UnionMetadata", sdk, "Windows.winmd"));

let checked = 0;
let methods = 0;
const failures: string[] = [];
const absent: string[] = [];
for (const ns of args) {
  const header = await Bun.file(join(kits, "Include", sdk, "winrt", `${ns.toLowerCase()}.h`)).text();
  const data = model.get(ns);
  if (!data) throw new Error(`namespace ${ns} not in metadata`);
  for (const [full, desc] of Object.entries(data.interfaces) as [string, { iid: string; methods: any[] }][]) {
    const name = full.slice(ns.length + 1);
    const cName = `__x_ABI_C${ns.replaceAll(".", "_C")}_C${name}`;
    const block =
      header.indexOf(` * Interface ${full}\n`) >= 0
        ? header.indexOf(` * Interface ${full}\n`)
        : header.indexOf(` * Interface ${full}\r\n`);
    if (block < 0) {
      absent.push(full);
      continue;
    }
    const iid = /MIDL_INTERFACE\("([0-9A-Fa-f-]+)"\)/.exec(header.slice(block, block + 4000))?.[1]?.toLowerCase();
    if (iid !== desc.iid) failures.push(`${full}: IID ${desc.iid} != header ${iid}`);
    const vtblStart = header.indexOf(`typedef struct ${cName}Vtbl`);
    const vtblEnd = header.indexOf("END_INTERFACE", vtblStart);
    if (vtblStart < 0 || vtblEnd < 0) {
      failures.push(`${full}: C vtable ${cName}Vtbl missing`);
      continue;
    }
    const entries = [...header.slice(vtblStart, vtblEnd).matchAll(/STDMETHODCALLTYPE\* (\w+)\)\(([^;]*)\);/g)].map(
      m => ({
        name: m[1],
        params: m[2].split(",").length - 1,
      }),
    );
    const abi = entries.slice(6);
    if (abi.length !== desc.methods.length)
      failures.push(`${full}: ${desc.methods.length} methods != header ${abi.length}`);
    desc.methods.forEach(([mname, slot, params, ret, unsupported]: any, i: number) => {
      const h = abi[i];
      methods++;
      if (!h || h.name !== mname || slot !== i + 6) {
        failures.push(`${full}.${mname}: slot ${slot} != header ${h?.name}@${i + 6}`);
        return;
      }
      if (unsupported?.startsWith("array")) return;
      const count = params.length + (ret ? 1 : 0);
      if (count !== h.params) failures.push(`${full}.${mname}: ${count} ABI params != header ${h.params}`);
    });
    checked++;
  }
}
console.log(
  `${checked} interfaces, ${methods} methods checked against Include\\${sdk}\\winrt; ${failures.length} mismatches`,
);
for (const f of failures.slice(0, 30)) console.log("  " + f);
if (absent.length) console.log(`in Windows.winmd, absent from the ${sdk} headers: ${absent.join(", ")}`);
process.exit(failures.length ? 1 : 0);
