#!/bin/sh
# boot.command of /etc/wsl.conf: runs as root once per WSL VM boot (no init system).
for f in /etc/sysctl.d/*.conf; do
  [ -r "$f" ] && sysctl -q -p "$f" >/dev/null 2>&1
done
for f in /etc/local.d/*.start; do
  [ -x "$f" ] && "$f"
done
exit 0
