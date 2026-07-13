# Raktakosh — Blood Coordination Platform

Raktakosh is a full-stack platform for structured blood-service coordination in Nepal. It helps people find facility-reported availability, submit private requests to verified facilities, and follow an accountable workflow without exposing donor, patient, or staff data publicly.

> **Important:** Raktakosh supports coordination only. It does not perform clinical matching, donor eligibility screening, blood testing, reservations, or transfusion decisions. Those responsibilities always remain with the participating blood-service facility.

## Contents

- [What the platform provides](#what-the-platform-provides)
- [User roles](#user-roles)
- [Multi-tenant Blood Bank management](#multi-tenant-blood-bank-management)
- [How coordination works](#how-coordination-works)
- [Technology and architecture](#technology-and-architecture)
- [Nepal district coverage](#nepal-district-coverage)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [Commands and verification](#commands-and-verification)
- [Deployment](#deployment)
- [Security and operational boundaries](#security-and-operational-boundaries)
- [Documentation](#documentation)

## What the platform provides

- Public search of verified facility-reported inventory by district, blood group, Rh factor, and blood component.
- A separate no-login search of source-backed Blood Banks across Nepal, with listed contact numbers and NPHL-reported stock snapshots.
- A canonical directory of all **77 Nepal districts** for search, donor profiles, and private requests.
- Private blood-request creation with a mandatory malware-scanned verification document, status tracking, event timelines, and facility review workflows.
- Donor registration, consent controls, availability preferences, and privacy-minimised outreach invitations.
- Facility inventory updates with adjustment history, public-visibility controls, and stale-record indicators.
- A dedicated **Blood Bank staff sign-in** for issued facility accounts and mandatory first-password replacement; authenticator verification applies only to the Super Admin.
- Role-aware workspaces for requesters, donors, Blood Bank inventory managers, Blood Bank reviewers, Blood Bank administrators, and platform administrators.
- Account sessions, CSRF protection, rate limiting, audit events, Super Admin authenticator verification, and forced replacement of issued temporary passwords.
- English/Nepali public-interface support and Nepal time-zone display.

## User roles

| Role | Main responsibilities |
|---|---|
| Guest | Search public, verified facility availability without creating an account. |
| Requester | Submit private coordination requests and follow their status. |
| Donor | Maintain consent and availability preferences; respond to controlled outreach invitations. |
| Blood Bank inventory manager | Record accountable blood-availability updates for an assigned verified facility. |
| Blood Bank reviewer | Review requester queries, add internal notes, update permitted states, and launch eligible donor outreach. |
| Blood Bank administrator | Access requester queries, consented donor responses, Blood Bank availability controls, and operational request coordination for the assigned facility. |
| Platform administrator | Review facilities, staff account state, policy versions, and audit activity. |

Blood Bank staff accounts are issued by the platform or verified facility administration; they cannot be created through public requester/donor registration.

## Multi-tenant Blood Bank management

The platform administrator is the **Super Admin**. The Super Admin uses an authenticator app; Blood Bank branches do not. From the governance workspace, the Super Admin can create an isolated Blood Bank tenant and issue its first Blood Bank Admin email and temporary password. The tenant admin must replace that temporary password before the dashboard allows access to any tenant data. Each tenant remains restricted to its own facility-scoped requests, availability, documents, and consented donor responses.

See [Multi-tenant Blood Bank management](docs/MULTI-TENANCY.md) for the full provisioning and first-sign-in flow.

## How coordination works

```mermaid
flowchart LR
    A[Search verified availability] --> B[Select a facility]
    B --> C[Submit a private request]
    C --> D[Facility review]
    D --> E{Inventory path available?}
    E -->|Yes| F[Facility coordinates next step]
    E -->|No| G[Consent-based donor outreach]
    G --> F
```

Public search results are facility-reported, timestamped information—not a promise that stock is currently available. A facility must confirm every next step.

## Technology and architecture

| Layer | Technology | Purpose |
|---|---|---|
| Client | React, TypeScript, Vite | Public search, account access, role-aware workspaces, and responsive UI. |
| API | Node.js, Express | Authentication, authorization, validation, workflows, rate limits, and audit events. |
| Database | MySQL-compatible TiDB Cloud or MySQL | Facilities, users, sessions, inventory, requests, donor profiles, campaigns, notifications, and policies. |
| Hosting | Vercel + Render | Static frontend delivery and managed API hosting. |

```mermaid
flowchart TB
    U[Guest, requester, donor, facility staff, administrator]
    W[React + Vite frontend]
    A[Express API]
    D[(TiDB Cloud / MySQL)]

    U --> W
    W -->|HTTPS JSON / multipart| A
    A --> D
```

### Repository layout

| Path | Description |
|---|---|
| `src/` | React client, translations, shared types, and the canonical Nepal district directory. |
| `server/` | Express API, database access, workflows, security helpers, and server tests. |
| `scripts/` | Local port validation and database migration utilities. |
| `docs/` | Architecture, deployment, installation, data model, module, testing, and product documentation. |
| `render.yaml` | Render backend deployment blueprint. |
| `vercel.json` | Vercel build configuration and frontend security headers. |

## Nepal district coverage

The public search defaults to **All districts** and users can select any of Nepal’s 77 districts. The same directory is used for donor registration and private blood requests, while the API validates submitted values before they are stored or used as filters.

The district list has one source of truth: [`src/nepal-districts.ts`](src/nepal-districts.ts). Both the React client and Express API import it, preventing client/server drift.

The development seed data intentionally includes example facilities and inventory in Morang only. That does **not** restrict district selection; it simply means other districts will have no public results until verified facilities publish inventory there.

### Official Blood Bank directory

The public **Find Blood Banks** search is separate from Raktakosh tenant inventory. It is imported from the National Public Health Laboratory (NPHL) Blood Transfusion Service Centre directory. Each result includes the listed telephone number, location, NPHL-reported component quantities, the time Raktakosh last synced the source, and a link back to the official source.

This directory contains only records published by NPHL. If a district has no NPHL record, Raktakosh displays that fact instead of creating a fake facility. Raktakosh tenant Blood Banks can still manage their own inventory separately.

Refresh the directory after migration and whenever a fresh snapshot is needed:

```powershell
npm run blood-banks:sync
```

See [Official Blood Bank directory](docs/BLOOD-BANK-DIRECTORY.md) for the source boundary and operating procedure.

Read the complete guide in [District Coverage](docs/DISTRICT-COVERAGE.md).

## Run locally

### Prerequisites

- Node.js 24 or later
- npm 11 or later
- A non-production TiDB Cloud or MySQL database

### 1. Install dependencies

```powershell
npm install
```

### 2. Create local configuration

```powershell
Copy-Item .env.example .env
```

Set `DATABASE_URL` in `.env` to a non-production database. For example:

```text
DATABASE_URL=mysql://USERNAME:PASSWORD@HOST:4000/DATABASE
```

If required by TiDB, add the CA certificate to `TIDB_CA_CERT`. Do not commit `.env`, database URLs, bootstrap credentials, or runtime secrets.

### 3. Initialize the database

For local development, `.env.example` sets `AUTO_MIGRATE=true`, so the API initializes the schema and development reference data when it starts. You can also run the migration directly:

```powershell
npm run db:migrate
```

### 4. Start the client and API

```powershell
npm run dev
```

| Service | Local address |
|---|---|
| Web app | `http://localhost:5173` |
| API | `http://localhost:8787` |
| API health check | `http://localhost:8787/api/health` |

## Configuration

Copy `.env.example` rather than creating configuration from scratch. The table below describes the primary variables.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | MySQL/TiDB connection URL. Use a least-privilege runtime account in production. |
| `NODE_ENV` | Yes | Set to `development` locally and `production` on Render. |
| `FRONTEND_ORIGIN` | Production | Exact deployed frontend origin used by CORS and cookie controls. |
| `CSRF_SECRET` | Production | Long random secret used to validate state-changing browser requests. |
| `MFA_ENCRYPTION_KEY` | Production | Base64-encoded 32-byte key used only to encrypt the Super Admin authenticator secret. |
| `DATABASE_SSL` | Recommended | Keep TLS enabled for hosted databases; set `false` only for a trusted local database. |
| `TIDB_CA_CERT` | Optional | CA certificate content when the database service requires it. |
| `SESSION_HOURS` | Optional | Authenticated session lifetime; defaults to 24 hours. |
| `STALE_AFTER_HOURS` | Optional | Hours before public inventory is marked stale; defaults to 12. |
| `DATABASE_POOL_SIZE` | Optional | Maximum database-pool connections; defaults to 8. |
| `AUTO_MIGRATE` | Local only | Enables automatic schema initialization in development. Keep `false` in production. |
| `BOOTSTRAP_*` | Optional | One-time local or deployment-time staff-account credentials. Keep them only in protected environment settings. |
| `VITE_API_BASE_URL` | Frontend deployment | Public API base URL used by the Vite client. Never put secrets in a `VITE_` variable. |

## Commands and verification

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite client and Express API together. |
| `npm run dev:client` | Start the Vite client only. |
| `npm run dev:server` | Start the Express API only. |
| `npm run db:migrate` | Initialize or migrate the database schema and seed development reference data. |
| `npm run blood-banks:sync` | Fetch and persist the current official NPHL Blood Transfusion Service Centre directory and stock snapshot. |
| `npm test` | Run business-rule and security tests. |
| `npm run build` | Type-check the project and produce the Vite production bundle in `dist/`. |
| `npm run serve` | Build the client and start the API for local production-style testing. |

Before opening a pull request or deploying, run:

```powershell
npm test
npm run build
```

## Deployment

The intended production topology is:

```text
Vercel React frontend → Render Express API → TiDB Cloud / MySQL
```

1. Run migrations with a dedicated migration-only database account.
2. Configure the Render API with protected runtime database credentials and security secrets.
3. Set `FRONTEND_ORIGIN` to the exact Vercel URL.
4. Configure `VITE_API_BASE_URL` in Vercel for Production, Preview, and Development.
5. Deploy the API, then verify `/api/health` reports `status: ok` and `database: connected`.
6. Deploy the Vercel frontend, enroll the Super Admin authenticator, and have issued Blood Bank staff replace their temporary password on first sign-in.

For exact environment-variable guidance, privileges, and deployment order, use the [Deployment Guide](docs/DEPLOYMENT.md).

## Security and operational boundaries

- Database credentials remain on the API host; the browser receives only the API URL.
- Production sessions use secure, HTTP-only cookies and state-changing requests require a CSRF token.
- Server-side role checks protect every private workflow; UI visibility is not treated as authorization.
- Authentication is rate-limited; sessions and temporary authentication challenges are stored as hashes.
- Staff use TOTP multi-factor authentication, with encrypted secrets at rest.
- Inventory changes, request workflow events, staff changes, and public searches create audit records.
- Verification documents use private R2 storage, signature/type/size validation, short-lived authorized download links, review states, and audit logs. The current `basic_validation` scan mode labels every upload as **unscanned**; use a private malware scanner before a public health-service rollout.
- Do not use the platform as an emergency response service or a substitute for direct clinical communication with a blood-service facility.

## Documentation

| Document | Description |
|---|---|
| [Installation guide](docs/INSTALLATION.md) | Local environment prerequisites and setup. |
| [Deployment guide](docs/DEPLOYMENT.md) | Vercel, Render, TiDB, secrets, migration, and production checklist. |
| [System architecture](docs/ARCHITECTURE.md) | Application layers and security boundary. |
| [Entity relationship diagram](docs/ERD.md) | Data model overview. |
| [Module catalogue](docs/MODULES.md) | Platform modules and their users. |
| [District coverage](docs/DISTRICT-COVERAGE.md) | Nepal-wide district directory and data-coverage behavior. |
| [Official Blood Bank directory](docs/BLOOD-BANK-DIRECTORY.md) | NPHL directory import, public search, source attribution, and refresh procedure. |
| [Blood-centre operations](docs/FACILITY-OPERATIONS.md) | Facility dashboard roles, private-data boundaries, and API behavior. |
| [Multi-tenant management](docs/MULTI-TENANCY.md) | Super Admin provisioning, forced first-password change, and tenant isolation. |
| [Donor pre-screening](docs/DONOR-PRE-SCREENING.md) | DOB, derived age, consented questionnaire, reviewer access, and deployment migration. |
| [Verification documents](docs/REQUEST-DOCUMENTS.md) | Mandatory request document, private R2 storage, scanning, review, and retention workflow. |
| [Testing report](docs/TESTING-REPORT.md) | Automated checks and deployment smoke tests. |
| [Viva guide](docs/VIVA-GUIDE.md) | Suggested project demonstration flow. |
| [Product requirements document](docs/Raktakosh-PRD-and-MVP.md) | Product scope, workflows, requirements, and roadmap. |

## Contributing

1. Create a branch from the current development branch.
2. Keep changes focused and avoid introducing sensitive values into tracked files.
3. Add or update tests when behavior changes.
4. Run `npm test` and `npm run build` before submitting the change.
5. Update the relevant document in `docs/` when the user-facing behavior, deployment process, or data model changes.

---

Built to make the path from a blood-service search to a verified facility handoff clearer, safer, and more accountable.
