# Raktakosh — Blood Coordination Platform

**Version 1.0**

Raktakosh is a full-stack platform for structured blood-service coordination. It supports public availability discovery, private blood requests, facility inventory updates, controlled donor outreach, role-aware workspaces, and audited operational events.

## Platform capabilities

- Public search by district, blood group, Rh factor, and component.
- Requester registration, sign-in, private request submission, and status tracking.
- Donor registration, outreach consent, availability preferences, and invitation responses.
- Facility inventory management with accountable adjustment history.
- Guarded request-review workflow with internal notes and controlled outreach.
- Administrator views for facilities, policy versions, and audit activity.
- English/Nepali public experience and Asia/Kathmandu time display.

## Architecture

```text
Vercel React frontend → Render Express API → TiDB Cloud / MySQL database
```

The frontend receives only a public API URL. Database credentials are read only by the Render backend through protected environment variables.

## Local development

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create local configuration:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Set `DATABASE_URL` in `.env` to a non-production TiDB/MySQL database.
4. Start both frontend and backend:

   ```powershell
   npm run dev
   ```

Open `http://localhost:5173`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run the Vite client and Express API together. |
| `npm test` | Run business-rule tests. |
| `npm run build` | Type-check and build the frontend. |
| `npm run serve` | Build and start the backend service locally. |

## Deployment

The full Vercel + Render + TiDB setup is documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Key environment variables:

```text
# Render only
DATABASE_URL=mysql://USERNAME:PASSWORD@HOST:4000/DATABASE
FRONTEND_ORIGIN=https://your-vercel-project.vercel.app
NODE_ENV=production

# Vercel only
VITE_API_BASE_URL=https://your-render-service.onrender.com
```

## Documentation

- [Installation guide](docs/INSTALLATION.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Entity relationship diagram](docs/ERD.md)
- [Module catalogue](docs/MODULES.md)
- [Testing report](docs/TESTING-REPORT.md)
- [Viva guide](docs/VIVA-GUIDE.md)
- [Product requirements document](docs/Raktakosh-PRD-and-MVP.md)

## Functional boundary

Raktakosh coordinates information and workflow. Clinical matching, donor medical eligibility, blood testing, reservation, and transfusion decisions remain the responsibility of participating blood-service facilities.
