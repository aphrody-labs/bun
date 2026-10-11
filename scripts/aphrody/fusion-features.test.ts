import { describe, expect, test } from "bun:test";
import { assessCombination, featureClosure, incompatibleSelections, manifestCrate, type Combination } from "./fusion-features.ts";

describe("Bun OS source feature inventory", () => {
  test("keeps target guards and inherited dependency aliases", () => {
    const crate = manifestCrate(`[package]\nname="consumer"\n[dependencies]\nrender={workspace=true,optional=true}\n[target.'cfg(target_os = "linux")'.dependencies]\nwreq={version="=6.0.0-rc.31",features=["prefix-symbols"]}\n[features]\npaint=["render/paint"]`, "consumer/Cargo.toml", { render: { package: "renderer", features: ["std"] } });
    expect(crate.dependencies[0]).toMatchObject({ alias: "render", package: "renderer", optional: true, features: ["std"] });
    expect(crate.dependencies[1]).toMatchObject({ target: 'cfg(target_os = "linux")', features: ["prefix-symbols"] });
  });
  test("traverses local declarations without forcing weak optional dependencies", () => {
    const consumer = manifestCrate(`[package]\nname="consumer"\n[dependencies]\nrender={package="renderer",optional=true}\n[features]\nall=["render/paint","render?/serde","dep:render"]`, "a/Cargo.toml");
    const render = manifestCrate(`[package]\nname="renderer"\n[features]\npaint=["base"]\nbase=[]`, "b/Cargo.toml");
    expect(featureClosure([consumer, render], ["consumer/all"])).toEqual({
      declared: ["consumer/all", "renderer/base", "renderer/paint"],
      dependencyEdges: ["consumer/dep:render", "consumer/render?/serde"], invalid: [] });
  });
  test("cyclic declarations terminate and undeclared flags remain failures", () => {
    const crate = manifestCrate(`[package]\nname="a"\n[features]\na=["b"]\nb=["a"]`, "a/Cargo.toml");
    expect(featureClosure([crate], ["a/a", "a/missing"]).invalid).toEqual(["a/missing"]);
    expect(featureClosure([crate], ["a/a"]).declared).toEqual(["a/a", "a/b"]);
  });
  test("JSC-only policy catches V8 through mandatory workspace dependency edges", () => {
    const browser = manifestCrate(`[package]\nname="browser"\n[dependencies]\njs="1"`, "browser/Cargo.toml");
    const js = manifestCrate(`[package]\nname="js"\n[build-dependencies]\ndeno_core="0.412"`, "js/Cargo.toml");
    const combo: Combination = { id: "full", packages: ["browser"], features: [], platforms: ["linux"], requirements: [], jscOnly: true };
    expect(assessCombination(combo, [browser, js], "linux")).toMatchObject({ status: "unsupported", qualified: false });
    expect(assessCombination(combo, [browser, js], "linux").issues.join(" ")).toContain("V8");
  });
  test("external dependencies and unsupported targets cannot become qualification claims", () => {
    const crate = manifestCrate(`[package]\nname="render"\n[features]\npaint=[]`, "render/Cargo.toml");
    const combo: Combination = { id: "paint", packages: ["render"], features: ["render/paint"], platforms: ["linux"], requirements: ["native fixtures"], jscOnly: true };
    expect(assessCombination(combo, [crate], "linux")).toMatchObject({ status: "requiring-dependencies", qualified: false });
    expect(assessCombination(combo, [crate], "windows").status).toBe("unsupported");
    expect(assessCombination({ ...combo, requirements: [] }, [crate], "linux")).toMatchObject({ status: "supported", qualified: false });
  });
  test("default-enabled optional V8 cannot evade the JSC-only blocker", () => {
    const crate = manifestCrate(`[package]\nname="js"\n[dependencies]\ndeno_core={version="0.412",optional=true}\n[features]\ndefault=["dep:deno_core"]`, "js/Cargo.toml");
    const combo: Combination = { id: "js", packages: ["js"], features: [], platforms: ["linux"], requirements: [], jscOnly: true };
    expect(assessCombination(combo, [crate], "linux").issues.join(" ")).toContain("V8");
  });
  test("ABI and profile selections report conflicts instead of silently choosing one", () => {
    expect(incompatibleSelections(["pgoUse", "pgoGenerate"], [["pgoUse", "pgoGenerate"]])).toHaveLength(1);
    expect(incompatibleSelections(["webkit=local"], [["webkit=local", "webkit=prebuilt"]])).toEqual([]);
  });
});
