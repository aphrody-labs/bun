# Backend integration checklist

## YouTube official integration

- [x] Search through the official YouTube Data API v3 `search.list` endpoint.
- [x] Restrict results to videos, enable strict safe search, cap each response at 12 items, validate video IDs and thumbnail hosts, and return generic upstream errors.
- [x] Add a Cloudflare per-IP guard at 4 searches per minute to reduce upstream quota abuse.
- [x] Keep the API key server-side and responses `Cache-Control: no-store`; do not persist search results.
- [x] Display YouTube attribution and use the official privacy-enhanced IFrame Player for playback.
- [ ] Provision a production `YOUTUBE_API_KEY` secret restricted to YouTube Data API v3 and the production server source; keep key value out of source, browser bundles, and logs.
- [ ] Verify YouTube API policy/privacy links and the production API search against a production key.

## Google OAuth

- [ ] Not enabled in the static showcase. The repository has a PKCE-based Google OAuth implementation in `packages/bun-google`, but production login needs a durable, encrypted OAuth state/session store and a protected token vault integration before enabling `youtube.readonly`.
- [ ] Configure a first-party Google OAuth client and exact production redirect URI, then add only the `youtube.readonly` scope when account-owned features are implemented. Public search does not require user OAuth.
- [ ] Do not request upload scope, store OAuth tokens in client storage, expose them in responses, or use account APIs before scope consent.

## Community integrations and security

- [x] Keep community extractors and unofficial YouTube stream APIs outside the YouTube search/playback path. YouTube playback uses its official player; its API responses are not used to download, cache, or manipulate YouTube media bytes.
- [ ] Third-party/community source adapters need a per-provider policy, licensing, authentication, rate-limit, and rights review before activation.
- [x] This Worker is read-only apart from its public search call; no account database or user write route is exposed.
