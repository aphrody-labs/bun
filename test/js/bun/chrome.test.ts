import { expect, test } from "bun:test";
import chrome, * as chromeExports from "bun:chrome";
import chromium, * as chromiumExports from "bun:chromium";
import { builtinModules, createRequire, isBuiltin } from "node:module";

test("Chrome and Chromium share their builtin implementation", () => {
  expect(chrome).toBe(chromium);
  for (const key of Object.keys(chromiumExports)) {
    expect(chromeExports[key as keyof typeof chromeExports]).toBe(chromiumExports[key as keyof typeof chromiumExports]);
  }
  expect(Object.keys(chromeExports).sort()).toEqual(Object.keys(chromiumExports).sort());
});

test("Chrome aliases preserve CommonJS and dynamic import identity", async () => {
  expect(require("bun:chrome")).toBe(require("bun:chromium"));
  expect(createRequire(import.meta.url)("bun:chrome")).toBe(chromium);
  const imported = await import("bun:chrome");
  expect(imported.default).toBe(chromium);
  expect(imported.connect).toBe(chromiumExports.connect);
});

test("Node classifies Chrome and Chromium as builtins", () => {
  expect(isBuiltin("bun:chrome")).toBe(true);
  expect(isBuiltin("bun:chromium")).toBe(true);
  expect(builtinModules).toContain("bun:chrome");
  expect(builtinModules).toContain("bun:chromium");
});

test("Bun bundling resolves Chrome to the canonical Chromium runtime external", async () => {
  const result = await Bun.build({
    entrypoints: ["chrome-entry"],
    target: "bun",
    plugins: [
      {
        name: "chrome-test-entry",
        setup(builder) {
          builder.onResolve({ filter: /^chrome-entry$/ }, () => ({
            path: "entry",
            namespace: "chrome-test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "chrome-test" }, () => ({
            contents: 'import chrome from "bun:chrome"; export default chrome;',
            loader: "js",
          }));
        },
      },
    ],
  });
  expect(result.success).toBe(true);
  expect(result.outputs).toHaveLength(1);
  expect(await result.outputs[0].text()).toContain('from "bun:chromium"');
});
