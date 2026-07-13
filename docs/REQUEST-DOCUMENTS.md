# Verification Documents

## Workflow

1. A requester attaches one required PDF, JPG, or PNG (maximum 5 MB) while creating a blood request.
2. The API verifies the file signature rather than trusting the browser MIME type.
3. The Docker-based API scans the file locally with ClamAV before it is stored. If definitions are unavailable or the file is malicious, the request and file are rejected.
4. A clean file is stored in the private `raktakosh` R2 bucket. No public R2 URL is created.
5. The request enters **Document pending review**. A reviewer or facility administrator at the assigned verified facility can open it through a one-minute signed link and accept or reject it.
6. Acceptance changes the request to **Submitted**. Rejection changes it to **Needs information**, allowing the requester to upload a scanned replacement.

## Access boundaries

- Requesters can access only their own documents.
- Only reviewer and facility-administrator roles at the assigned verified facility can open or review a document.
- Inventory managers do not receive document access.
- Every signed-link authorization and review is written to the audit log.
- The R2 object key is never returned to the browser.

## Production setup

- Keep R2 Public Access disabled.
- Use a bucket-restricted R2 API token with read/write/delete access only to `raktakosh`.
- Deploy the API with the included root `Dockerfile`; it installs ClamAV and refreshes its definitions at runtime. Set `DOCUMENT_SCAN_MODE=clamav_local`. Do not expose a scanner HTTP endpoint.
- Free Render services are ephemeral and can sleep. The workflow stays blocked until definitions have downloaded after a cold start. For an actual service rollout, use a persistent paid deployment or a managed private scanning platform.
- Set `DOCUMENT_RETENTION_DAYS` only after the blood-centre/privacy owner approves a retention period. Configure an R2 lifecycle deletion rule for the same period.
- Rotate any storage or scanner secret exposed in chat, screenshots, source control, or logs.
