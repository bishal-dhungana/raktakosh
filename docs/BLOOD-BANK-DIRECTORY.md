# Official Blood Bank Directory

## Purpose

Raktakosh provides a public **Find Blood Banks** search that does not require an account. It helps visitors find source-backed Blood Transfusion Service Centres (BTSCs), their listed contact numbers, locations, and reported stock.

This is intentionally separate from the inventory managed by Raktakosh Blood Bank tenants. An NPHL directory record is not automatically a Raktakosh tenant and cannot access the Blood Bank workspace.

## Source and coverage

The import source is the National Public Health Laboratory (NPHL) Blood Transfusion Service Centre directory:

- Directory: `https://donateblood.nphl.gov.np/btscs`
- Per-centre stock: `https://donateblood.nphl.gov.np/btscs/stock/{id}`

Only centres returned by this official source are imported. If a district has no listed NPHL centre, the application must show no official record rather than inventing a Blood Bank or contact number.

The current NPHL snapshot may not cover every Nepal district. This is a source-coverage limitation, not a claim that a district has no blood service.

## Data model

- `blood_bank_directory` stores the source identity, official external identifier, name, canonical Nepal district, source-language district, municipality, listed contacts, services, stock total, source URLs, activity flag, and sync timestamp.
- `blood_bank_stock` stores the latest positive quantities by Blood Bank, broad component category, blood group, and Rh factor.
- `users.district` stores the account’s selected district. New requester and donor registration requires it; existing donor districts are backfilled during migration.

Stock component labels are normalized into Whole blood, Packed red cells, Platelets, Plasma, or Other for filtering. The source remains the authority for the actual inventory status.

## Public behaviour

Guests can search by name/location, district, blood group, Rh factor, and component. Results show:

- listed Blood Bank telephone number as a click-to-call action;
- location and services;
- NPHL-reported stock quantities;
- last Raktakosh sync time; and
- a link to the official source record.

Donor and requester dashboards automatically show the directory records for the saved or selected district. The requester’s selected request district is used immediately so they can compare nearby official contacts while preparing a private request.

## Refresh procedure

Use the migration database account locally or in a controlled CI/admin environment:

```powershell
npm run db:migrate
npm run blood-banks:sync
```

`blood-banks:sync` fetches the directory once, obtains each centre’s stock snapshot with bounded concurrency, updates known records, replaces each centre’s prior snapshot, and marks source records that disappeared from the current directory inactive. It never creates tenant accounts or changes tenant-managed inventory.

Run the sync deliberately before a demo or on an agreed schedule. It is not executed on every API request or server startup, so the public site does not overload the government source and the displayed sync time remains meaningful.

## Operational boundary

NPHL-reported stock is informational. It is not a reservation, compatibility decision, clinical match, or promise that blood is currently available. Visitors should call the listed Blood Bank for confirmation, and Blood Bank staff retain responsibility for all clinical and operational decisions.
