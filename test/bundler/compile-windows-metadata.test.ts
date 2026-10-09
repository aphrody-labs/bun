import { describe, expect, test } from "bun:test";
import { promises as fs } from "fs";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import { join } from "path";

// PE optional-header Subsystem values
const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;

// Read the Subsystem field from a PE32+ optional header.
// Layout: e_lfanew at DOS+0x3C points to "PE\0\0" (4 bytes), followed by the
// 20-byte COFF header, then the optional header whose Subsystem is at +68.
// The whole header fits in the first page, so read 4 KiB instead of the full exe.
async function readPESubsystem(path: string): Promise<number> {
  const data = await Bun.file(path).slice(0, 4096).bytes();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  return view.getUint16(peOffset + 24 + 68, true);
}

// Helper to ensure executable cleanup
function cleanup(outfile: string) {
  return {
    [Symbol.asyncDispose]: async () => {
      try {
        await fs.rm(outfile, { force: true });
      } catch {}
    },
  };
}

// Drain stdout/stderr and assert the build succeeded. These tests run
// concurrently and spawn many `bun build --compile` processes from the same
// cwd; asserting on the combined object means a flake shows the real stderr
// instead of just "Expected: 0, Received: 1".
async function expectBuildOk(proc: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect({ stderr, exitCode }).toEqual({ stderr: "", exitCode: 0 });
  return { stdout, stderr, exitCode };
}

