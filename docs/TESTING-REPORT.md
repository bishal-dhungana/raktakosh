# Testing Report

## Automated verification

| Area | Command | Expected result |
|---|---|---|
| Business rules | `npm test` | Request transition and availability-state tests pass. |
| Type safety | `npm run build` | TypeScript compilation completes without errors. |
| Frontend bundle | `npm run build` | Vite generates the `dist/` web bundle. |
| Dependencies | `npm audit --omit=dev` | No known production dependency vulnerabilities. |

## Deployment smoke test

After deploying the backend, request:

```text
GET https://your-render-service.onrender.com/api/health
```

Expected result:

```json
{
  "status": "ok",
  "database": "connected"
}
```

Then redeploy Vercel and verify:

1. Public facility search loads from the hosted API.
2. Requester registration and login succeed.
3. A donor can create a profile and change consent.
4. Bootstrap facility accounts can sign in.
5. An invalid request transition receives HTTP 409.
