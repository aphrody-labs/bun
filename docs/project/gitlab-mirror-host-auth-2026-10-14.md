# GitLab mirror and host authentication — 2026-10-14

## Scope

This record contains only operations verified during the session. The broader
requests to purge workstation data, services, caches, Docker, WSL, models,
packages, logs, worktrees and repositories were not executed and are not
claimed here.

## GitLab mirror

- GitHub `aphrody-labs/bun` remains the authoritative repository.
- GitLab project: `https://gitlab.com/aphrody-labs/bun`.
- GitLab project ID: `87612610`.
- Visibility: private, inherited from the private `aphrody-labs` namespace.
- Pull mirroring: enabled.
- Initial import: finished without an import error.
- Default branch: `main`.
- GitHub `origin/main` and GitLab `main` both resolved to
  `c7336fa6db314a633ab06b12b2d9f6a0f4157977` after import.

An earlier project created with an initialized README could not accept the pull
mirror because its default branch already existed. That disposable project was
permanently removed, then replaced by the current empty import-backed project.
It is not a fallback, archive or alternate mirror.

## VPS and DBFR

Both SSH aliases answered fresh bounded probes. On each host:

- `glab 1.123.0` was installed at `~/.local/bin/glab` from the official GitLab
  generic package after checksum verification;
- GNOME Keyring and Secret Service support were installed and initialized;
- `glab auth status` identified `aphrody-dev` and SSH Git transport;
- the credential was found in the operating-system keyring;
- the login keyring file was mode `600`;
- no token value was present in the plaintext `glab` configuration.

The temporary installer directory, probe secret and authentication helper were
removed. No provider credential value is recorded in this document.

Host reachability, authentication validity and mirror parity are live facts.
Future agents must probe them again instead of reusing this dated evidence as a
current guarantee.
