#!/bin/sh
set -eu

mkdir -p /var/run/clamav /var/lib/clamav /tmp/raktakosh-scan
rm -f /var/run/clamav/freshclam.pid

# Definitions refresh in the background. Until at least one valid database is
# present, /health and /scan fail closed rather than accepting unscanned files.
freshclam --daemon --checks=24 --config-file=/etc/clamav/freshclam.conf >/proc/1/fd/1 2>/proc/1/fd/2 &

exec node /app/server.mjs
