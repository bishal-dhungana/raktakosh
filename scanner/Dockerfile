FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav clamav-freshclam ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && sed -i 's/^Example/#Example/' /etc/clamav/freshclam.conf \
  && mkdir -p /tmp/raktakosh-scan /var/lib/clamav \
  && chmod 700 /tmp/raktakosh-scan

WORKDIR /app
COPY server.mjs start.sh ./
RUN chmod 0555 /app/start.sh

ENV PORT=8080
EXPOSE 8080

CMD ["/app/start.sh"]
