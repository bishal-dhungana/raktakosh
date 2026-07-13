#!/bin/sh
set -eu

mkdir -p /var/run/clamav /var/lib/clamav /tmp/raktakosh-document-scan

# A free Render instance cannot safely run Node and ClamAV's database updater
# at the same time. Refresh before starting the API instead. If the update
# fails, the API still starts but document uploads remain fail-closed because
# no signature files are present.
freshclam --stdout --config-file=/etc/clamav/freshclam.conf || true

exec npm start
