# Native Docker Engine client

`bun docker` connects directly to the Docker Engine HTTP API. It does not invoke
the Docker executable or require an Aphrody service.

Supported commands are `version`, `info`, `ps [--all]`, `images`,
`start <container> [--apply]` and `stop <container> [--apply]`.
Start and stop resolve the container's full ID and print a POST plan by default.
Mutations are disabled by default. `--apply` sends that POST only when
`BUN_FEATURE_FLAG_EXPERIMENTAL_DOCKER_MUTATIONS=1` is set; absent, false or
invalid values reject the request before connecting to the daemon. The flag
retains container ID validation and does not change daemon permissions.
Container inspection output, including environment variables, is not included
in the plan.

`--host` overrides `DOCKER_HOST`. The default is the local Unix socket on Unix
and the Docker Engine named pipe on Windows. Supported transports are:

- `unix:///var/run/docker.sock` on Unix targets;
- `npipe:////./pipe/docker_engine` on Windows;
- `tcp://host:port` without TLS;
- `ssh://alias` through the native Bun SSH client and the remote Unix socket.

SSH reuses existing SSH configuration, authentication and host-key stores.
It opens a `direct-streamlocal` channel to `/var/run/docker.sock`; the remote
SSH server must allow socket forwarding and the authenticated user must have
socket access. It does not run a remote Docker executable.

Requests have a 30-second deadline and an eight-MiB response limit. The client
negotiates the daemon's API version within 1.24 through 1.51. Unsupported versions,
transports, HTTP errors and invalid responses fail without an executable fallback.
`DOCKER_TLS_VERIFY` fails explicitly because TLS is not implemented by this client.

Compose, Buildx, image builds, registry operations and Docker contexts are not
implemented. The existing Alpine image definitions and release pipeline retain
their own checksum, host and resource policies. The Docker daemon owns namespace,
cgroup and seccomp management; the client does not duplicate `bun:linux` bindings.

The request contract follows the [Docker Engine API v1.51 specification](https://github.com/moby/moby/blob/v28.3.0/docs/api/v1.51.yaml).
