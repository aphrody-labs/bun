import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";

function dockerFixture() {
  const requests: string[] = [];
  const id = "a".repeat(64);
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requests.push(`${request.method} ${url.pathname}${url.search}`);
      if (url.pathname === "/version") return Response.json({ ApiVersion: "1.99", MinAPIVersion: "1.24" });
      if (url.pathname === "/v1.51/containers/json") return Response.json([{ Id: id, Names: ["/example"] }]);
      if (url.pathname === "/v1.51/containers/example/json") return Response.json({ Id: id });
      if (url.pathname === `/v1.51/containers/${id}/start`) return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    },
  });
  const host = `tcp://127.0.0.1:${server.port}`;
  const run = async (args: string[], experimental?: string) => {
    await using process = Bun.spawn({
      cmd: [bunExe(), "docker", "--host", host, ...args],
      env: {
        ...bunEnv,
        DOCKER_HOST: undefined,
        DOCKER_TLS_VERIFY: undefined,
        BUN_FEATURE_FLAG_EXPERIMENTAL_DOCKER_MUTATIONS: experimental,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      process.stdout.text(),
      process.stderr.text(),
      process.exited,
    ]);
    return { stdout, stderr, exitCode };
  };
  return { requests, id, host, run, stop: () => server.stop(true) };
}

test("native Docker negotiates Engine API for read-only container listing", async () => {
  const fixture = dockerFixture();
  try {
    const listed = await fixture.run(["ps", "--all"]);
    expect(listed.stderr).toBe("");
    expect(JSON.parse(listed.stdout)[0].Id).toBe(fixture.id);
    expect(fixture.requests).toEqual(["GET /version", "GET /v1.51/containers/json?all=1"]);
    expect(listed.exitCode).toBe(0);
  } finally {
    await fixture.stop();
  }
});

test("native Docker resolves mutation plans without applying them", async () => {
  const fixture = dockerFixture();
  try {
    const planned = await fixture.run(["start", "example"]);
    expect(planned.stderr).toBe("");
    expect(JSON.parse(planned.stdout)).toEqual({
      host: fixture.host,
      method: "POST",
      path: `/v1.51/containers/${fixture.id}/start`,
      containerId: fixture.id,
      apply: false,
    });
    expect(fixture.requests).toEqual(["GET /version", "GET /v1.51/containers/example/json"]);
    expect(planned.exitCode).toBe(0);
  } finally {
    await fixture.stop();
  }
});

test.each([undefined, "", "0", "false", "no", "off"])(
  "native Docker blocks apply before daemon I/O with feature flag %s",
  async disabled => {
    const fixture = dockerFixture();
    try {
      const blocked = await fixture.run(["start", "example", "--apply"], disabled);
      expect(blocked.stderr).toContain("mutations are experimental");
      expect(blocked.stdout).toBe("");
      expect(fixture.requests).toEqual([]);
      expect(blocked.exitCode).toBe(1);
    } finally {
      await fixture.stop();
    }
  },
);

test("native Docker applies an explicitly enabled mutation to the resolved container ID", async () => {
  const fixture = dockerFixture();
  try {
    const applied = await fixture.run(["start", "example", "--apply"], "1");
    expect(applied.stderr).toBe("");
    expect(JSON.parse(applied.stdout).applied).toBe(true);
    expect(fixture.requests).toEqual([
      "GET /version",
      "GET /v1.51/containers/example/json",
      `POST /v1.51/containers/${fixture.id}/start`,
    ]);
    expect(applied.exitCode).toBe(0);
  } finally {
    await fixture.stop();
  }
});
