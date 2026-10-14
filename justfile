set shell := ["bun", "--no-env-file", "exec"]

alias help := list

# List the repository commands.
[default]
list:
    @bun bd --ci=on -j1 just --list

# Build the selected profile with one native build job.
build profile='debug':
    bun bd --profile={{ quote(profile) }} --ci=on -j1

# Run a checkout-binary test file or directory.
test path='test/cli/lint/toolchain.test.ts':
    bun bd --ci=on -j1 test {{ quote(path) }} --max-concurrency=1

# Lint maintained source using the repository exclusions.
lint path='.':
    bun bd --ci=on -j1 lint --config=oxlint.json --format=github -- {{ quote(path) }}

# Format maintained source using the repository exclusions.
fmt path='.':
    bun bd --ci=on -j1 fmt --config=.oxfmtrc.json --write -- {{ quote(path) }}

# Check project types through the linked native checker.
types project='tsconfig.json':
    bun bd --ci=on -j1 check --noEmit --project {{ quote(project) }}

# Inspect a migration target through the linked native migration owner.
n2b path:
    bun bd --ci=on -j1 n2b --jobs=1 -- {{ quote(path) }}

# Check lint and formatting without changing files.
check path='.' project='tsconfig.json': (types project) (lint path)
    bun bd --ci=on -j1 fmt --config=.oxfmtrc.json --check -- {{ quote(path) }}

# Delegate plan, run or status to the existing native CI owner.
native-ci action revision id:
    bun scripts/aphrody/native-ci.ts {{ quote(action) }} --revision {{ quote(revision) }} --id {{ quote(id) }}
