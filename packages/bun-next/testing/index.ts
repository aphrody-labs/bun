// SPDX-License-Identifier: Apache-2.0
// `@aphrody/next-bun/testing`: Next.js instant navigation testing for
// Playwright pages and CDP-backed pages.

export { INSTANT_COOKIE, instant, resolveURL } from "./instant.ts";
export {
  adaptPage,
  CdpCookieContext,
  type CdpSend,
  type PlaywrightBrowserContext,
  type PlaywrightPage,
  type PwCookie,
  type PwCookieParam,
  type WebPageLike,
} from "./context.ts";
export { setStepReporter, step, type Step } from "./step.ts";
