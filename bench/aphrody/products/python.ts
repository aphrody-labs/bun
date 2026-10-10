import { Python } from "bun:python";
using python = Python.open();
python.run("import os; assert os.getpid() == " + process.pid);
const mode = process.env.BENCH_MODE;
if (mode === "bridge") {
  for (let i = 0; i < 50000; i++) python.eval("20 + 22");
  const start = performance.now();
  let value = "";
  for (let i = 0; i < 100000; i++) value = python.eval("20 + 22");
  console.log("BENCH_RESULT " + JSON.stringify({ value, workMs: (performance.now() - start) / 10 }));
} else {
  python.run(
    await Bun.file(new URL("./python.py", import.meta.url))
      .text()
      .then(source => source.replace('if __name__ == "__main__":', "if False:")),
  );
  console.log(
    "BENCH_RESULT " +
      JSON.stringify({ value: python.evalJSON("__bench_value"), workMs: python.evalJSON("__bench_work_ms") }),
  );
}
