import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";

// --experimental-linear-regexp and BUN_FEATURE_FLAG_EXPERIMENTAL_LINEAR_REGEXP=1 make JavaScriptCore
// match regular expressions with a matcher that does not backtrack.
//
// No test here reads a clock. The matcher counts the instructions it runs, and
// `jscInternals.regExpMatchStatistics` reports that count, so "linear" is asserted on the counts
// for subjects of n, 2n and 3n characters.

const flag = "--experimental-linear-regexp";
const variable = "BUN_FEATURE_FLAG_EXPERIMENTAL_LINEAR_REGEXP";

type Switch = { flag?: boolean; env?: Record<string, string> };

async function run(script: string, { flag: withFlag = false, env = {} }: Switch = {}) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), ...(withFlag ? [flag] : []), "-e", script],
    env: { ...bunEnv, [variable]: undefined, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout: stdout.trim(), stderr, exitCode };
}

async function runJSON(script: string, options: Switch = {}) {
  const { stdout, stderr, exitCode } = await run(script, options);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  return JSON.parse(stdout);
}

const engineOf = `
  const { jscInternals } = require("bun:internal-for-testing");
  const engineOf = regExp => jscInternals.regExpMatchStatistics(regExp, "aa!", 0).engine;
`;

describe.concurrent("--experimental-linear-regexp", () => {
  test.each([
    ["the flag", { flag: true }, "linear"],
    ["the environment variable", { env: { [variable]: "1" } }, "linear"],
    ["neither", {}, "backtracking"],
    ["the environment variable set to 0", { env: { [variable]: "0" } }, "backtracking"],
  ] as [string, Switch, string][])("%s selects the matcher", async (_, options, engine) => {
    const result = await runJSON(
      `${engineOf}
      console.log(JSON.stringify({
        literal: engineOf(/(a*)*b/),
        constructed: engineOf(new RegExp("(a*)*b", "i")),
        unicodeSets: engineOf(/[\\p{L}--[a-c]]+/v),
      }));`,
      options,
    );
    expect(result).toEqual({ literal: engine, constructed: engine, unicodeSets: engine });
  });

  test("a Worker has the matcher of its process", async () => {
    const result = await runJSON(
      `${engineOf}
      const worker = new Worker(
        URL.createObjectURL(new Blob([${JSON.stringify(engineOf)} + "postMessage(engineOf(/(a*)*b/));"])),
      );
      worker.onmessage = event => {
        console.log(JSON.stringify({ main: engineOf(/(a*)*b/), worker: event.data }));
        worker.terminate();
      };`,
      { flag: true },
    );
    expect(result).toEqual({ main: "linear", worker: "linear" });
  });

  test("the steps of a match grow linearly with the subject", async () => {
    const rows: {
      pattern: string;
      encoding: string;
      engine: string;
      index: number;
      programSize: number;
      steps: number[];
      scratchBytes: number[];
    }[] = await runJSON(
      `
      const { jscInternals } = require("bun:internal-for-testing");
      const patterns = [
        /(a*)*b/,              // exponential for a backtracking matcher
        /(a|aa)+b/,
        /(x+x+)+y/,
        /^(\\w+\\s?)*$/,
        /(?:(?=a)a|a)*b/,
        /a*a*a*a*a*a*a*a*b/,   // polynomial
        /a*b/,                 // quadratic
      ];
      const rows = [];
      for (const regExp of patterns) {
        const repeated = regExp.source.includes("x") ? "x" : regExp.source.includes("\\\\s") ? "a " : "a";
        for (const encoding of ["latin1", "utf16"]) {
          const statistics = [4096, 8192, 12288].map(length => {
            const subject = Buffer.alloc(repeated.length * length, repeated).toString() + "!" + (encoding === "utf16" ? "\\u2603" : "");
            if (jscInternals.isUTF16String(subject) !== (encoding === "utf16")) throw new Error("not a " + encoding + " string");
            return jscInternals.regExpMatchStatistics(regExp, subject, 0);
          });
          rows.push({
            pattern: String(regExp),
            encoding,
            engine: statistics[0].engine,
            index: statistics[0].index,
            programSize: statistics[0].programSize,
            steps: statistics.map(entry => entry.steps),
            scratchBytes: statistics.map(entry => entry.scratchBytes),
          });
        }
      }
      console.log(JSON.stringify(rows));`,
      { flag: true },
    );

    expect(rows.length).toBe(14);
    for (const row of rows) {
      const [one, two, three] = row.steps;
      expect(row).toMatchObject({ engine: "linear", index: -1 });
      // On one line: the same number of steps for every 4096 characters more.
      expect({ ...row, growth: three - two }).toMatchObject({ growth: two - one });
      expect(two - one).toBeGreaterThan(0);
      // A state is an instruction of the program and one bit, and none is entered twice at a position.
      expect((two - one) / 4096).toBeLessThanOrEqual(3 * row.programSize);
      // The memory of the matcher does not depend on the subject.
      expect(row.scratchBytes).toEqual([row.scratchBytes[0], row.scratchBytes[0], row.scratchBytes[0]]);
    }
  });

  test("matches where the backtracking engines stop at their limits", async () => {
    // Both are matches. A backtracking engine gives up on the first after 100,000,000 steps, and on
    // the second when its 1 MB of contexts is full, and reports "no match" both times.
    const script = `
      console.log(JSON.stringify({
        matchLimit: /(a*)*b|a*!/.test(Buffer.alloc(64, "a").toString() + "!"),
        contextPool: /^(?:a|b)+$/.test(Buffer.alloc(262144, "a").toString()),
      }));`;
    const result = await runJSON(script, { flag: true, env: { BUN_JSC_maxRegExpStackSize: "1048576" } });
    expect(result).toEqual({ matchLimit: true, contextPool: true });
  });

  test("a pattern the matcher cannot run matches as before", async () => {
    const script = `
      const { jscInternals } = require("bun:internal-for-testing");
      const cases = [
        [/(a+)b\\1/, "aabaa"],
        [/(?<quote>['"]).*?\\k<quote>/, "say 'hi' now"],
        [/(?=.*\\d)(?=.*[a-z])\\w{6,}/, "passw0rd"],
        [/(?<=\\$\\d*)\\d/, "cost $105"],
      ];
      console.log(JSON.stringify(cases.map(([regExp, subject]) => {
        const { engine, refusal } = jscInternals.regExpMatchStatistics(regExp, subject, 0);
        const match = regExp.exec(subject);
        return { pattern: String(regExp), engine, refusal, index: match.index, match: [...match] };
      })));`;
    const withSwitch = await runJSON(script, { flag: true });
    expect(withSwitch.map((entry: any) => [entry.pattern, entry.engine, entry.refusal])).toEqual([
      ["/(a+)b\\1/", "backtracking", "backreference"],
      ["/(?<quote>['\"]).*?\\k<quote>/", "backtracking", "backreference"],
      ["/(?=.*\\d)(?=.*[a-z])\\w{6,}/", "backtracking", "lookaround of unbounded length"],
      ["/(?<=\\$\\d*)\\d/", "backtracking", "lookaround of unbounded length"],
    ]);

    const without = await runJSON(script);
    const results = (entries: any[]) => entries.map(({ pattern, index, match }) => ({ pattern, index, match }));
    expect(results(withSwitch)).toEqual(results(without));
    expect(results(withSwitch)[0]).toEqual({ pattern: "/(a+)b\\1/", index: 0, match: ["aabaa", "aa"] });
  });

  test("every RegExp and String method answers as it does without the switch", async () => {
    const script = `
      const { jscInternals } = require("bun:internal-for-testing");
      const cases = [
        [/(a*)*/, "b"], [/(a*)+/, "b"], [/(?:a|())*/, "aa"], [/(a|ab)(c|bcd)(d*)/, "abcd"], [/(z)((a+)?(b+)?(c))*/, "zaacbbbcac"],
        [/(?:(a)|(b)|c)+?$/, "abc"], [/a{2,3}?/g, "aaaaaaa"], [/(?<=(\\d)(\\d))$/, "1053"], [/(?<!\\$)\\b\\d+/g, "cost $10 20 30"],
        [/(?=(a{1,3}))a/g, "baaabac"], [/^\\w+$/gm, "one\\ntwo\\nthree"], [/./gsu, "a\\n\\u{1F600}b"], [/\\bs/giu, "\\u017fs S"],
        [/[^\\W]/giu, "S\\u212a!"], [/(?<year>\\d{4})-(?<month>\\d{2})/g, "2026-09 and 2027-10"], [/(?:(?<n>a)|(?<n>b))+/, "ab"],
        [/[\\p{L}--[a-c]]+/gv, "abcdefabc"], [/\\p{RGI_Emoji}/gv, "a\\u{1F600}b\\u{1F1FA}\\u{1F1F8}"], [/.*a.*/g, "xxaxx\\nyyayy"], [/(?:)/g, "ab"],
        [/a/y, "ba"], [/\\s*,\\s*/g, "a , b,c ,  d"], [/(?i:a)b|c(?-i:d)/gi, "Ab AB cd cD"], [/(\\d+)\\.(\\d+)/dg, "v1.22 v3.4"],
      ];
      const indicesOf = match => match && match.indices ? [...match.indices] : undefined;
      const clone = regExp => new RegExp(regExp.source, regExp.flags);
      console.log(JSON.stringify(cases.map(([regExp, subject]) => {
        const exec = clone(regExp).exec(subject);
        return {
          pattern: String(regExp),
          linear: jscInternals.regExpMatchStatistics(clone(regExp), subject, 0).engine === "linear",
          exec: exec && { index: exec.index, match: [...exec], groups: exec.groups, indices: indicesOf(exec) },
          test: clone(regExp).test(subject),
          match: subject.match(clone(regExp)),
          matchAll: regExp.global ? [...subject.matchAll(clone(regExp))].map(match => [match.index, ...match]) : undefined,
          search: subject.search(clone(regExp)),
          replace: subject.replace(clone(regExp), "<$&|$1>"),
          split: subject.split(clone(regExp)),
        };
      })));`;
    const withSwitch = await runJSON(script, { flag: true });
    const without = await runJSON(script);
    expect(withSwitch.length).toBe(24);
    expect(withSwitch.map((entry: any) => [entry.pattern, entry.linear])).toEqual(
      without.map((entry: any) => [entry.pattern, true]),
    );
    expect(withSwitch.map((entry: any) => ({ ...entry, linear: false }))).toEqual(without);
  });

  test("bun test -t matches test names with the matcher", async () => {
    // With a backtracking matcher the pattern does not match the first name: it stops at its limit.
    const name = Buffer.alloc(64, "a").toString() + "!";
    using dir = tempDir("linear-regexp-test-name-pattern", {
      "names.test.ts": `
        import { test } from "bun:test";
        test(${JSON.stringify(name)}, () => {});
        test("other", () => {});
      `,
    });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "test", flag, "-t", "(a*)*b|a*!", "names.test.ts"],
      env: { ...bunEnv, [variable]: undefined },
      cwd: String(dir),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);
    expect(stderr).toContain(`(pass) ${name}`);
    expect(stderr).toContain(" 1 pass");
    expect(stderr).toContain(" 1 filtered out");
    expect(exitCode).toBe(0);
  });
});
