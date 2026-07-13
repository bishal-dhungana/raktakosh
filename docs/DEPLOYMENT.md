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

The frontend never receives database credentials. The Render service reads the database URL from its protected Environment Variables.

## Render backend

Create a Render **Web Service** from this repository. The checked-in `render.yaml` provides the recommended build/start commands.

Add these variables in Render:

```text
NODE_ENV=production
DATABASE_URL=mysql://USERNAME:PASSWORD@HOST:4000/raktakosh
DATABASE_SSL=true
FRONTEND_ORIGIN=https://raktakoshv1.vercel.app
STALE_AFTER_HOURS=12
DATABASE_POOL_SIZE=8
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=use-a-unique-strong-password
BOOTSTRAP_REVIEWER_EMAIL=reviewer@example.com
BOOTSTRAP_REVIEWER_PASSWORD=use-a-unique-strong-password
BOOTSTRAP_INVENTORY_EMAIL=inventory@example.com
BOOTSTRAP_INVENTORY_PASSWORD=use-a-unique-strong-password
```

If TiDB requires a CA certificate, add this as a multiline secret:

```text
TIDB_CA_CERT=-----BEGIN CERTIFICATE-----
...certificate content...
-----END CERTIFICATE-----
```

On first boot, the backend creates tables, reference facilities, policies, and the configured staff accounts. Check the endpoint below before deploying the frontend:

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

1. Push code to GitHub.
2. Configure Render variables and deploy the backend.
3. Verify Render `/api/health` reports a connected database.
4. Add `VITE_API_BASE_URL` to Vercel.
5. Redeploy Vercel.
6. Create requester/donor accounts from the frontend and use the configured staff credentials for facility/admin access.

## Security checklist

- Keep `DATABASE_URL`, CA content, and bootstrap passwords only in Render.
- Do not use `VITE_` prefixes for secrets.
- Rotate any password exposed in chat, screenshots, or logs before public use.
- Use a specific `FRONTEND_ORIGIN`; never use `*` with cookie credentials.
- Before an actual health-service rollout, add managed private document storage, malware scanning, verified contact flows, backups, monitoring, clinical governance, and privacy/legal approval.
