import { describe, expect, test } from "bun:test";
import {
  assessCombination,
  buildFeatureAudit,
  featureClosure,
  incompatibleSelections,
  manifestCrate,
  runtimeFlagDeclarations,
  type Combination,
} from "./fusion-features.ts";

describe("Bun OS source feature inventory", () => {
  test("keeps target guards and inherited dependency aliases", () => {
    const crate = manifestCrate(
      `[package]\nname="consumer"\n[dependencies]\nrender={workspace=true,optional=true}\n[target.'cfg(target_os = "linux")'.dependencies]\nwreq={version="=6.0.0-rc.31",features=["prefix-symbols"]}\n[features]\npaint=["render/paint"]`,
      "consumer/Cargo.toml",
      { render: { package: "renderer", features: ["std"] } },
    );
    expect(crate.dependencies[0]).toMatchObject({
      alias: "render",
      package: "renderer",
      optional: true,
      features: ["std"],
    });
    expect(crate.dependencies[1]).toMatchObject({
      target: 'cfg(target_os = "linux")',
      features: ["prefix-symbols"],
    });
  });
  test("traverses local declarations without forcing weak optional dependencies", () => {
    const consumer = manifestCrate(
      `[package]\nname="consumer"\n[dependencies]\nrender={package="renderer",optional=true}\n[features]\nall=["render/paint","render?/serde","dep:render"]`,
      "a/Cargo.toml",
    );
    const render = manifestCrate(`[package]\nname="renderer"\n[features]\npaint=["base"]\nbase=[]`, "b/Cargo.toml");
    expect(featureClosure([consumer, render], ["consumer/all"])).toEqual({
      declared: ["consumer/all", "renderer/base", "renderer/paint"],
      dependencyEdges: ["consumer/dep:render", "consumer/render/paint", "consumer/render?/serde"],
      invalid: [],
    });
  });
  test("cyclic declarations terminate and undeclared flags remain failures", () => {
    const crate = manifestCrate(`[package]\nname="a"\n[features]\na=["b"]\nb=["a"]`, "a/Cargo.toml");
    expect(featureClosure([crate], ["a/a", "a/missing"]).invalid).toEqual(["a/missing"]);
    expect(featureClosure([crate], ["a/a"]).declared).toEqual(["a/a", "a/b"]);
  });
  test("JSC-only policy catches V8 through mandatory workspace dependency edges", () => {
    const browser = manifestCrate(`[package]\nname="browser"\n[dependencies]\njs="1"`, "browser/Cargo.toml");
    const js = manifestCrate(`[package]\nname="js"\n[build-dependencies]\ndeno_core="0.412"`, "js/Cargo.toml");
    const combo: Combination = {
      id: "full",
      packages: ["browser"],
      features: [],
      platforms: ["linux"],
      requirements: [],
      jscOnly: true,
    };
    expect(assessCombination(combo, [browser, js], "linux")).toMatchObject({
      status: "unsupported",
      qualified: false,
    });
    expect(assessCombination(combo, [browser, js], "linux").issues.join(" ")).toContain("V8");
  });
  test("external dependencies and unsupported targets cannot become qualification claims", () => {
    const crate = manifestCrate(`[package]\nname="render"\n[features]\npaint=[]`, "render/Cargo.toml");
    const combo: Combination = {
      id: "paint",
      packages: ["render"],
      features: ["render/paint"],
      platforms: ["linux"],
      requirements: ["native fixtures"],
      jscOnly: true,
    };
    expect(assessCombination(combo, [crate], "linux")).toMatchObject({
      status: "requiring-dependencies",
      qualified: false,
    });
    expect(assessCombination(combo, [crate], "windows").status).toBe("unsupported");
    expect(assessCombination({ ...combo, requirements: [] }, [crate], "linux")).toMatchObject({
      status: "supported",
      qualified: false,
    });
  });
  test("default-enabled optional V8 cannot evade the JSC-only blocker", () => {
    const crate = manifestCrate(
      `[package]\nname="js"\n[dependencies]\ndeno_core={version="0.412",optional=true}\n[features]\ndefault=["dep:deno_core"]`,
      "js/Cargo.toml",
    );
    const combo: Combination = {
      id: "js",
      packages: ["js"],
      features: [],
      platforms: ["linux"],
      requirements: [],
      jscOnly: true,
    };
    expect(assessCombination(combo, [crate], "linux").issues.join(" ")).toContain("V8");
  });
  test("ABI and profile selections report conflicts instead of silently choosing one", () => {
    expect(incompatibleSelections(["pgoUse", "pgoGenerate"], [["pgoUse", "pgoGenerate"]])).toHaveLength(1);
    expect(incompatibleSelections(["webkit=local"], [["webkit=local", "webkit=prebuilt"]])).toEqual([]);
  });
  test("dependency feature requests apply without restoring disabled defaults", () => {
    const consumer = manifestCrate(
      `[package]\nname="consumer"\n[dependencies]\njs={version="1",default-features=false,features=["safe"]}`,
      "consumer/Cargo.toml",
    );
    const js = manifestCrate(
      `[package]\nname="js"\n[dependencies]\ndeno_core={version="1",optional=true}\n[features]\ndefault=["dep:deno_core"]\nsafe=[]`,
      "js/Cargo.toml",
    );
    const combo: Combination = {
      id: "safe",
      packages: ["consumer"],
      features: [],
      platforms: ["linux"],
      requirements: [],
      jscOnly: true,
    };
    const result = assessCombination(combo, [consumer, js], "linux");
    expect(result.status).toBe("supported");
    expect(result.closure.declared).toEqual(["js/safe"]);
  });
  test("workspace defaults retain Cargo inheritance and explicit reenabling", () => {
    const source = '[package]\nname="consumer"\n[dependencies]\njs={workspace=true,default-features=false}';
    expect(manifestCrate(source, "a/Cargo.toml", { js: { version: "1" } }).dependencies[0]!.defaultFeatures).toBe(true);
    expect(
      manifestCrate(source, "a/Cargo.toml", { js: { version: "1", "default-features": false } }).dependencies[0]!
        .defaultFeatures,
    ).toBe(false);
    expect(
      manifestCrate(source.replace("default-features=false", "default-features=true"), "a/Cargo.toml", {
        js: { version: "1", "default-features": false },
      }).dependencies[0]!.defaultFeatures,
    ).toBe(true);
  });
  test("a selected package does not activate another owner's optional alias", () => {
    const consumer = manifestCrate(
      `[package]\nname="consumer"\n[dependencies]\njs={version="1",optional=true,features=["v8"]}`,
      "consumer/Cargo.toml",
    );
    const js = manifestCrate(
      `[package]\nname="js"\n[dependencies]\ndeno_core={version="1",optional=true}\n[features]\nsafe=[]\nv8=["dep:deno_core"]`,
      "js/Cargo.toml",
    );
    const combo: Combination = {
      id: "safe",
      packages: ["consumer", "js"],
      features: ["js/safe"],
      platforms: ["linux"],
      requirements: [],
      jscOnly: true,
    };
    expect(assessCombination(combo, [consumer, js], "linux").status).toBe("supported");
  });
  test("weak child features activate only after their own dependency is enabled", () => {
    const consumer = manifestCrate(
      `[package]\nname="consumer"\n[dependencies]\njs={version="1",optional=true}\n[features]\nweak=["js?/v8"]\nstrong=["dep:js","weak"]`,
      "consumer/Cargo.toml",
    );
    const js = manifestCrate(
      `[package]\nname="js"\n[dependencies]\ndeno_core={version="1",optional=true}\n[features]\nv8=["dep:deno_core"]`,
      "js/Cargo.toml",
    );
    const combo: Combination = {
      id: "weak",
      packages: ["consumer"],
      features: ["consumer/weak"],
      platforms: ["linux"],
      requirements: [],
      jscOnly: true,
    };
    expect(assessCombination(combo, [consumer, js], "linux").status).toBe("supported");
    expect(assessCombination({ ...combo, features: ["consumer/strong"] }, [consumer, js], "linux").status).toBe(
      "unsupported",
    );
  });
  test("missing dependency aliases and suppressed implicit optional features fail", () => {
    const crate = manifestCrate(
      `[package]\nname="a"\n[dependencies]\njs={version="1",optional=true}\n[features]\nbad=["dep:missing","missing/safe"]\nexplicit=["dep:js"]`,
      "a/Cargo.toml",
    );
    expect(featureClosure([crate], ["a/bad", "a/js"]).invalid).toEqual(["a/dep:missing", "a/js", "a/missing/safe"]);
  });
  test("runtime inventory includes ordinary boolean and string feature declarations", () => {
    expect(
      runtimeFlagDeclarations(
        'new!(pub BUN_FEATURE_FLAG_A: boolean, "A", {}); new!(pub BUN_FEATURE_FLAG_B: string, "B", {}); new_feature_flag!(pub BUN_C, "C", {});',
      ),
    ).toEqual([
      { name: "BUN_C", kind: "feature-flag" },
      { name: "BUN_FEATURE_FLAG_A", kind: "boolean" },
      { name: "BUN_FEATURE_FLAG_B", kind: "string" },
    ]);
  });
  test("shim-only features do not prove runtime feature forwarding", () => {
    const source =
      'export function cargoBuildInvocation() { const args = ["-p", "bun_runtime"]; return args; } /** Shim */ function shimCargoInvocation() { return ["--features", "shim_standalone"]; }';
    expect(buildFeatureAudit(source, "if (pgoGenerate && pgoUse) { throw new Error(); }")).toMatchObject({
      runtimeInvocationFound: true,
      explicitFeaturesArgument: false,
      coreutilsMentioned: false,
      pgoConflictGuard: true,
    });
  });
  test("missing cross-target snapshot producer rejects the build in source", async () => {
    const source = await Bun.file(new URL("../../src/browser/crates/js/build.rs", import.meta.url)).text();
    const selection = /let cross_mksnapshot = match cross_mksnapshot\s*\{([\s\S]*?)\n\s*};/.exec(source)?.[1];
    expect(selection).toBeDefined();
    const missing = /None\s*=>\s*\{([\s\S]*?)\n\s*},?\s*$/.exec(selection!)?.[1];
    expect(missing).toMatch(/^\s*panic!\(/);
    expect(missing).toContain("refusing to embed a host V8 snapshot");
  });
});
