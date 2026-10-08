// SPDX-License-Identifier: Apache-2.0
// Port of `instant()` from `@next/playwright` (Next.js 16.5 canary,
// vendor/next.js/packages/next-playwright/src/index.ts) that also accepts a
// CDP-backed page. Within an `instant()` scope Next.js renders only cached and
// prefetched UI (Cache Components); the scope is driven by the
// `next-instant-navigation-testing` cookie that Next's
// navigation-testing-lock.ts watches through the CookieStore change event.

import { adaptPage, type PlaywrightBrowserContext, type PlaywrightPage, type WebPageLike } from "./context.ts";
import { step } from "./step.ts";

/** The cookie Next.js watches. Must match the Next.js runtime exactly. */
export const INSTANT_COOKIE = "next-instant-navigation-testing";

// Contexts with an `instant()` scope running. Nesting is tracked in-process
// rather than inferred from the cookie: a locked page may re-write the cookie
// right after a scope released it, and that leftover must not block the next
// scope.
const contextsWithActiveScope = new WeakSet<PlaywrightBrowserContext>();

function isPlaywrightPage(target: unknown): target is PlaywrightPage {
  return typeof target === "object" && target !== null && typeof (target as PlaywrightPage).context === "function";
}

/**
 * Runs `fn` with instant navigation enabled: navigations render the prefetched
 * UI immediately and wait for `fn` before streaming dynamic data. On a fresh
 * page (before any navigation) pass `baseURL` so the cookie gets the right
 * domain.
 */
export async function instant<T>(
  page: PlaywrightPage | WebPageLike,
  fn: () => Promise<T>,
  options?: { baseURL?: string },
): Promise<T> {
  const pw = isPlaywrightPage(page) ? page : adaptPage(page);
  const context = pw.context();
  if (contextsWithActiveScope.has(context)) {
    throw new Error(
      "An instant() scope is already active. Nesting instant() calls is not supported. " +
        "Did you forget to await the previous instant() call?",
    );
  }
  // Resolve before touching browser state, so misuse fails without half-entering a scope.
  const { hostname } = new URL(resolveURL(pw, options));

  contextsWithActiveScope.add(context);
  try {
    // No scope is active for this context, so a cookie left here is stale.
    await releaseInstantCookie(context);
    await step("Acquire Instant Lock", () =>
      context.addCookies([
        { name: INSTANT_COOKIE, value: JSON.stringify([0, `p${Math.random()}`]), domain: hostname, path: "/" },
      ]),
    );
    try {
      return await fn();
    } finally {
      await step("Release Instant Lock", () => releaseInstantCookie(context));
    }
  } finally {
    contextsWithActiveScope.delete(context);
  }
}

/**
 * Deletes only the instant cookie by re-adding its entries with a past expiry.
 * Playwright's filtered `clearCookies` empties the whole jar and re-adds the
 * rest, which lets a re-render triggered by the deletion observe no app
 * cookies. A locked page can re-write the cookie just after it is deleted, so
 * this re-reads and re-deletes, at most five times.
 */
async function releaseInstantCookie(context: PlaywrightBrowserContext): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const entries = (await context.cookies()).filter(cookie => cookie.name === INSTANT_COOKIE);
    if (entries.length === 0) return;
    await context.addCookies(
      entries.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: 1,
      })),
    );
  }
}

/** The URL the cookie is scoped to: `baseURL`, else the page's URL. Throws on a fresh page without `baseURL`. */
export function resolveURL(page: PlaywrightPage, options?: { baseURL?: string }): string {
  const url = options?.baseURL ?? page.url();
  if (url && url !== "about:blank") return url;
  const error = new Error(
    `Could not infer the base URL of the application.

instant() needs to know the base URL so it can configure the
browser before the first page load. If the page is already
loaded, the base URL is detected automatically.
Otherwise, you can fix this in one of two ways:

1. Pass a baseURL option:

  await instant(page, async () => {
    await page.goto('http://localhost:3000')
    // ...
  }, { baseURL: 'http://localhost:3000' })

2. Navigate to a page before calling instant():

  await page.goto('http://localhost:3000')
  await instant(page, async () => {
    // ...
  })`,
  );
  Error.captureStackTrace?.(error, instant);
  throw error;
}
