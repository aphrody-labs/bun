// Correctness guard for the bun_internal_modules_data blob layout
// (src/codegen/bundle-modules.ts + bundle-functions.ts): the WebCoreJSBuiltins
// function sources sit at offset 0, internal module sources follow at generated
// offsets. A wrong offset or length here surfaces as a SyntaxError when JSC
// parses a module or a @-intrinsic builtin function from the blob.
import { expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { join } from "node:path";
import { sliceSourceCode } from "../../src/codegen/builtin-parser.ts";
import { createInternalModuleRegistry } from "../../src/codegen/internal-module-registry-scanner.ts";

test("builtin requires resolve the module at registry index zero", () => {
  using dir = tempDir("internal-module-zero", {
    "src/js/bun/a.ts": "export default {};",
    "src/js/node/a.ts": "export default {};",
    "src/js/internal/a.ts": "export default {};",
    "src/js/thirdparty/a.ts": "export default {};",
    "src/jsc/modules/NativeModuleList.h": 'macro("node:buffer"_s, Buffer)',
  });
  const registry = createInternalModuleRegistry(join(String(dir), "src/js"));
  expect(registry.moduleList[0]).toBe("bun/a.ts");
  expect(registry.requireTransformer("bun:a", "bun/consumer.ts")).toBe(
    "(__intrinsic__getInternalField(__intrinsic__internalModuleRegistry, 0/*bun:a*/) || __intrinsic__createInternalModuleById(0/*bun:a*/))",
  );
});

test("module preprocessing extracts declarations without changing embedded worker sources", () => {
  const declarations = [
    'import type { WorkerOptions } from "worker-types";',
    'import value, { named as alias } from "values";',
    'import * as namespace from "namespace";',
    'import "side-effects";',
  ];
  const body = [
    'const worker = `import { parentPort } from "node:worker_threads"; export {};`;',
    "const quoted = \"import { value } from 'strings'; export {};\";",
    "const expression = /import { value } from 'regex'; export {};/;",
    '// import { value } from "line-comment"; export {};',
    '/* import { value } from "block-comment"; export {}; */',
    'const escaped = `\\` import { value } from "escaped"; \\${notAnInterpolation}`;',
    'const nested = `outer ${`import { value } from "nested"; export {};`}`;',
    'const dynamic = import("dynamic-module");',
    "export default worker;",
  ].join("\n");
  const imports: string[] = [];
  const { result, rest } = sliceSourceCode(
    "{" + declarations.join("\n") + "\n" + body + "\nexport {};\n}",
    false,
    undefined,
    false,
    imports,
  );
  expect(imports).toEqual(declarations);
  expect(result).toBe("{" + "\n".repeat(declarations.length) + body + "\n\n}");
  expect(rest).toBe("");
});

test("module preprocessing retains import attributes and rewrites executable requires", () => {
  const declaration = 'import /* type owner */ type { Options }\nfrom /* source */ "types";';
  const attributed = 'import data from "data.json" with { type: "json", note: "export {};" };';
  const imports: string[] = [];
  const { result, rest } = sliceSourceCode(
    "{" + declaration + "\n" + attributed + '\nconst value = `${require("node:path")}`;\nexport default value;\n}',
    true,
    specifier => `load(${JSON.stringify(specifier)})`,
    false,
    imports,
  );
  expect(imports).toEqual([declaration, attributed]);
  expect(result).toContain('const value = `${load("node:path")}`;');
  expect(result).toContain("__intrinsic__exports = value;");
  expect(rest).toBe("");
});

test("internal JS builtin function and module sources parse from the linked blob", async () => {
  await using proc = Bun.spawn({
    cmd: [
      bunExe(),
      "-e",
      `
        // WebCoreJSBuiltins path: ReadableStream's reader/pipe machinery is all @-intrinsic
        // builtin functions whose source sits at the start of the blob.
        const { readable, writable } = new TransformStream({ transform: (c, ctl) => ctl.enqueue(c) });
        const w = writable.getWriter();
        w.write("blob-ok");
        w.close();
        const [r] = await Promise.all([readable.getReader().read()]);

        // InternalModuleRegistry path: each module's source is a span at a known
        // offset into the same blob (release) or read from disk (debug).
        const assert = require("node:assert");
        assert.strictEqual(require("node:util").format("%s", r.value), "blob-ok");
        assert.strictEqual(require("node:path").posix.join("a", "b"), "a/b");
        require("node:stream");
        require("node:http");

        console.log(r.value);
      `,
    ],
    env: bunEnv,
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect({ stdout: stdout.trim(), stderr, exitCode }).toEqual({ stdout: "blob-ok", stderr: "", exitCode: 0 });
});