// Read all VersionInfo fields in a single PowerShell invocation (spawning
// powershell is ~0.5-1s on CI). Forcing [Console]::OutputEncoding makes the
// read independent of the per-console output code page, which another process
// on the same console can flip off UTF-8.
async function readVersionInfo(outfile: string) {
  const fields = [
    "ProductName",
    "CompanyName",
    "FileDescription",
    "LegalCopyright",
    "ProductVersion",
    "FileVersion",
    "OriginalFilename",
  ];
  await using proc = Bun.spawn({
    cmd: [
      "powershell",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ` +
        `(Get-Item -LiteralPath '${outfile.replaceAll("'", "''")}').VersionInfo | ` +
        `Select-Object ${fields.join(",")} | ConvertTo-Json -Compress`,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect({ stderr, exitCode }).toEqual({ stderr: "", exitCode: 0 });
  const info = JSON.parse(stdout) as Record<string, string | null>;
  for (const k of fields) info[k] ??= "";
  return info as Record<string, string>;
}

const windowsTarget = process.arch === "arm64" ? "bun-windows-aarch64" : "bun-windows-x64";

// https://github.com/oven-sh/bun/issues/19916
describe.skipIf(!isWindows).concurrent("--windows-hide-console", () => {
  // The default-target console-subsystem baseline is asserted inside
  // "Windows compile metadata > CLI flags > all metadata flags via CLI" to
  // avoid a redundant full --compile.

  test("CLI flag sets GUI subsystem", async () => {
    using dir = tempDir("windows-subsystem-gui-cli", {
      "app.js": `require("fs").writeFileSync(process.argv[2], "ran");`,
    });
    const outfile = join(String(dir), "gui.exe");
    await using _cleanup = cleanup(outfile);

    await using proc = Bun.spawn({
      cmd: [
        bunExe(),
        "build",
        "--compile",
        "--windows-hide-console",
        join(String(dir), "app.js"),
        "--outfile",
        outfile,
      ],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    await expectBuildOk(proc);

    expect(await readPESubsystem(outfile)).toBe(IMAGE_SUBSYSTEM_WINDOWS_GUI);

    // The resulting GUI-subsystem exe still has to be a valid, runnable PE.
    // A GUI process has no console, so assert via a file side effect + exit code.
    const marker = join(String(dir), "marker.txt");
    await using run = Bun.spawn({ cmd: [outfile, marker], env: bunEnv, stdout: "pipe", stderr: "pipe" });
    const [, , runExit] = await Promise.all([run.stdout.text(), run.stderr.text(), run.exited]);
    expect(await Bun.file(marker).text()).toBe("ran");
    expect(runExit).toBe(0);
  });

  test("Bun.build() hideConsole sets GUI subsystem", async () => {
    using dir = tempDir("windows-subsystem-gui-api", {
      "app.js": `console.log("gui");`,
    });

    const result = await Bun.build({
      entrypoints: [join(String(dir), "app.js")],
      outdir: String(dir),
      compile: {
        target: windowsTarget,
        outfile: "gui-api.exe",
        windows: { hideConsole: true },
      },
    });
    expect(result.success).toBe(true);

    const outfile = result.outputs[0].path;
    await using _cleanup = cleanup(outfile);
    expect(await readPESubsystem(outfile)).toBe(IMAGE_SUBSYSTEM_WINDOWS_GUI);
  });

  // The "GUI subsystem survives the metadata pass" case is asserted
  // inside "Combined > metadata with --windows-hide-console" below, which
  // builds the same flag combination and checks both Subsystem and VersionInfo.
});

describe.skipIf(!isWindows).concurrent("Windows compile metadata", () => {
  describe("CLI flags", () => {
    test("all metadata flags via CLI", async () => {
      using dir = tempDir("windows-metadata-cli", {
        "app.js": `console.log("Test app with metadata");`,
      });

      const outfile = join(String(dir), "app-with-metadata.exe");

      await using proc = Bun.spawn({
        cmd: [
          bunExe(),
          "build",
          "--compile",
          join(String(dir), "app.js"),
          "--outfile",
          outfile,
          "--windows-title",
          "My Application",
          "--windows-publisher",
          "Test Company Inc",
          "--windows-version",
          "1.2.3.4",
          "--windows-description",
          "A test application with metadata",
          "--windows-copyright",
          "Copyright © 2024 Test Company Inc",
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      await expectBuildOk(proc);

      // No --windows-hide-console here, so the default build must stay a
      // console (CUI) subsystem even after the metadata pass.
      expect(await readPESubsystem(outfile)).toBe(IMAGE_SUBSYSTEM_WINDOWS_CUI);

      // OriginalFilename must be cleared (not "bun.exe") even with every
      // metadata field set; this is the "Original Filename removal" coverage.
      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductName: "My Application",
        CompanyName: "Test Company Inc",
        FileDescription: "A test application with metadata",
        LegalCopyright: "Copyright © 2024 Test Company Inc",
        ProductVersion: "1.2.3.4",
        FileVersion: "1.2.3.4",
        OriginalFilename: "",
      });
    });

    test("partial metadata flags", async () => {
      using dir = tempDir("windows-metadata-partial", {
        "app.js": `console.log("Partial metadata test");`,
      });

      const outfile = join(String(dir), "app-partial.exe");

      await using proc = Bun.spawn({
        cmd: [
          bunExe(),
          "build",
          "--compile",
          join(String(dir), "app.js"),
          "--outfile",
          outfile,
          "--windows-title",
          "Simple App",
          "--windows-version",
          "10.20.30.40",
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      await expectBuildOk(proc);

      // OriginalFilename must also be cleared with only a subset of flags.
      // Version input "10.20.30.40" (multi-digit 4-part) round-trips unchanged.
      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductName: "Simple App",
        ProductVersion: "10.20.30.40",
        FileVersion: "10.20.30.40",
        OriginalFilename: "",
      });
    });

    test("windows flags without --compile should error", async () => {
      using dir = tempDir("windows-no-compile", {
        "app.js": `console.log("test");`,
      });

      await using proc = Bun.spawn({
        cmd: [bunExe(), "build", join(String(dir), "app.js"), "--windows-title", "Should Fail"],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      const [, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

      expect(stderr).toContain("--windows-title requires --compile");
      expect(exitCode).not.toBe(0);
    });

    test("windows flags with non-Windows target should error", async () => {
      using dir = tempDir("windows-wrong-target", {
        "app.js": `console.log("test");`,
      });

      await using proc = Bun.spawn({
        cmd: [
          bunExe(),
          "build",
          "--compile",
          "--target",
          "bun-linux-x64",
          join(String(dir), "app.js"),
          "--windows-title",
          "Should Fail",
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      const [, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

      // Windows flags require a Windows compile target
      expect(stderr.toLowerCase()).toContain("windows compile target");
      expect(exitCode).not.toBe(0);
    });
  });

  describe("Bun.build() API", () => {
    test("all metadata via Bun.build()", async () => {
      using dir = tempDir("windows-metadata-api", {
        "app.js": `console.log("API metadata test");`,
      });

      const result = await Bun.build({
        entrypoints: [join(String(dir), "app.js")],
        outdir: String(dir),
        compile: {
          target: windowsTarget,
          outfile: "app-api.exe",
          windows: {
            title: "API App",
            publisher: "API Company",
            version: "65535.65535.65535.65535",
            description: "Built with Bun.build API",
            copyright: "© 2024 API Company",
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBe(1);

      const outfile = result.outputs[0].path;
      // Version "65535.65535.65535.65535" (u16 max per part) round-trips; pairs
      // with the invalid "65536.0.0.0" case below as the valid-side fence post.
      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductName: "API App",
        CompanyName: "API Company",
        FileDescription: "Built with Bun.build API",
        LegalCopyright: "© 2024 API Company",
        ProductVersion: "65535.65535.65535.65535",
        FileVersion: "65535.65535.65535.65535",
        OriginalFilename: "",
      });
    });

    test("partial metadata via Bun.build()", async () => {
      using dir = tempDir("windows-metadata-api-partial", {
        "app.js": `console.log("Partial API test");`,
      });

      const result = await Bun.build({
        entrypoints: [join(String(dir), "app.js")],
        outdir: String(dir),
        compile: {
          target: windowsTarget,
          outfile: "partial-api.exe",
          windows: {
            title: "Partial App",
            version: "1.2",
          },
        },
      });

      expect(result.success).toBe(true);

      const outfile = result.outputs[0].path;
      // Version input "1.2" (2-part) is zero-padded to 4 parts.
      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductName: "Partial App",
        ProductVersion: "1.2.0.0",
        FileVersion: "1.2.0.0",
        OriginalFilename: "",
      });
    });

    test("relative outdir with compile", async () => {
      using dir = tempDir("windows-relative-outdir", {
        "app.js": `console.log("Relative outdir test");`,
      });

      const result = await Bun.build({
        entrypoints: [join(String(dir), "app.js")],
        outdir: "./out",
        compile: {
          target: windowsTarget,
          outfile: "relative.exe",
          windows: {
            title: "Relative Path App",
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.outputs.length).toBe(1);

      const outfile = result.outputs[0].path;
      await using _cleanup = cleanup(outfile);
      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductName: "Relative Path App",
        OriginalFilename: "",
      });
    });
  });

  describe("Version string formats", () => {
    // The normalization of each accepted arity is asserted on the binaries the
    // surrounding tests already build, so only the "--windows-version with no
    // other metadata" path needs its own compile here:
    //   1           -> 1.0.0.0          (this test)
    //   1.2         -> 1.2.0.0          (Bun.build API > partial metadata)
    //   1.2.3       -> 1.2.3.0          (Combined > metadata with --windows-hide-console)
    //   1.2.3.4     -> 1.2.3.4          (CLI flags > all metadata flags via CLI)
    //   10.20.30.40 -> 10.20.30.40      (CLI flags > partial metadata flags)
    //   65535.65535.65535.65535 -> same (Bun.build API > all metadata; u16 max)
    test("--windows-version alone zero-pads to four parts", async () => {
      using dir = tempDir("windows-version-alone", {
        "app.js": `console.log("Version test");`,
      });

      const outfile = join(String(dir), "version-test.exe");

      await using proc = Bun.spawn({
        cmd: [
          bunExe(),
          "build",
          "--compile",
          join(String(dir), "app.js"),
          "--outfile",
          outfile,
          "--windows-version",
          "1",
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      await expectBuildOk(proc);

      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductVersion: "1.0.0.0",
        FileVersion: "1.0.0.0",
        OriginalFilename: "",
      });
    });
  });

  describe("Edge cases", () => {
    test("long strings in metadata", async () => {
      using dir = tempDir("windows-long-strings", {
        "app.js": `console.log("Long strings test");`,
      });

      const longString = Buffer.alloc(255, "A").toString();
      const outfile = join(String(dir), "long-strings.exe");

      await using proc = Bun.spawn({
        cmd: [
          bunExe(),
          "build",
          "--compile",
          join(String(dir), "app.js"),
          "--outfile",
          outfile,
          "--windows-title",
          longString,
          "--windows-description",
          longString,
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      await expectBuildOk(proc);

      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductName: longString,
        FileDescription: longString,
      });
    });

    // Every --windows-* string field flows through the same
    // `to_utf16_alloc_for_real` -> VS_VERSIONINFO string path, so a single build that mixes Latin-1 symbols, ASCII punctuation, BMP CJK
    // and surrogate-pair emoji round-tripping across the four fields covers the
    // same encoding surface as two separate compiles would.
    test("unicode and special characters in metadata", async () => {
      using dir = tempDir("windows-unicode-special", {
        "app.js": `console.log("Unicode + special chars test");`,
      });

      const outfile = join(String(dir), "unicode-special.exe");

      await using proc = Bun.spawn({
        cmd: [
          bunExe(),
          "build",
          "--compile",
          join(String(dir), "app.js"),
          "--outfile",
          outfile,
          "--windows-title",
          "App™ with® Special© アプリケーション",
          "--windows-publisher",
          "Company & Co. 会社名",
          "--windows-description",
          "Test \"quotes\" and 'apostrophes' 🚀 🎉",
          "--windows-copyright",
          "© 2024 <Company> 世界",
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      await expectBuildOk(proc);

      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductName: "App™ with® Special© アプリケーション",
        CompanyName: "Company & Co. 会社名",
        FileDescription: "Test \"quotes\" and 'apostrophes' 🚀 🎉",
        LegalCopyright: "© 2024 <Company> 世界",
      });
    });

    test("empty strings in metadata", async () => {
      using dir = tempDir("windows-empty-strings", {
        "app.js": `console.log("Empty strings test");`,
      });

      const outfile = join(String(dir), "empty.exe");

      // Empty strings should be treated as not provided
      await using proc = Bun.spawn({
        cmd: [
          bunExe(),
          "build",
          "--compile",
          join(String(dir), "app.js"),
          "--outfile",
          outfile,
          "--windows-title",
          "",
          "--windows-description",
          "",
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      await expectBuildOk(proc);

      // Empty title/description are skipped but OriginalFilename is still
      // cleared, so asserting on it proves the
      // metadata pass ran (and that the output is a readable PE).
      expect(await readVersionInfo(outfile)).toMatchObject({ OriginalFilename: "" });
    });
  });

  describe("Combined with other compile options", () => {
    test("metadata with --windows-hide-console", async () => {
      using dir = tempDir("windows-metadata-hide-console", {
        "app.js": `console.log("Hidden console test");`,
      });

      const outfile = join(String(dir), "hidden-with-metadata.exe");

      await using proc = Bun.spawn({
        cmd: [
          bunExe(),
          "build",
          "--compile",
          join(String(dir), "app.js"),
          "--outfile",
          outfile,
          "--windows-hide-console",
          "--windows-title",
          "Hidden Console App",
          "--windows-version",
          "1.2.3",
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      await expectBuildOk(proc);

      // The metadata pass must not undo the GUI subsystem patch.
      expect(await readPESubsystem(outfile)).toBe(IMAGE_SUBSYSTEM_WINDOWS_GUI);
      // Version input "1.2.3" (3-part) is zero-padded to 4 parts.
      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductName: "Hidden Console App",
        ProductVersion: "1.2.3.0",
        FileVersion: "1.2.3.0",
      });
    });

    test("metadata with --windows-icon", async () => {
      using dir = tempDir("windows-metadata-icon", {
        "app.js": `console.log("Icon test");`,
        "icon.ico": makeIco(),
      });

      const outfile = join(String(dir), "icon-with-metadata.exe");

      await using proc = Bun.spawn({
        cmd: [
          bunExe(),
          "build",
          "--compile",
          join(String(dir), "app.js"),
          "--outfile",
          outfile,
          "--windows-icon",
          join(String(dir), "icon.ico"),
          "--windows-title",
          "App with Icon",
          "--windows-version",
          "2.0.0.0",
        ],
        env: bunEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      await expectBuildOk(proc);

      expect(await readVersionInfo(outfile)).toMatchObject({
        ProductName: "App with Icon",
        ProductVersion: "2.0.0.0",
      });
    });
  });
});

// Build a minimal PE32+ image with one .text section, an optional .rsrc section
// holding `manifest`, and an optional Authenticode overlay past them. Large
// enough that the correct CheckSum exceeds 0xffff.
function minimalPE64Template(certSize = 0, manifest?: string): Buffer {
  const fileAlign = 512;
  const sectAlign = 4096;
  const peOff = 64;
  const optOff = peOff + 24;
  const optSize = 240;
  const shOff = optOff + optSize;
  const textRaw = 512;
  const textRawSize = 128 * 1024;
  const textVA = sectAlign;
  const rsrcVA = textVA + textRawSize;
  const rsrcRaw = textRaw + textRawSize;
  const rsrc = manifest === undefined ? undefined : manifestResources(rsrcVA, manifest);
  const rsrcRawSize = rsrc ? Math.ceil(rsrc.length / fileAlign) * fileAlign : 0;
  const lastRawEnd = rsrcRaw + rsrcRawSize;

  const tmpl = Buffer.alloc(lastRawEnd + certSize);
  // DOS header
  tmpl.writeUInt16LE(0x5a4d, 0); // "MZ"
  tmpl.writeUInt32LE(peOff, 0x3c); // e_lfanew
  // COFF header
  tmpl.writeUInt32LE(0x00004550, peOff); // "PE\0\0"
  tmpl.writeUInt16LE(0x8664, peOff + 4); // machine = AMD64
  tmpl.writeUInt16LE(rsrc ? 2 : 1, peOff + 6); // NumberOfSections
  tmpl.writeUInt16LE(optSize, peOff + 20); // SizeOfOptionalHeader
  tmpl.writeUInt16LE(0x0022, peOff + 22); // Characteristics
  // Optional header (PE32+)
  tmpl.writeUInt16LE(0x020b, optOff); // Magic
  tmpl.writeUInt32LE(textVA, optOff + 16); // AddressOfEntryPoint
  tmpl.writeUInt32LE(textVA, optOff + 20); // BaseOfCode
  tmpl.writeBigUInt64LE(0x140000000n, optOff + 24); // ImageBase
  tmpl.writeUInt32LE(sectAlign, optOff + 32); // SectionAlignment
  tmpl.writeUInt32LE(fileAlign, optOff + 36); // FileAlignment
  tmpl.writeUInt16LE(6, optOff + 40); // MajorOSVersion
  tmpl.writeUInt16LE(6, optOff + 48); // MajorSubsystemVersion
  tmpl.writeUInt32LE(textVA + sectAlign, optOff + 56); // SizeOfImage
  tmpl.writeUInt32LE(512, optOff + 60); // SizeOfHeaders
  tmpl.writeUInt16LE(3, optOff + 68); // Subsystem = CUI
  tmpl.writeUInt32LE(16, optOff + 108); // NumberOfRvaAndSizes
  if (certSize > 0) {
    // Security directory (index 4): VirtualAddress is a file offset for this entry.
    const secDir = optOff + 112 + 4 * 8;
    tmpl.writeUInt32LE(lastRawEnd, secDir);
    tmpl.writeUInt32LE(certSize, secDir + 4);
  }
  // Section header: .text
  tmpl.write(".text\0\0\0", shOff, 8, "latin1");
  tmpl.writeUInt32LE(textRawSize, shOff + 8); // VirtualSize
  tmpl.writeUInt32LE(textVA, shOff + 12); // VirtualAddress
  tmpl.writeUInt32LE(textRawSize, shOff + 16); // SizeOfRawData
  tmpl.writeUInt32LE(textRaw, shOff + 20); // PointerToRawData
  tmpl.writeUInt32LE(0x60000020, shOff + 36); // Characteristics
  tmpl.fill(0xcc, textRaw, rsrcRaw); // .text body
  if (rsrc) {
    tmpl.writeUInt32LE(rsrcVA + sectAlign, optOff + 56); // SizeOfImage
    tmpl.writeUInt32LE(rsrcVA, optOff + 112 + 2 * 8); // resource directory
    tmpl.writeUInt32LE(rsrc.length, optOff + 112 + 2 * 8 + 4);
    const o = shOff + 40;
    tmpl.write(".rsrc\0\0\0", o, 8, "latin1");
    tmpl.writeUInt32LE(rsrc.length, o + 8); // VirtualSize
    tmpl.writeUInt32LE(rsrcVA, o + 12); // VirtualAddress
    tmpl.writeUInt32LE(rsrcRawSize, o + 16); // SizeOfRawData
    tmpl.writeUInt32LE(rsrcRaw, o + 20); // PointerToRawData
    tmpl.writeUInt32LE(0x40000040, o + 36); // initialized data, readable
    rsrc.copy(tmpl, rsrcRaw);
  }
  if (certSize > 0) tmpl.fill(0xab, lastRawEnd); // cert overlay marker
  return tmpl;
}

// Recompute the reference PE CheckSum over `bytes` with the CheckSum field zeroed.
function peChecksum(bytes: Buffer): { stored: number; expected: number } {
  const peOff = bytes.readUInt32LE(0x3c);
  const ckOff = peOff + 24 + 64;
  const stored = bytes.readUInt32LE(ckOff);
  const copy = Buffer.from(bytes);
  copy.writeUInt32LE(0, ckOff);
  let sum = 0;
  for (let i = 0; i + 1 < copy.length; i += 2) {
    sum += copy[i] | (copy[i + 1] << 8);
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  if (copy.length & 1) sum += copy[copy.length - 1];
  sum = (sum & 0xffff) + (sum >>> 16);
  sum = (sum & 0xffff) + (sum >>> 16);
  return { stored, expected: (sum + copy.length) >>> 0 };
}

function lastSectionEnd(bytes: Buffer): number {
  const peOff = bytes.readUInt32LE(0x3c);
  const nSect = bytes.readUInt16LE(peOff + 6);
  const shOff = peOff + 24 + bytes.readUInt16LE(peOff + 20);
  let end = 0;
  for (let i = 0; i < nSect; i++) {
    const o = shOff + i * 40;
    const rawEnd = bytes.readUInt32LE(o + 20) + bytes.readUInt32LE(o + 16);
    if (rawEnd > end) end = rawEnd;
  }
  return end;
}

async function compileWindowsTemplate(dir: string, tmpl: Buffer, extraArgs: string[] = []): Promise<Buffer> {
  const tmplPath = join(dir, "template.exe");
  const outPath = join(dir, "out.exe");
  await Bun.write(tmplPath, tmpl);
  await using proc = Bun.spawn({
    cmd: [
      bunExe(),
      "build",
      "--compile",
      "--target=bun-windows-x64",
      "--compile-executable-path",
      tmplPath,
      join(dir, "entry.js"),
      "--outfile",
      outPath,
      ...extraArgs,
    ],
    env: bunEnv,
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await expectBuildOk(proc);
  return Buffer.from(await Bun.file(outPath).arrayBuffer());
}

// The PE OptionalHeader.CheckSum field is defined as `fold16(word_sum) + file_length`
// (the same algorithm Windows' MapFileAndCheckSum uses).
//
// These tests craft a minimal PE64 template and cross-compile via
// `--compile-executable-path`, so they run on every platform without downloading
// a real bun.exe.
test.concurrent("bun build --compile writes a valid PE OptionalHeader.CheckSum", async () => {
  using dir = tempDir("pe-checksum", { "entry.js": `console.log("hi");` });
  const out = await compileWindowsTemplate(String(dir), minimalPE64Template());
  const { stored, expected } = peChecksum(out);
  // Guard against the template shrinking to where the checksum fits in 16 bits
  // and the assertion below becomes vacuous.
  expect(expected).toBeGreaterThan(0xffff);
  expect(stored).toBe(expected);
});

test.concurrent("bun build --compile truncates the PE output when Authenticode strip shrinks it", async () => {
  // 16 KiB cert overlay: larger than the .bun section a trivial entry produces, so
  // strip_authenticode makes the in-memory PE shorter than the cloned base file.
  const certSize = 16 * 1024;
  const tmpl = minimalPE64Template(certSize);
  using dir = tempDir("pe-truncate", { "entry.js": `console.log("hi");` });
  const out = await compileWindowsTemplate(String(dir), tmpl);

  const lastEnd = lastSectionEnd(out);
  expect({ fileSize: out.length, lastEnd }).toEqual({ fileSize: lastEnd, lastEnd });
  expect(out.length).toBeLessThan(tmpl.length);

  const { stored, expected } = peChecksum(out);
  expect(stored).toBe(expected);
});

// A one-image 16x16 32-bit ICO: ICONDIR, one ICONDIRENTRY, then the image as a
// headerless BMP (BITMAPINFOHEADER with doubled height, XOR pixels, AND mask).
function makeIco(): Buffer {
  const image = Buffer.alloc(40 + 16 * 16 * 4 + 16 * 4);
  image.writeUInt32LE(40, 0);
  image.writeInt32LE(16, 4);
  image.writeInt32LE(32, 8);
  image.writeUInt16LE(1, 12);
  image.writeUInt16LE(32, 14);
  image.fill(0x7f, 40, 40 + 16 * 16 * 4);
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  header[6] = 16;
  header[7] = 16;
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bit count
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, image]);
}

// A resource section holding one RT_MANIFEST (24), id 1, en-US, mapped at `va`.
function manifestResources(va: number, manifest: string): Buffer {
  const data = Buffer.from(manifest);
  const out = Buffer.alloc(0x58 + data.length);
  const dir = (off: number, id: number, target: number) => {
    out.writeUInt16LE(1, off + 14);
    out.writeUInt32LE(id, off + 16);
    out.writeUInt32LE(target, off + 20);
  };
  dir(0x00, 24, 0x80000000 + 0x18);
  dir(0x18, 1, 0x80000000 + 0x30);
  dir(0x30, 1033, 0x48);
  out.writeUInt32LE(va + 0x58, 0x48);
  out.writeUInt32LE(data.length, 0x4c);
  data.copy(out, 0x58);
  return out;
}

function peSections(bytes: Buffer) {
  const peOff = bytes.readUInt32LE(0x3c);
  const shOff = peOff + 24 + bytes.readUInt16LE(peOff + 20);
  return Array.from({ length: bytes.readUInt16LE(peOff + 6) }, (_, i) => {
    const o = shOff + i * 40;
    return {
      name: bytes.toString("latin1", o, o + 8).replace(/\0+$/, ""),
      va: bytes.readUInt32LE(o + 12),
      rawSize: bytes.readUInt32LE(o + 16),
      raw: bytes.readUInt32LE(o + 20),
    };
  });
}

// Every resource leaf of the image, keyed "type/name/lang" (numeric ids only).
function readResources(bytes: Buffer) {
  const peOff = bytes.readUInt32LE(0x3c);
  const rootRva = bytes.readUInt32LE(peOff + 24 + 112 + 2 * 8);
  const sections = peSections(bytes);
  const fileOffset = (rva: number) => {
    const s = sections.find(s => rva >= s.va && rva < s.va + s.rawSize)!;
    return s.raw + rva - s.va;
  };
  const base = fileOffset(rootRva);
  const entries = (off: number) =>
    Array.from(
      { length: bytes.readUInt16LE(base + off + 12) + bytes.readUInt16LE(base + off + 14) },
      (_, i) => [bytes.readUInt32LE(base + off + 16 + i * 8), bytes.readUInt32LE(base + off + 20 + i * 8)] as const,
    );
  const leaves = new Map<string, Buffer>();
  for (const [type, typeDir] of entries(0))
    for (const [name, nameDir] of entries(typeDir & 0x7fffffff))
      for (const [lang, leaf] of entries(nameDir & 0x7fffffff)) {
        const at = fileOffset(bytes.readUInt32LE(base + leaf));
        leaves.set(`${type}/${name}/${lang}`, bytes.subarray(at, at + bytes.readUInt32LE(base + leaf + 4)));
      }
  return { rootRva, leaves };
}

function parseVersionInfo(data: Buffer) {
  const align4 = (n: number) => (n + 3) & ~3;
  const strings: Record<string, string> = {};
  let fixed = Buffer.alloc(0);
  const walk = (off: number, depth: number) => {
    const len = data.readUInt16LE(off);
    const valueLen = data.readUInt16LE(off + 2);
    const valueBytes = data.readUInt16LE(off + 4) === 1 ? valueLen * 2 : valueLen;
    let p = off + 6;
    let key = "";
    for (let c; (c = data.readUInt16LE(p)) !== 0; p += 2) key += String.fromCharCode(c);
    p = align4(p + 2);
    if (depth === 0) fixed = data.subarray(p, p + valueBytes);
    if (depth === 3) strings[key] = data.toString("utf16le", p, p + valueBytes).replace(/\0+$/, "");
    if (depth === 3) return;
    for (let child = align4(p + valueBytes); child < off + len; ) {
      const childLen = data.readUInt16LE(child);
      if (childLen === 0) break;
      walk(child, depth + 1);
      child = align4(child + childLen);
    }
  };
  walk(0, 0);
  const version = (at: number) => {
    const ms = fixed.readUInt32LE(at);
    const ls = fixed.readUInt32LE(at + 4);
    return `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
  };
  return { strings, fileVersion: version(8), productVersion: version(16) };
}

// --windows-icon and the VersionInfo flags edit the PE resources in Rust, so
// they work from every host.
describe.concurrent("Windows resources from any host", () => {
  test("icon and version metadata are written into a new .rsrc section", async () => {
    const icon = makeIco();
    const manifest = `<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"/>`;
    using dir = tempDir("pe-resources", { "entry.js": `console.log("hi");`, "icon.ico": icon });
    const out = await compileWindowsTemplate(String(dir), minimalPE64Template(0, manifest), [
      "--windows-icon",
      join(String(dir), "icon.ico"),
      "--windows-title",
      "Tést App 世界",
      "--windows-publisher",
      "Publisher",
      "--windows-version",
      "1.2.3",
      "--windows-description",
      "Description 🚀",
      "--windows-copyright",
      "© 2026",
    ]);

    const sections = peSections(out);
    expect(sections.map(s => s.name)).toEqual([".text", ".rsrc_0", ".rsrc", ".bun"]);
    const { rootRva, leaves } = readResources(out);
    expect(rootRva).toBe(sections[2].va);
    expect([...leaves.keys()]).toEqual(["3/1/1033", "14/1/1033", "16/1/1033", "24/1/1033"]);

    expect(leaves.get("24/1/1033")!.toString()).toBe(manifest);
    expect(leaves.get("3/1/1033")!.equals(icon.subarray(22))).toBe(true);
    const group = leaves.get("14/1/1033")!;
    expect({
      count: group.readUInt16LE(4),
      entry: group.subarray(6, 18).equals(icon.subarray(6, 18)),
      id: group.readUInt16LE(18),
    }).toEqual({ count: 1, entry: true, id: 1 });

    expect(parseVersionInfo(leaves.get("16/1/1033")!)).toEqual({
      strings: {
        ProductName: "Tést App 世界",
        CompanyName: "Publisher",
        FileDescription: "Description 🚀",
        LegalCopyright: "© 2026",
        FileVersion: "1.2.3.0",
        ProductVersion: "1.2.3.0",
        OriginalFilename: "",
      },
      fileVersion: "1.2.3.0",
      productVersion: "1.2.3.0",
    });

    const { stored, expected } = peChecksum(out);
    expect(stored).toBe(expected);
  });

  test.each([
    { version: "not.a.version" },
    { version: "1.2.3.4.5" },
    { version: "1.-2.3.4" },
    { version: "65536.0.0.0" }, // > 65535
    { version: "" },
  ])("invalid version format should error gracefully: $version", async ({ version }) => {
    using dir = tempDir("windows-invalid-version", {
      "app.js": `console.log("Invalid version test");`,
    });
    const tmplPath = join(String(dir), "template.exe");
    await Bun.write(tmplPath, minimalPE64Template());

    await using proc = Bun.spawn({
      cmd: [
        bunExe(),
        "build",
        "--compile",
        "--target=bun-windows-x64",
        "--compile-executable-path",
        tmplPath,
        join(String(dir), "app.js"),
        "--outfile",
        join(String(dir), "test.exe"),
        "--windows-version",
        version,
      ],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toContain("InvalidVersionFormat");
    expect(exitCode).not.toBe(0);
  });

  test("an invalid icon is rejected", async () => {
    using dir = tempDir("windows-invalid-icon", { "entry.js": `console.log("hi");`, "icon.ico": "not an icon" });
    const tmplPath = join(String(dir), "template.exe");
    await Bun.write(tmplPath, minimalPE64Template());

    await using proc = Bun.spawn({
      cmd: [
        bunExe(),
        "build",
        "--compile",
        "--target=bun-windows-x64",
        "--compile-executable-path",
        tmplPath,
        join(String(dir), "entry.js"),
        "--outfile",
        join(String(dir), "out.exe"),
        "--windows-icon",
        join(String(dir), "icon.ico"),
      ],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toContain("InvalidIcon");
    expect(exitCode).not.toBe(0);
  });
});
