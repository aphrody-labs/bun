// SPDX-License-Identifier: Apache-2.0
// The structural Playwright surface `instant()` needs, and an adapter that
// backs it with a Chrome DevTools Protocol page (any object with a `_send`).

/** The CDP dispatch seam of a page: `_send(method, params)`. */
export interface CdpSend {
  _send(method: string, params: Record<string, unknown>): Promise<unknown>;
}

/** A cookie as `context.cookies()` returns it. */
export interface PwCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

/** A cookie to set. `expires` (Unix seconds) in the past deletes it. */
export interface PwCookieParam {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  expires?: number;
}

/** The part of Playwright's `BrowserContext` that `instant()` uses. */
export interface PlaywrightBrowserContext {
  addCookies(cookies: PwCookieParam[]): Promise<void>;
  cookies(): Promise<PwCookie[]>;
}

/** The part of Playwright's `Page` that `instant()` uses. */
export interface PlaywrightPage {
  url(): string;
  context(): PlaywrightBrowserContext;
}

/** A `PlaywrightBrowserContext` over CDP `Network.*` cookie commands. */
export class CdpCookieContext implements PlaywrightBrowserContext {
  readonly #send: CdpSend;

  constructor(send: CdpSend) {
    this.#send = send;
  }

  /** `Network.setCookies`; a cookie whose `expires` is in the past becomes `Network.deleteCookies`. */
  async addCookies(cookies: PwCookieParam[]): Promise<void> {
    const now = Date.now() / 1000;
    const expired = cookies.filter(c => c.expires !== undefined && c.expires > 0 && c.expires <= now);
    const live = cookies.filter(c => !expired.includes(c));
    for (const c of expired) {
      await this.#send._send("Network.deleteCookies", {
        name: c.name,
        ...(c.url ? { url: c.url } : {}),
        ...(c.domain ? { domain: c.domain } : {}),
        ...(c.path ? { path: c.path } : {}),
      });
    }
    if (live.length > 0) await this.#send._send("Network.setCookies", { cookies: live });
  }

  /** `Network.getCookies` for the whole jar. */
  async cookies(): Promise<PwCookie[]> {
    const result = (await this.#send._send("Network.getCookies", {})) as { cookies?: PwCookie[] };
    return result.cookies ?? [];
  }

  /**
   * Deletes cookies: all of them without options, by `name` (optionally scoped
   * to `domain`/`path`), or every cookie matching `domain`/`path`.
   */
  async clearCookies(options?: { name?: string; domain?: string; path?: string }): Promise<void> {
    if (!options || (!options.name && !options.domain && !options.path)) {
      await this.#send._send("Network.clearBrowserCookies", {});
      return;
    }
    if (options.name) {
      await this.#send._send("Network.deleteCookies", {
        name: options.name,
        ...(options.domain ? { domain: options.domain } : {}),
        ...(options.path ? { path: options.path } : {}),
      });
      return;
    }
    for (const c of await this.cookies()) {
      if (options.domain && c.domain !== options.domain) continue;
      if (options.path && c.path !== options.path) continue;
      await this.#send._send("Network.deleteCookies", {
        name: c.name,
        ...(c.domain ? { domain: c.domain } : {}),
        ...(c.path ? { path: c.path } : {}),
      });
    }
  }
}

/** A CDP-backed page: a URL getter plus either a `_cdp` object or its own `_send`. */
export interface WebPageLike {
  url(): string;
  _cdp?: CdpSend;
  _send?: CdpSend["_send"];
}

const adapted = new WeakMap<WebPageLike, PlaywrightPage>();

/**
 * Wraps a CDP-backed page as a `PlaywrightPage`. The result is memoised per
 * page, so every `instant()` on the same page sees the same context (nesting
 * detection is keyed on the context, as in `@next/playwright`).
 */
export function adaptPage(page: WebPageLike): PlaywrightPage {
  const cached = adapted.get(page);
  if (cached) return cached;
  let send: CdpSend;
  if (page._cdp) send = page._cdp;
  else if (page._send) send = { _send: page._send.bind(page) };
  else throw new TypeError("adaptPage: the page exposes neither `_cdp` nor `_send`; pass a CDP-backed page.");
  const context = new CdpCookieContext(send);
  const result: PlaywrightPage = { url: () => page.url(), context: () => context };
  adapted.set(page, result);
  return result;
}
