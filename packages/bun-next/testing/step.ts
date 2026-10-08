// SPDX-License-Identifier: Apache-2.0
// `step()` labels the acquire/release actions of `instant()`. Inside the
// Playwright test runner it is `test.step` (as in `@next/playwright`);
// elsewhere it runs the body, unless a reporter is installed.

export type Step = <T>(title: string, body: () => Promise<T>) => Promise<T>;

const direct: Step = (_title, body) => body();

function playwrightStep(): Step {
  try {
    const pw = require("@playwright/test") as { test?: { step?: Step } };
    const testStep = pw.test?.step;
    if (typeof testStep !== "function") return direct;
    return async (title, body) => {
      try {
        return await testStep(title, body);
      } catch (e) {
        if (e instanceof Error && e.message.includes("can only be called from a test")) return body();
        throw e;
      }
    };
  } catch {
    return direct;
  }
}

let fallback: Step | undefined;
let reporter: Step | null = null;

/**
 * Installs a step reporter (a trace or label sink); `null` restores the
 * default. Returns the previous one so callers can restore it.
 */
export function setStepReporter(next: Step | null): Step {
  const prev = reporter ?? (fallback ??= playwrightStep());
  reporter = next;
  return prev;
}

/** Runs `body` under the installed reporter, else Playwright's `test.step`, else directly. */
export const step: Step = (title, body) => (reporter ?? (fallback ??= playwrightStep()))(title, body);
