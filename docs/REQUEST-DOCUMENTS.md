# Verification Documents

## Workflow

1. A requester attaches one required PDF, JPG, or PNG (maximum 5 MB) while creating a blood request.
2. The API verifies the file signature rather than trusting the browser MIME type.
3. In the normal mode, the file is sent only to the private scanner service. If the scan is unavailable or malicious, the request and file are rejected.
4. In explicitly enabled **basic-validation demo mode**, the API checks the file signature, type, and size but does not run malware scanning. These files are permanently labelled **unscanned** in the dashboard and audit trail.
5. An accepted file is stored in the private `raktakosh` R2 bucket. No public R2 URL is created.
6. The request enters **Document pending review**. A reviewer or facility administrator at the assigned verified facility can open it through a one-minute signed link and accept or reject it.
7. Acceptance changes the request to **Submitted**. Rejection changes it to **Needs information**, allowing the requester to upload a replacement.

## Access boundaries

- Requesters can access only their own documents.
- Only reviewer and facility-administrator roles at the assigned verified facility can open or review a document.
- Inventory managers do not receive document access.
- Every signed-link authorization and review is written to the audit log.
- The R2 object key is never returned to the browser.

## Production setup

- Keep R2 Public Access disabled.
- Use a bucket-restricted R2 API token with read/write/delete access only to `raktakosh`.
- Run the included `scanner/` service privately. Set the same long `SCANNER_SHARED_SECRET` in the API and scanner services, and set `DOCUMENT_SCANNER_URL` to the scanner's internal Render address.
- For a short-lived demo only, set `DOCUMENT_SCAN_MODE=basic_validation` on the API. This enables uploads without malware scanning and must never be represented as a clean scan or used for a public production launch.
- Set `DOCUMENT_RETENTION_DAYS` only after the blood-centre/privacy owner approves a retention period. Configure an R2 lifecycle deletion rule for the same period.
- Rotate any storage or scanner secret exposed in chat, screenshots, source control, or logs.
