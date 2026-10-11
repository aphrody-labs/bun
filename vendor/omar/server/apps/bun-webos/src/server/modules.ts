// SPDX-License-Identifier: Apache-2.0
/**
 * The fork's OS modules (bun:linux, bun:windows, bun:cosmic, bun:wasm), loaded when the running Bun has
 * them. The specifier is computed so a Bun without them still bundles and runs the WebOS; what a module
 * cannot report is kept with its error instead of a placeholder.
 */

export const OS_MODULES = ["bun:linux", "bun:windows", "bun:cosmic", "bun:wasm"] as const;
export type OsModuleName = (typeof OS_MODULES)[number];

export interface OsModuleReport {
  name: OsModuleName;
  available: boolean;
  /** `isSupported` of the module on this host, when it has one. */
  supported: boolean | null;
  facts: Record<string, unknown>;
  errors: Record<string, string>;
}

const cache = new Map<OsModuleName, Promise<any | null>>();

export function loadOsModule<T = any>(name: OsModuleName): Promise<T | null> {
  let pending = cache.get(name);
  if (!pending) {
    const specifier: string = name;
    pending = import(specifier).then(
      mod => mod.default ?? mod,
      () => null,
    );
    cache.set(name, pending);
  }
  return pending;
}

function collect(facts: Record<string, unknown>, errors: Record<string, string>, key: string, read: () => unknown) {
  try {
    facts[key] = read();
  } catch (error) {
    errors[key] = (error as Error).message;
  }
}

export async function osModules(): Promise<OsModuleReport[]> {
  return Promise.all(
    OS_MODULES.map(async name => {
      const mod = await loadOsModule(name);
      const report: OsModuleReport = {
        name,
        available: mod !== null,
        supported: typeof mod?.isSupported === "boolean" ? mod.isSupported : null,
        facts: {},
        errors: {},
      };
      if (!mod || report.supported === false) return report;
      const { facts, errors } = report;
      if (name === "bun:linux") {
        collect(facts, errors, "landlockAbi", () => mod.landlock.abiVersion());
        collect(facts, errors, "cgroup", () => mod.cgroup.current());
        collect(facts, errors, "capabilities", () => mod.capabilities.get());
      } else if (name === "bun:windows") {
        collect(facts, errors, "version", () => mod.version());
        collect(facts, errors, "isElevated", () => mod.isElevated());
        collect(facts, errors, "systemInfo", () => mod.systemInfo());
      } else if (name === "bun:wasm") {
        facts.init = typeof mod === "function" ? "function" : typeof mod;
      }
      return report;
    }),
  );
}
