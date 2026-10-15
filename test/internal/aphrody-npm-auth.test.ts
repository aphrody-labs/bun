import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "harness";

test.skipIf(process.platform !== "linux")(
  "publication auth uses an ephemeral environment reference and preserves existing credentials",
  async () => {
    const workflow = Bun.YAML.parse(
      await Bun.file(new URL("../../.github/workflows/aphrody-publish-npm.yml", import.meta.url)).text(),
    ) as { jobs: { publish: { steps: { name?: string; run?: string }[] } } };
    const publish = workflow.jobs.publish.steps.find(step => step.name === "Publish")?.run;
    if (typeof publish !== "string") throw new Error("Publication workflow is missing its owner script");
    const start = publish.indexOf("auth_config=");
    const end = publish.indexOf("stable=", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // Redirect the standard profile path only for this isolated shell fixture.
    const auth = publish.slice(start, end).replaceAll("$HOME", "$auth_home");
    using directory = tempDir("publication-auth", { "home/.keep": "" });
    const root = String(directory);
    const env = { ...process.env, RUNNER_TEMP: root, auth_home: join(root, "home"), NPM_TOKEN: "public-test-canary" };
    const assertion = `test "$(stat -c %a "$auth_config")" = 600
test "$(cat "$auth_config")" = '//registry.npmjs.org/:_authToken=\${NPM_TOKEN}'
test -L "$auth_home/.npmrc"
echo qualified`;
    const result = Bun.spawnSync(["bash", "-e", "-c", auth + assertion], { env, stdout: "pipe", stderr: "pipe" });
    expect(result.stdout.toString().trim()).toBe("qualified");
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(join(env.auth_home, ".npmrc")).exists()).toBe(false);
    expect([...new Bun.Glob("aphrody-npmrc.*").scanSync({ cwd: root })]).toEqual([]);
    const existing = join(env.auth_home, ".npmrc");
    await Bun.write(existing, "existing-protected-fixture");
    const refused = Bun.spawnSync(["bash", "-e", "-c", auth + assertion], { env, stdout: "pipe", stderr: "pipe" });
    expect(refused.exitCode).not.toBe(0);
    expect(await Bun.file(existing).text()).toBe("existing-protected-fixture");
    expect([...new Bun.Glob("aphrody-npmrc.*").scanSync({ cwd: root })]).toEqual([]);
  },
);
