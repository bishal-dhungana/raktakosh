FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav clamav-freshclam ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && sed -i 's/^Example/#Example/' /etc/clamav/freshclam.conf \
  && (getent group clamav >/dev/null || groupadd --system clamav) \
  && (id -u clamav >/dev/null 2>&1 || useradd --system --gid clamav --home-dir /var/lib/clamav --shell /usr/sbin/nologin clamav) \
  && mkdir -p /tmp/raktakosh-document-scan /var/lib/clamav \
  && chown -R clamav:clamav /var/lib/clamav \
  && chmod 700 /tmp/raktakosh-document-scan

WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && chmod 0555 /app/docker-start.sh

ENV NODE_ENV=production
EXPOSE 10000
CMD ["/app/docker-start.sh"]
