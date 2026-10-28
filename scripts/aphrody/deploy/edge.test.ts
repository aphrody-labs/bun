import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { edgeConfig, startEdge } from "./edge";

const roots = [
  { host: "cdn.example", root: "/srv/cdn" },
  { host: "dl.example", root: "/srv/dl" },
];

test("one server block per root, shared tuning", () => {
  const conf = edgeConfig({ prefix: "/p", roots, upstream: "127.0.0.1:9077" });
  expect(conf.match(/server_name /g)?.length).toBe(2);
  expect(conf).toContain("server_name cdn.example;");
  expect(conf).toContain("upstream edge_origin { server 127.0.0.1:9077;");
  expect(conf).toContain("open_file_cache");
  expect(conf).not.toMatch(/^\s*(daemon|pid)\b/m);
});

test("without upstream every miss is a 404 and no cache zone is declared", () => {
  const conf = edgeConfig({ prefix: "/p", roots });
  expect(conf).toContain("=404");
  expect(conf).not.toContain("proxy_cache");
  expect(conf).not.toContain("@origin");
});

test("tls roots listen on the TLS port with their certificate", () => {
  const conf = edgeConfig({
    prefix: "/p",
    upstream: "127.0.0.1:9077",
    roots: [{ host: "source.example", root: "/srv/s", tls: { certificate: "/c/f.pem", key: "/c/k.pem" } }],
  });
  expect(conf).toContain("listen 443 ssl;");
  expect(conf).toContain("ssl_certificate /c/f.pem;");
  expect(conf).toContain("proxy_pass http://edge_origin;");
});

test("release roots proxy the release surfaces with a static fallback", () => {
  const conf = edgeConfig({
    prefix: "/p",
    releaseUpstream: "127.0.0.1:8798",
    roots: [{ host: "source.example", root: "/srv/s", release: true }],
  });
  expect(conf).toContain("upstream edge_release { server 127.0.0.1:8798;");
  expect(conf).toContain("error_page 502 503 504 = @static;");
});

test("starting requires an explicit adapter and validates before starting", async () => {
  const prefix = mkdtempSync(join(tmpdir(), "bun-edge-"));
  const events: string[] = [];
  try {
    const config = { prefix, roots };
    await expect(startEdge(config)).rejects.toThrow("adapter required");
    const controller = await startEdge(config, "/custom/nginx", {
      async create(options) {
        expect(options.binary).toBe("/custom/nginx");
        expect(readFileSync(join(prefix, options.configFile), "utf8")).toContain("server_name cdn.example;");
        return {
          async validate() { events.push("validate"); },
          async start() { events.push("start"); },
          async close() { events.push("close"); },
        };
      },
    });
    await controller.close();
    expect(events).toEqual(["validate", "start", "close"]);
  } finally {
    rmSync(prefix, { recursive: true, force: true });
  }
});
