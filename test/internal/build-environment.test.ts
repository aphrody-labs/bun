import { expect, test } from "bun:test";
import { formatEnvironmentVariableNames } from "../../scripts/buildkite.ts";

test("build diagnostics never read environment values, including unrecognized credentials", () => {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of ["AWS_SECRET_ACCESS_KEY", "ACTIONS_RUNTIME_TOKEN", "CUSTOM_CREDENTIAL", "HTTPS_PROXY"])
    Object.defineProperty(environment, name, {
      enumerable: true,
      get() {
        throw new Error("Credential values must not be read for build diagnostics");
      },
    });

  expect(formatEnvironmentVariableNames(environment)).toBe(
    '"ACTIONS_RUNTIME_TOKEN"\n"AWS_SECRET_ACCESS_KEY"\n"CUSTOM_CREDENTIAL"\n"HTTPS_PROXY"',
  );
});

test("build diagnostics escape control characters in environment names", () => {
  expect(formatEnvironmentVariableNames({ "BUILD\nFORGED: secret": "private-value", CI: "true" })).toBe(
    '"BUILD\\nFORGED: secret"\n"CI"',
  );
  expect(formatEnvironmentVariableNames({})).toBe("");
});
