#!/bin/sh
# boot.command of /etc/wsl.conf: runs as root once per WSL VM boot (no init system).
# GTK and GLib read the D-Bus machine id; without systemd nothing writes it.
if [ ! -s /etc/machine-id ]; then
  tr -d '-' < /proc/sys/kernel/random/uuid > /etc/machine-id
  chmod 0444 /etc/machine-id
fi
mkdir -p /var/lib/dbus
[ -e /var/lib/dbus/machine-id ] || ln -s /etc/machine-id /var/lib/dbus/machine-id
for f in /etc/sysctl.d/*.conf; do
  [ -r "$f" ] && sysctl -q -p "$f" >/dev/null 2>&1
done
for f in /etc/local.d/*.start; do
  [ -x "$f" ] && "$f"
done
exit 0
