#!/bin/sh
set -eu

mkdir -p /var/run/clamav /var/lib/clamav /tmp/raktakosh-document-scan

# The API stays fail-closed until the first signature update completes. Keep
# this loop in the foreground of a child shell: detached freshclam daemons can
# be stopped by free containers before their first database download finishes.
(
  while true; do
    freshclam --stdout --config-file=/etc/clamav/freshclam.conf || true
    sleep 21600
  done
) &

exec npm start
