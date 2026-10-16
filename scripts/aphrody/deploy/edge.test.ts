import { expect, test } from "bun:test";
import { edgeConfig } from "./edge";

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
