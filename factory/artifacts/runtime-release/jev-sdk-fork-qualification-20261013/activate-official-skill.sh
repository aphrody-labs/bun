#!/usr/bin/env bash
set -euo pipefail
canonical=$HOME/.agents/skills/typesafe-ai
[[ $(realpath "$canonical") == "$canonical" ]]
printf '%s  %s\n' 71ea90d7906c6554c4f4c460ef7361b2d26f59116ccdae986dc6d997b9389f52 "$canonical/SKILL.md" | sha256sum -c -
printf '%s  %s\n' 835f233f1d6ed84a9b9a351aba0689b47644a4137d6316911fc7957bde523b02 "$canonical/LICENSE" | sha256sum -c -
for harness in .codex .claude; do
  mkdir -p "$HOME/$harness/skills"
  alias=$HOME/$harness/skills/typesafe-ai
  if [[ -e $alias || -L $alias ]]; then
    [[ $(realpath "$alias") == "$canonical" ]] || { echo 'Skill owner conflict; existing alias preserved' >&2; exit 1; }
  else
    ln -s "$canonical" "$alias"
  fi
  printf 'OFFICIAL_SKILL_ACTIVE %s\n' "$alias"
done
