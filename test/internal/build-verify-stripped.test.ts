import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "harness";
import { proveStrippedELFImage, strippedELFVerificationSpec } from "../../scripts/build/verify-binary";
import { gnuELFStripArguments } from "../../scripts/build/flags";

test.skipIf(process.platform !== "linux")(
  "stripped ELF keeps allocated code and initializer bytes authenticated",
  async () => {
    using directory = tempDir("verify-stripped-elf", {});
    const root = String(directory),
      profile = join(root, "profile"),
      stripped = join(root, "bun");
    const clang = Bun.which("clang") ?? "/usr/lib/llvm-23/bin/clang";
    const readobj = Bun.which("llvm-readobj") ?? "/usr/lib/llvm-23/bin/llvm-readobj";
    const strip = Bun.which("strip");
    expect(strip).toBeTruthy();
    const run = (args: string[]) => {
      const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe", timeout: 30_000 });
      expect(result.exitCode, result.stderr.toString() + result.stdout.toString()).toBe(0);
      return result.stdout.toString();
    };
    const source = join(root, "fixture.c");
    await Bun.write(
      source,
      "volatile int state; __attribute__((constructor)) static void ready(void){state=7;} void _start(void){for(;;){state++;}}\n",
    );
    run([clang, "-g", "-no-pie", "-nostdlib", "-Wl,--build-id=sha1", source, "-o", profile]);
    run([strip!, ...gnuELFStripArguments(), profile, "-o", stripped]);
    const tool = (name: string) => Bun.which(name) ?? "/usr/lib/llvm-23/bin/" + name;
    const profileSpec = join(root, "profile.verify.json"),
      subjectSpec = join(root, "bun.verify.json");
    await Bun.write(
      profileSpec,
      JSON.stringify({
        name: "fixture-profile",
        exe: profile,
        tools: {
          readobj,
          nm: tool("llvm-nm"),
          objdump: tool("llvm-objdump"),
          cxxfilt: tool("llvm-cxxfilt"),
          strip: strip!,
        },
        expect: {
          format: "elf",
          exports: { exact: [], patterns: [] },
          neededLibs: { names: [], exact: true },
          forbiddenImports: [],
          maxSymbolVersions: { GLIBC: "2.17" },
          staticInitializers: ["ready"],
          debugInfo: { symtab: true, debugSections: true, compressed: false },
        },
      }),
    );
    const subject = strippedELFVerificationSpec(profileSpec, stripped);
    await Bun.write(subjectSpec, JSON.stringify(subject));
    proveStrippedELFImage(profile, stripped, readobj, subject.profileCompanion.strip);
    const verifier = new URL("../../scripts/build/verify-binary.ts", import.meta.url).pathname;
    const verified = run([process.execPath, verifier, "stripped-elf", subjectSpec]);
    expect(verified).toContain("static initializers");
    expect(verified).toContain("0 debug sections");
    const sections = run([readobj, "--sections", stripped]);
    expect(sections).not.toContain("Name: .symtab ");
    expect(sections).not.toContain("Name: .debug_");
    const original = await Bun.file(stripped).bytes();
    const header = new DataView(original.buffer, original.byteOffset, original.byteLength);
    const programOffset = Number(header.getBigUint64(32, true));
    const entrySize = header.getUint16(54, true),
      entryCount = header.getUint16(56, true);
    const entries = Array.from({ length: entryCount }, (_, index) => programOffset + index * entrySize);
    const executableLoad = entries.find(
      offset => header.getUint32(offset, true) === 1 && (header.getUint32(offset + 4, true) & 1) !== 0,
    );
    const note = entries.find(offset => header.getUint32(offset, true) === 4);
    expect(executableLoad).toBeDefined();
    expect(note).toBeDefined();
    for (const mutation of ["load-offset", "load-address", "load-permissions", "interpreter"] as const) {
      const changed = original.slice(),
        view = new DataView(changed.buffer, changed.byteOffset, changed.byteLength);
      if (mutation === "interpreter") view.setUint32(note!, 3, true);
      else if (mutation === "load-permissions")
        view.setUint32(executableLoad! + 4, header.getUint32(executableLoad! + 4, true) | 2, true);
      else {
        const offset = executableLoad! + (mutation === "load-offset" ? 8 : 16);
        view.setBigUint64(offset, header.getBigUint64(offset, true) + 1n, true);
      }
      await Bun.write(stripped, changed);
      // Rehashing the forged subject must not turn loader changes into a valid recipe output.
      await Bun.write(subjectSpec, JSON.stringify(strippedELFVerificationSpec(profileSpec, stripped)));
      const rejected = Bun.spawnSync([process.execPath, verifier, "stripped-elf", subjectSpec], {
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(rejected.stderr.toString(), mutation).toContain("loader image differs from canonical strip output");
      expect(rejected.exitCode).toBe(1);
    }
    await Bun.write(stripped, original);
    await Bun.write(subjectSpec, JSON.stringify(subject));
    for (const section of [".text", ".init_array"]) {
      const start = sections.indexOf("Name: " + section + " (");
      expect(start).toBeGreaterThan(0);
      const block = sections.slice(start, sections.indexOf("  }", start));
      const offset = Number(block.match(/Offset: (\S+)/)![1]);
      const changed = original.slice();
      changed[offset] = changed[offset]! ^ 1;
      await Bun.write(stripped, changed);
      expect(() => proveStrippedELFImage(profile, stripped, readobj, subject.profileCompanion.strip)).toThrow(
        "changed allocated section: " + section,
      );
      const rejected = Bun.spawnSync([process.execPath, verifier, "stripped-elf", subjectSpec], {
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(rejected.stderr.toString()).toContain("binding changed");
      expect(rejected.exitCode).toBe(1);
    }
    const changed = original.slice();
    changed[24] = changed[24]! ^ 1;
    await Bun.write(stripped, changed);
    expect(() => proveStrippedELFImage(profile, stripped, readobj, subject.profileCompanion.strip)).toThrow(
      "entry point changed",
    );
    await Bun.write(stripped, original);
    const rejectedContract = await Bun.file(profileSpec).json();
    rejectedContract.expect.staticInitializers = [];
    await Bun.write(profileSpec, JSON.stringify(rejectedContract));
    await Bun.write(subjectSpec, JSON.stringify(strippedELFVerificationSpec(profileSpec, stripped)));
    const rejectedProfile = Bun.spawnSync([process.execPath, verifier, "stripped-elf", subjectSpec], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(rejectedProfile.stdout.toString()).toContain("new static initializer");
    expect(rejectedProfile.stderr.toString()).toContain("Canonical profile verification failed");
    expect(rejectedProfile.exitCode).toBe(1);
  },
  60_000,
);

test("stripped verification binds subject, profile and original specification independently", async () => {
  using directory = tempDir("verify-stripped-binding", {});
  const root = String(directory),
    profile = join(root, "profile"),
    stripped = join(root, "bun"),
    path = join(root, "profile.json");
  await Bun.write(profile, "profile fixture");
  await Bun.write(stripped, "stripped fixture");
  const strip = join(root, "strip-owner-fixture");
  await Bun.write(strip, "fixture tool identity");
  const contract = {
    name: "bun-profile",
    exe: profile,
    tools: { strip },
    expect: {
      format: "elf",
      maxSymbolVersions: { GLIBC: "2.17" },
      debugInfo: { symtab: true, debugSections: true, compressed: true },
      staticInitializers: ["ready"],
    },
  };
  await Bun.write(path, JSON.stringify(contract));
  const subject = strippedELFVerificationSpec(path, stripped);
  expect(subject.exe).toBe(stripped);
  expect(subject.expect.staticInitializers).toEqual(["ready"]);
  expect(subject.expect.debugInfo).toEqual({ symtab: false, debugSections: false, compressed: false });
  await Bun.write(stripped, "changed subject");
  expect(strippedELFVerificationSpec(path, stripped).profileCompanion.strippedSHA256).not.toBe(
    subject.profileCompanion.strippedSHA256,
  );
  await Bun.write(profile, "changed profile");
  expect(strippedELFVerificationSpec(path, stripped).profileCompanion.exeSHA256).not.toBe(
    subject.profileCompanion.exeSHA256,
  );
  await Bun.write(path, JSON.stringify({ ...contract, name: "changed profile spec" }));
  expect(strippedELFVerificationSpec(path, stripped).profileCompanion.specSHA256).not.toBe(
    subject.profileCompanion.specSHA256,
  );
  await Bun.write(strip, "changed fixture tool identity");
  expect(strippedELFVerificationSpec(path, stripped).profileCompanion.strip.sha256).not.toBe(
    subject.profileCompanion.strip.sha256,
  );
});
