import { expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import { join } from "path";

test(
  "compiled HTML preserves configured methods and generated asset fallback",
  async () => {
    using dir = tempDir("compiled-html-methods", {
      "index.html": `<!DOCTYPE html><html><head><title>compiled-method-page</title></head><body><script type="module" src="./client.ts"></script></body></html>`,
      "client.ts": `console.log("compiled-method-asset");`,
      "entry.ts": String.raw`
        import html from "./index.html";

        await using server = Bun.serve({
          port: 0,
          development: false,
          routes: {
            "/page": html,
            "/explicit": { POST: html },
            "/api": { POST: () => new Response("posted") },
          },
          fetch: () => new Response("fallback", { status: 404 }),
        });
        const signal = AbortSignal.timeout(10_000);
        async function request(path, method) {
          const response = await fetch(new URL(path, server.url), {
            method,
            signal,
            body: method === "POST" ? "request-body" : undefined,
          });
          return {
            method,
            status: response.status,
            allow: response.headers.get("allow"),
            length: response.headers.get("content-length"),
            body: await response.text(),
          };
        }

        const page = [];
        for (const method of ["POST", "PATCH", "GET", "HEAD"]) {
          page.push(await request("/page", method));
        }
        const assetPath = /src="([^"]+\.js)"/.exec(page[2].body)?.[1];
        if (!assetPath) throw new Error("Compiled HTML did not reference its JavaScript asset");
        const asset = [];
        for (const method of ["GET", "HEAD", "POST"]) {
          asset.push(await request(assetPath, method));
        }
        const explicit = await request("/explicit", "POST");
        const api = await request("/api", "POST");
        console.log(JSON.stringify({ revision: Bun.revision, page, asset, explicit, api }));
      `,
    });
    const executable = join(String(dir), isWindows ? "app.exe" : "app");

    // The host target embeds this test's executable, never a downloaded runtime.
    await using build = Bun.spawn({
      cmd: [
        bunExe(),
        "build",
        "--compile",
        `--compile-executable-path=${bunExe()}`,
        "./entry.ts",
        "--outfile",
        executable,
      ],
      cwd: String(dir),
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 45_000,
    });
    const [buildStdout, buildStderr, buildExitCode] = await Promise.all([
      build.stdout.text(),
      build.stderr.text(),
      build.exited,
    ]);
    if (buildExitCode !== 0) {
      throw new Error(`compile failed (${buildExitCode})\n${buildStdout}\n${buildStderr}`);
    }

    // Run elsewhere so the original source assets cannot satisfy these requests.
    using runDir = tempDir("compiled-html-methods-run", {});
    await using proc = Bun.spawn({
      cmd: [executable],
      cwd: String(runDir),
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    if (!stdout.trim()) throw new Error(`compiled server produced no results (${exitCode})\n${stderr}`);
    const result = JSON.parse(stdout);
    expect(result.revision).toBe(Bun.revision);
    for (const [index, method] of ["POST", "PATCH", "GET"].entries()) {
      expect({ method: result.page[index].method, status: result.page[index].status }).toEqual({ method, status: 200 });
      expect(result.page[index].body).toContain("<title>compiled-method-page</title>");
      expect(result.page[index].body).toBe(result.page[2].body);
    }
    expect(result.page[3]).toEqual({
      method: "HEAD",
      status: 200,
      allow: null,
      length: result.page[2].length,
      body: "",
    });
    expect({ status: result.explicit.status, body: result.explicit.body }).toEqual({
      status: 200,
      body: result.page[2].body,
    });
    expect(result.asset[0].status).toBe(200);
    expect(result.asset[0].body).toContain("compiled-method-asset");
    expect(result.asset[1]).toEqual({
      method: "HEAD",
      status: 200,
      allow: null,
      length: result.asset[0].length,
      body: "",
    });
    expect({ status: result.asset[2].status, body: result.asset[2].body }).toEqual({ status: 404, body: "fallback" });
    expect({ status: result.api.status, body: result.api.body }).toEqual({ status: 200, body: "posted" });
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  },
  // --compile copies the native executable; debug/ASAN binaries can exceed 1 GB.
  60_000,
);
