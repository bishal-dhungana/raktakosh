# Donor Date of Birth and Pre-Screening

## Purpose

Raktakosh collects a donor's date of birth and a limited, structured pre-screening questionnaire to support confidential facility review. It does not diagnose, medically clear, or automatically reject a donor.

## Data model

- **Date of birth** is required for new donor registration and stored in the donor profile.
- **Age** is calculated by the API in the `Asia/Kathmandu` time zone. It is never stored as an editable field.
- **Pre-screening answers** use fixed question keys and the values `yes`, `no`, `unsure`, or `not applicable`. The feature intentionally does not collect free-text medical histories.
- **Consent** is required before health-adjacent answers are submitted.
- **Questionnaire version** is stored with each screening to support future policy revisions.

## Screening statuses

| Status | Meaning |
|---|---|
| Not started | The donor has not submitted the current questionnaire. |
| Pending | The donor submitted answers without a `yes` or `unsure` response; a facility must still make the final decision. |
| Needs review | At least one answer requires confidential facility follow-up, or a reviewer kept the case in review. |
| Provisionally eligible | An authorized facility reviewer recorded a preliminary operational status. This is not clinical clearance. |
| Not eligible now | An authorized facility reviewer recorded a temporary non-eligibility status and a review note. |

## Access boundaries

| Data | Donor | Reviewer / facility administrator | Inventory manager |
|---|---:|---:|---:|
| Own date of birth and derived age | Yes | Derived age only, after accepted outreach | No |
| Own questionnaire answers | Yes | Only after the donor accepted an active outreach invitation from that facility | No |
| Screening review status | Yes | Yes, for an active accepted outreach response | No |

The API checks the donor's active, interested response to a facility campaign before returning screening answers or accepting an eligibility review. Each view of screening data and each review action creates an audit event.

## Operational rules

1. A `yes` or `unsure` answer automatically becomes **Needs review**, not an automated rejection.
2. A `no` / `not applicable` questionnaire becomes **Pending**, not automatic eligibility.
3. Only a reviewer or facility administrator at the facility connected to the donor's active accepted response can set a facility review status.
4. The facility must use its approved clinical policy for all real donation decisions.

## API endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/donor/profile` | Donor | Read profile, private date of birth, derived age, and status. |
| `GET` | `/api/donor/screening` | Donor | Read the current questionnaire submission. |
| `PATCH` | `/api/donor/screening` | Donor + CSRF | Submit consented structured answers. |
| `GET` | `/api/facility/donors/:id/screening` | Reviewer/facility administrator | Read a connected donor's submitted answers. |
| `PATCH` | `/api/facility/donors/:id/eligibility` | Reviewer/facility administrator + CSRF | Record a preliminary facility review status. |

## Deployment requirement

This release adds database columns and tables. Before deploying the API with `AUTO_MIGRATE=false`, run `npm run db:migrate` once using the dedicated migration database account described in [Deployment Guide](DEPLOYMENT.md). Set the account as `MIGRATION_DATABASE_URL` in the untracked `.env` file or supply it for the command. Do not grant schema-change privileges to the runtime account.
