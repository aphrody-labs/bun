// S3 and S4, runtime lane (node:vm on both sides, METHOD C9 and C11):
//   s3      100 empty vm.createContext()
//   s4.cold eval of a generated script, unique filename, no cache
//   s4.cache the same with cachedData produced once by createCachedData()
import vm from "node:vm";
import { measureSync, report } from "./common.mjs";

let src = "var total = 0;\n";
for (let i = 0; i < 2000; i++)
  src += `function f${i}(a) { return (a * ${i + 1}) % 1009; }\ntotal = (total + f${i}(${i})) % 1000003;\n`;
src += "total;\n";

const producer = new vm.Script(src, { filename: "arena-realm-producer.js" });
const cachedData = typeof producer.createCachedData === "function" ? producer.createCachedData() : undefined;
let seq = 0;
let rejected = 0;

function evalIn(withCache) {
  const ctx = vm.createContext({});
  const filename = `arena-realm-${withCache ? "c" : "f"}-${seq++}.js`;
  const script =
    withCache && cachedData?.length ? new vm.Script(src, { filename, cachedData }) : new vm.Script(src, { filename });
  if (withCache && script.cachedDataRejected) rejected++;
  return script.runInContext(ctx);
}

const s3 = measureSync("s3", () => {
  for (let i = 0; i < 100; i++) vm.createContext({});
  return 100;
});
const cold = measureSync("s4.cold", () => evalIn(false));
const cached = measureSync("s4.cache", () => evalIn(true));

report(
  "realm",
  "runtime",
  { s3, "s4.cold": cold, "s4.cache": cached },
  { cachedDataBytes: cachedData?.length ?? 0, cachedDataRejected: rejected },
);
