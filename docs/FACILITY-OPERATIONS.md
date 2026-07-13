# Blood-Centre Operations

## Purpose

The Blood Bank dashboard gives verified facility staff a single, role-scoped view of current coordination work. It separates availability work from private casework so staff receive only the information needed for their role.

## Dedicated Blood Bank sign-in

Use **Blood Bank login** from the public header. It calls the dedicated staff sign-in endpoint and accepts only an already-issued `inventory_manager`, `reviewer`, or `facility_admin` account. Blood Bank branches do not use an authenticator; that step is reserved for the Super Admin. Public requester/donor registration cannot create a Blood Bank staff account.

## Access model

| Staff role | Inventory | Private requests | Requester name and phone | Interested donor contact details |
|---|---:|---:|---:|---:|
| Blood Bank inventory manager | Read/write | No | No | No |
| Blood Bank reviewer | Read | Yes | Yes, for assigned facility cases | Yes, after donor accepts this facility's outreach |
| Blood Bank administrator | Read/write | Yes | Yes, for assigned facility cases | Yes, after donor accepts this facility's outreach |

All facility access requires an active account assigned to a verified facility. The platform administrator is managed through the separate governance workspace.

## Dashboard panels

- **Overview** shows active cases, urgent/critical requests, awaiting-review counts, donor responses, stale availability, and request-state totals. Blood Bank administrators also get quick availability and next-request-step controls.
- **Requester queries** is visible only to Blood Bank reviewers and administrators. It lists active requests for the staff member's assigned facility and includes requester contact details for case coordination.
- **Donor queries** is visible only to Blood Bank reviewers and administrators. It lists only donors who selected “I can be contacted” after receiving an outreach invitation from that facility.
- **Blood availability** is available to all verified Blood Bank staff. Inventory managers and Blood Bank administrators can update a selected blood group/component, quantity, public visibility, and reason. Every update is audited.
- **Blood Bank profile** is available to all verified staff and shows the operating record used for public availability and request routing.

## Privacy rules

1. A facility can access only records linked to its own facility ID.
2. Inventory managers do not receive requester or donor contact data.
3. Donor contact data is not a directory: it is shown only after affirmative response to that facility's controlled outreach invitation.
4. Dates of birth, medical-history responses, and clinical eligibility data are not part of this release of the facility operations view.
5. Each operations-dashboard view writes an audit event. Private-casework views record the number of cases and consented donor responses accessed, without placing personal data in audit metadata.

## API contract

`GET /api/facility/operations` returns the role-scoped dashboard payload for a verified facility staff member. The response includes summary counts and inventory for all facility staff. Private `cases` and `donorResponses` arrays are populated only for reviewer and facility-administrator roles.

`POST /api/auth/blood-bank/login` is the dedicated staff login. It rejects non-staff accounts even when their password is correct. `POST /api/inventory` remains the audited availability update endpoint and is restricted to the assigned Blood Bank inventory manager or administrator.

## Operational limitations

This dashboard supports coordination, not clinical decisions. “Record blood located,” “Record reservation,” and “Record fulfillment” update the case workflow only; staff must physically confirm stock and use the responsible facility's approved policies for verification, donor screening, medical eligibility, blood matching, and any direct contact follow-up.
