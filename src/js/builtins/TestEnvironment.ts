// The window of a `@jest-environment jsdom|happy-dom` (or `@vitest-environment`) docblock, loaded from the test
// file's own dependencies. Jest runs such a file with the window as its global; here the window's members are
// installed on globalThis instead, and the returned function puts the previous ones back. The jsdom options are
// the ones of jest-environment-jsdom (MIT, Copyright Meta Platforms, Inc. and affiliates).
export function installTestEnvironment(name: string, requireFromTest: Function) {
  const tryRequire = (from: Function, id: string) => {
    let resolved;
    try {
      resolved = from.resolve(id);
    } catch {
      return undefined;
    }
    return from(resolved);
  };
  // jsdom or happy-dom installed only as a dependency of the Jest environment package.
  const requireBeside = (packageName: string, id: string) => {
    let resolved;
    try {
      resolved = requireFromTest.resolve(packageName + "/package.json");
    } catch {
      return undefined;
    }
    return tryRequire(requireFromTest("node:module").createRequire(resolved), id);
  };

  let window;
  switch (name) {
    case "node":
    case "bun":
      return undefined;
    case "jsdom":
    case "jest-environment-jsdom": {
      const jsdom = tryRequire(requireFromTest, "jsdom") ?? requireBeside("jest-environment-jsdom", "jsdom");
      if (!jsdom) throw new Error(`Test environment "${name}" needs "jsdom" or "jest-environment-jsdom" installed`);
      window = new jsdom.JSDOM("<!DOCTYPE html>", {
        pretendToBeVisual: true,
        runScripts: "dangerously",
        url: "http://localhost/",
      }).window;
      break;
    }
    case "happy-dom":
    case "@happy-dom/jest-environment": {
      const happyDOM =
        tryRequire(requireFromTest, "happy-dom") ?? requireBeside("@happy-dom/jest-environment", "happy-dom");
      if (!happyDOM)
        throw new Error(`Test environment "${name}" needs "happy-dom" or "@happy-dom/jest-environment" installed`);
      window = new happyDOM.Window({ url: "http://localhost/" });
      break;
    }
    default:
      throw new Error(`Test environment "${name}" is not supported; use "node", "jsdom" or "happy-dom"`);
  }

  // The window's own copy of the language globals stays out, and so do the timers (jest.useFakeTimers() fakes
  // Bun's), the console, and the APIs the window lacks or only partly has.
  const kept = new Set([
    "Object",
    "Function",
    "Array",
    "Number",
    "Boolean",
    "String",
    "Symbol",
    "BigInt",
    "Date",
    "Promise",
    "RegExp",
    "Error",
    "AggregateError",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
    "SuppressedError",
    "JSON",
    "Math",
    "Intl",
    "Reflect",
    "Proxy",
    "Atomics",
    "WebAssembly",
    "Iterator",
    "ArrayBuffer",
    "SharedArrayBuffer",
    "DataView",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float16Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "WeakRef",
    "FinalizationRegistry",
    "DisposableStack",
    "AsyncDisposableStack",
    "globalThis",
    "undefined",
    "NaN",
    "Infinity",
    "eval",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    "unescape",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "setImmediate",
    "clearImmediate",
    "queueMicrotask",
    "structuredClone",
    "console",
    "crypto",
    "performance",
    "fetch",
    "process",
    "Buffer",
    "global",
    "self",
  ]);
  const saved: [string, PropertyDescriptor | undefined][] = [];
  const install = (key: string, descriptor: PropertyDescriptor) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    if (previous?.configurable === false) return;
    saved.push([key, previous]);
    Object.defineProperty(globalThis, key, { ...descriptor, configurable: true });
  };

  // Read through the window, so its getters (document, location, innerWidth, localStorage) see the window as `this`.
  for (const key of Object.getOwnPropertyNames(window)) {
    if (kept.$has(key) || key.charCodeAt(0) === 95 /* _ */) continue;
    if (key === "window" || key === "top" || key === "parent" || key === "frames") continue;
    install(key, {
      get: () => window[key],
      set: value => {
        window[key] = value;
      },
      enumerable: false,
    });
  }
  install("window", { value: window, writable: true, enumerable: false });
  // Events dispatched in the document bubble up to the window, so listeners added on globalThis go on the window.
  for (const key of ["addEventListener", "removeEventListener", "dispatchEvent"]) {
    const method = window[key];
    if (typeof method === "function") install(key, { value: method.bind(window), writable: true, enumerable: false });
  }

  return function uninstallTestEnvironment() {
    for (let i = saved.length - 1; i >= 0; i--) {
      const [key, descriptor] = saved[i];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    if (typeof window.happyDOM?.close === "function") window.happyDOM.close();
    else if (typeof window.close === "function") window.close();
  };
}
