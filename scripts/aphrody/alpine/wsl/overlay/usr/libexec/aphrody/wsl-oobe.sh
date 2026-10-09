#!/bin/sh
# First interactive shell of Aphrody Alpine (oobe.command of /etc/wsl-distribution.conf).
# Creates the uid 1000 account WSL logs into (oobe.defaultUid). Non-interactive or empty
# answer: user "aphrody". Login shell: bunsh when this Bun has it, else /bin/sh.
set -eu

if getent passwd 1000 >/dev/null 2>&1; then
  exit 0
fi

name=
if [ -t 0 ]; then
  echo 'Aphrody Alpine: create the default user (uid 1000, sudo without password).'
  while :; do
    printf 'User name [aphrody]: '
    read -r name || name=
    name=${name:-aphrody}
    case "$name" in
      [a-z_]*) break ;;
      *) echo 'Use lowercase letters, digits, - and _ (starting with a letter).' ;;
    esac
  done
fi
name=${name:-aphrody}

shell=/bin/sh
if [ -x /bin/bunsh ] && /bin/bunsh -c 'exit 0' >/dev/null 2>&1; then
  shell=/bin/bunsh
fi

getent group 1000 >/dev/null 2>&1 || addgroup -g 1000 "$name"
adduser -D -u 1000 -G "$(getent group 1000 | cut -d: -f1)" -s "$shell" "$name"
for g in wheel aphrody video render input audio; do
  getent group "$g" >/dev/null 2>&1 && addgroup "$name" "$g" >/dev/null 2>&1 || true
done
if [ -d /etc/sudoers.d ]; then
  echo "$name ALL=(ALL) NOPASSWD: ALL" > "/etc/sudoers.d/90-wsl-$name"
  chmod 0440 "/etc/sudoers.d/90-wsl-$name"
fi
echo "User $name created (shell $shell)."
