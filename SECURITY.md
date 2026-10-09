# Security policy

This policy covers the Aphrody runtime component built from this repository (`aphrody-labs/bun`): the `bun`
executable from `aphrody-v*` releases, its installers, and the `@aphrody/*` npm packages and crates published from
this repository.

## Supported versions

| Version                                                    | Supported                         |
| ---------------------------------------------------------- | --------------------------------- |
| Latest `aphrody-v*` release                                | yes                               |
| `main`                                                     | yes (fixes land here first)       |
| Older `aphrody-v*` releases                                | no; upgrade with `bun upgrade`    |
| Upstream Bun releases (`bun-v*` from oven-sh/bun, bun.com) | no; see Bun's own security policy |

Fixes are released as a new `aphrody.<n>` release of the current upstream base version. Release notes are in
[RELEASES.md](RELEASES.md).

## Reporting a vulnerability

Do not open a public issue. Report privately through either channel:

- GitHub private vulnerability reporting:
  [Report a vulnerability](https://github.com/aphrody-labs/bun/security/advisories/new);
- email: `contact@aphrody.com`, with "security" in the subject.

Include the affected version (`bun --revision`), the platform, and a reproduction. Reports are acknowledged within
5 days. Coordinated disclosure goes through a GitHub security advisory on this repository, published together with
the release that contains the fix.

## Upstream issues

A vulnerability that also affects upstream Bun is fixed here and reported to Bun's maintainers through their own
security policy (https://github.com/oven-sh/bun/security). When the issue is upstream-only (it is not present in
this component), report it to them directly.
