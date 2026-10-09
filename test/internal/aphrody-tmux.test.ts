import { describe, expect, test } from "bun:test";
import { dockerCommand, IMAGES, parseMemoryGb, syncScript } from "../../scripts/aphrody/tmux";

const sh = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

describe("aphrody tmux runner containers", () => {
  test("Alpine is the default Linux, Ubuntu 26.04 the glibc one", () => {
    expect(IMAGES.alpine).toStartWith("ghcr.io/aphrody-labs/alpine:");
    expect(IMAGES.ubuntu).toStartWith("aphrody/build-linux:26.04");
  });

  test("memory sizes", () => {
    expect(parseMemoryGb("6g")).toBe(6);
    expect(parseMemoryGb("10G")).toBe(10);
    expect(parseMemoryGb("8192m")).toBe(8);
    expect(() => parseMemoryGb("lots")).toThrow(/--memory/);
  });

  test("bind mount by default", () => {
    const cmd = dockerCommand("job", "bun bd", "/src/bun", { distro: "ubuntu", cpus: 6, memory: "6g" }, sh);
    expect(cmd).toContain("--cpus 6 --memory 6g --memory-swap 6g");
    expect(cmd).toContain("-v '/src/bun:/work' -w /work");
    expect(cmd).toContain("-v aphrody-build-cache-ubuntu:/root/.bun/build-cache");
    expect(cmd).toEndWith(`${IMAGES.ubuntu} bash -lc 'bun bd'`);
  });

  test("--sync checks the host's HEAD out in the volume, then its working tree changes", () => {
    const c = { distro: "alpine" as const, volume: "aphrody-src-alpine", cpus: 8, memory: "10g" };
    const cmd = dockerCommand("bd-N", "bun run build", "/src/bun", c, sh);
    expect(cmd).toContain("-v aphrody-src-alpine:/work -v '/src/bun:/host:ro'");
    expect(cmd).toContain(":/aphrody-jobs:ro'");
    expect(cmd).toContain(IMAGES.alpine);
    const script = syncScript("bd-N");
    expect(script).toContain("git fetch -q --depth=1 --no-tags file:///host HEAD");
    expect(script).toContain("--files-from=/aphrody-jobs/bd-N.changed /host/ /work/");
    expect(script).toContain("/aphrody-jobs/bd-N.deleted");
    expect(cmd).toContain(sh(`${script}\nbun run build`));
  });
});
