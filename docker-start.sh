#!/bin/sh
set -eu

mkdir -p /var/run/clamav /var/lib/clamav /tmp/raktakosh-document-scan
rm -f /var/run/clamav/freshclam.pid

# The API stays fail-closed until fresh malware definitions are available.
# On free Render cold starts definitions are downloaded again before uploads open.
freshclam --daemon --checks=24 --config-file=/etc/clamav/freshclam.conf >/proc/1/fd/1 2>/proc/1/fd/2 &

exec npm start
