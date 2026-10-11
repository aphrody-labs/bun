# Crunchyroll client migration

The native TypeScript client in `src/crunchyroll.ts` implements every public function
from the inspected MIT-licensed `crunchyroll.js` 1.1.1 migration baseline: `login`, `getProfile`,
`getAnime`, `getSeasons`, `getEpisodes`, `getCategories`, `getRate`, `getSimilar`,
`search`, `getAllAnimes`, and `getNewsFeed`. `client` is an isolated default instance;
`createCrunchyrollClient` creates independently configured instances. The implementation
uses native fetch and URLSearchParams, without CommonJS, the deprecated `request`
dependency, Buffer conversion or String prototype modifications. Upstream license
and attribution remain in the license notice below. The deprecated upstream
package and its `request` dependency are removed from production dependencies.

Construct a client with caller-owned `basicAuthorization` for password login,
or with `accessToken` and optional `accountId` followed by `loginWithAccessToken()`.
No upstream embedded application credentials are bundled. The unconfigured default
facade cannot log in until the caller instead creates a configured client.
`client.client` and login results expose a safe status snapshot rather than tokens,
CMS signatures or saved passwords. Error messages omit response bodies. Credentials
are private instance state and used only on the configured HTTPS origin; plain HTTP
is accepted only for loopback tests. Redirects are refused and requests support a
caller AbortSignal and a finite timeout (30 seconds by default).

The endpoint paths, English default locale, signed CMS query fields, pagination
defaults (`start=0`, `n=10`, `sort_by=alphabetical`) and four-minute authentication
refresh follow upstream. Query values and path IDs are encoded. Refresh now occurs
before constructing CMS paths, retains the selected locale and deduplicates parallel
refreshes. Access-token sessions refresh CMS authorization with the supplied token;
an expired token must be replaced by the caller. Password sessions repeat the
upstream password grant. This is a client API migration, not the official Crunchyroll
SDK, and does not promise that historical beta API endpoints currently support that
grant or those content routes.

The local-server test covers all public operations, OAuth form requests, pagination,
query encoding, isolated credentials, refresh, HTTP/API/JSON errors, redirects,
cancellation and deadlines. It neither uses the user's cookies nor contacts the
public service, retrieves video media, requests licenses or alters DRM. Live
authorized account playback and registry publication require separate qualification.

## Upstream license

MIT License

Copyright (c) 2022 Mssjim

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
