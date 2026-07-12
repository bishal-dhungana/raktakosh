# Raktakosh Version 1.0 implementation plan

## Product boundary

Build a responsive academic implementation for blood-service coordination in Morang, Nepal. This product is **not** a clinical matching, reservation, medical eligibility, or transfusion system. Every availability and request state is qualified with the appropriate facility and safety language.

## Chosen implementation

- **Application:** React + TypeScript client, Vite build, Express API, Node's built-in SQLite driver.
- **Storage:** local SQLite database generated on first run, with presentation-ready facilities and role workspaces. A live deployment should replace this persistence with the PRD's Laravel/MySQL/object-storage/queue design after clinical, legal, security, and operating approvals.
- **Authentication:** session cookie backed by a server-side session record with role-specific workspace access for the academic presentation.
- **Design direction:** *Signal Ledger* — warm editorial public-health utility. A dark ink field, a vermilion emergency signal, pale-paper panels, deliberately visible timestamps, and vertical status trails make the app recognisable while preserving calm clarity.

## MVP journeys

1. Guest searches verified public availability by district, group, and component and sees freshness/disclaimer data.
2. Requester signs in, creates a documented coordination request, and sees private status history.
3. Inventory staff update facility availability with a reason; every change is retained in history.
4. Facility reviewer claims/updates a request through guarded status transitions, leaves an internal note, and may start donor outreach only after verified inventory is unavailable.
5. Donor controls consent and availability, receives only a private, minimal invitation, and can respond or opt out.
6. Platform administrator reviews facility status, policies, and the audit feed.

## Data model

- `users`, `sessions`, `facilities`, `inventory_records`, `inventory_adjustments`
- `blood_requests`, `request_events`, `request_notes`, `request_documents`
- `donor_profiles`, `outreach_campaigns`, `campaign_recipients`
- `notifications`, `audit_events`, `policy_versions`

Critical writes are server-validated and audit logged. Request transitions are server-side state-machine checked. Public endpoints never return patient, donor, document, or private contact data.

## Delivery checkpoints

1. Scaffold the client, API, database schema, seed data, and executable scripts.
2. Build all public, requester, donor, facility, and admin views against the API.
3. Verify type checking, production build, API behaviour, status-transition guards, inventory persistence, and key accessibility states.

## Acceptance boundary

The completed repository is a functional local Version 1.0 academic implementation. It must not be deployed for real patient or donor data until the PRD launch checklist is fulfilled, including clinical safety sign-off, privacy/legal approval, hardened storage/scanning, MFA, monitoring, backups, and selected notification providers.
