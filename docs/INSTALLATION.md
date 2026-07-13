# Installation and Local Development

## Prerequisites

- Node.js 24 or later
- npm 11 or later
- A TiDB Cloud or MySQL database for local development

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Open `.env` and configure a **non-production** database URL:

```text
DATABASE_URL=mysql://USERNAME:PASSWORD@HOST:4000/DATABASE
```

If your TiDB cluster requires a CA certificate, copy its contents to `TIDB_CA_CERT` in `.env`. Never commit `.env`.

Create staff credentials for local use by populating the `BOOTSTRAP_*` variables in `.env`. Requester and donor accounts can be created from the application itself.

## Run

```powershell
npm run dev
```

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| API | `http://localhost:8787` |
| API health | `http://localhost:8787/api/health` |

## Verify

```powershell
npm test
npm run build
```

If `npm run dev` reports that a port is already in use, close the earlier development terminal before retrying.
