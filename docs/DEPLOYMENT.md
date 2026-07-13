# Deployment Guide: Vercel, Render, and TiDB Cloud

## Target architecture

```text
https://raktakoshv1.vercel.app
             │ HTTPS API requests
             ▼
https://raktakoshv1.onrender.com
             │ TLS MySQL connection
             ▼
TiDB Cloud
```

The frontend never receives database credentials. The Render service reads a least-privilege database URL from its protected Environment Variables.

## Render backend

Create a Render **Web Service** from this repository. The checked-in `render.yaml` provides the recommended build/start commands.

Add these variables in Render:

```text
NODE_ENV=production
DATABASE_URL=mysql://RUNTIME_USERNAME:RUNTIME_PASSWORD@HOST:4000/raktakosh
DATABASE_SSL=true
FRONTEND_ORIGIN=https://raktakoshv1.vercel.app
STALE_AFTER_HOURS=12
DATABASE_POOL_SIZE=8
AUTO_MIGRATE=false
CSRF_SECRET=replace-with-a-long-random-secret
MFA_ENCRYPTION_KEY=replace-with-a-base64-encoded-32-byte-key
DOCUMENT_STORAGE_MODE=disabled
```

If TiDB requires a CA certificate, add this as a multiline secret:

```text
TIDB_CA_CERT=-----BEGIN CERTIFICATE-----
...certificate content...
-----END CERTIFICATE-----
```

Run database migrations separately with an administrator/migration-only TiDB account before deploying a runtime account:

```text
DATABASE_URL=mysql://MIGRATION_USERNAME:MIGRATION_PASSWORD@HOST:4000/raktakosh npm run db:migrate
```

The runtime database user must have only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` permissions on the `raktakosh` database. It must not have schema-change or administrative privileges. Staff accounts require TOTP multi-factor enrollment on their first sign-in.

Check the endpoint below before deploying the frontend:

```text
https://raktakoshv1.onrender.com/api/health
```

It must return `status: ok` and `database: connected`.

## Vercel frontend

Import the same repository in Vercel as a Vite application. Add this Vercel Environment Variable for Production, Preview, and Development:

```text
VITE_API_BASE_URL=https://raktakoshv1.onrender.com
```

Use:

| Setting | Value |
|---|---|
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

## Deployment order

1. Run the schema migration with a migration-only database identity.
2. Configure Render with runtime-only database credentials and security secrets.
3. Push code to GitHub and deploy the backend.
4. Verify Render `/api/health` reports a connected database.
5. Add `VITE_API_BASE_URL` to Vercel and redeploy it.
6. Enroll each staff account in TOTP MFA at first sign-in.

## Security checklist

- Keep `DATABASE_URL`, CA content, and security secrets only in Render.
- Do not use `VITE_` prefixes for secrets.
- Rotate any password exposed in chat, screenshots, or logs before public use.
- Use a specific `FRONTEND_ORIGIN`; never use `*` with cookie credentials.
- Production documents are deliberately disabled until private object storage, signed downloads, malware scanning, retention controls, and access logging are configured. Do not enable a local-disk upload fallback.
- Before an actual health-service rollout, add verified contact flows, password recovery, backups, monitoring, clinical governance, and privacy/legal approval.
