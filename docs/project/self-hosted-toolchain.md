# Self-hosted development and delivery

The owner workflow uses the Aphrody Bun fork to run JavaScript and TypeScript
tools. Bun owns the fork's development, build and delivery workflow; Aphrody is
a consumer. Upstream Bun,
Node, npm, Yarn, pnpm and standalone TypeScript or OXC commands are not bootstrap
fallbacks for this workflow.

In this source checkout, use `bun bd` to build through the owner factory and
`bun bd test <file>` to test the changed runtime. Native quality commands are
`bun bd check`, `bun bd lint` and `bun bd fmt`. In a consumer checkout, use the
corresponding `bun check`, `bun lint` and `bun fmt` commands after qualifying the
installed fork revision. `bun run <name>` explicitly selects a package script.

The source-native linter and formatter embed the pinned OXC fork. They do not
install or launch a package backend. Unsupported configuration fails explicitly.
The legacy `--external-backend` compatibility adapter is outside this workflow.

Native `bun check` validates types; it does not emit SDK declarations. Declaration
producers retain their locked TypeScript SDK as an internal library invoked by
Bun. Rust, C++, linker and platform SDK dependencies remain part of the native
factory. They do not replace Bun as the JavaScript tool runner.

GitHub bootstrap accepts only the owned Bun repositories, verifies the release
archive checksum and requires an Aphrody fork revision before adding it to PATH.
Delivery steps and consumer installation reuse the executing Bun binary rather
than resolving another `bun` from PATH.

The native `bun ssh` command provides SSH transport. Docker orchestration and
host deployment require their own qualified Bun modules before the fork workflow
can retire its current external Infra adapter. Preserve protected host credentials
and plan before applying changes; an architectural target does not prove migration.
Keep source qualification, installed-runtime qualification and production checks
separate. Source version `1.4.4` does not establish a published runtime release;
the installed published runtime is `1.4.3-aphrody.4` until a new release is qualified.
