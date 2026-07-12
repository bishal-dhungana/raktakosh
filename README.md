# Raktakosh — Blood Coordination Platform

**Version 1.0**

Raktakosh is a full-stack web platform for structured blood-service coordination. It brings requesters, voluntary donors, verified facilities, and platform administrators into one role-based workflow for availability discovery, request handling, inventory management, controlled donor outreach, and auditability.

## Key capabilities

- Public facility availability search by district, blood group, Rh factor, and component.
- Private requester workflow with reference tracking and supporting-document upload.
- Facility inventory management with adjustment history and stale-record awareness.
- Guarded request-status workflow and internal review notes.
- Donor availability, outreach consent, and invitation-response controls.
- Administrator visibility into facilities, policies, and system audit events.
- Responsive English/Nepali public experience and Asia/Kathmandu date handling.

## Quick start

### Option 1: one command

```powershell
npm install
npm run dev
```

The application automatically opens at `http://localhost:5173`.

### Option 2: Windows launcher

After installing dependencies once with `npm install`, double-click [START-RAKTAKOSH.cmd](START-RAKTAKOSH.cmd).

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the API and web interface together. |
| `npm run build` | Type-check and create the production web bundle. |
| `npm test` | Run workflow and availability rule tests. |
| `npm run serve` | Build and serve the application from one command. |
| `npm run reset-data` | Restore the initial presentation dataset before a walkthrough. |

## Project documentation

- [Installation guide](docs/INSTALLATION.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Entity relationship diagram](docs/ERD.md)
- [Module catalogue](docs/MODULES.md)
- [Testing report](docs/TESTING-REPORT.md)
- [Viva walkthrough and Q&A](docs/VIVA-GUIDE.md)
- [Product requirements document](docs/Raktakosh-PRD-and-MVP.md)

## Functional boundary

Raktakosh coordinates information and workflow. Clinical blood matching, donor medical eligibility, reservation, testing, and transfusion decisions remain the responsibility of participating blood-service facilities.

## Technology

- React 19 + TypeScript + Vite
- Node.js + Express
- SQLite persistence using Node's built-in SQLite driver
- Cookie-backed sessions, role-aware authorization, audit events, and validated request transitions

## Verification

```powershell
npm test
npm run build
```
