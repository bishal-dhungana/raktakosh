# Blood-Centre Operations

## Purpose

The blood-centre operations workspace gives verified facility staff a single, role-scoped view of current coordination work. It separates inventory work from private casework so staff receive only the information needed for their role.

## Access model

| Staff role | Inventory | Private requests | Requester name and phone | Interested donor contact details |
|---|---:|---:|---:|---:|
| Inventory manager | Read/write | No | No | No |
| Reviewer | Read | Yes | Yes, for assigned facility cases | Yes, after donor accepts this facility's outreach |
| Facility administrator | Read/write | Yes | Yes, for assigned facility cases | Yes, after donor accepts this facility's outreach |

All facility access requires an active account assigned to a verified facility. The platform administrator is managed through the separate governance workspace.

## Dashboard panels

- **Overview** shows active cases, urgent/critical requests, awaiting-review counts, donor responses, stale inventory, and request-state totals.
- **Private requests** is visible only to reviewers and facility administrators. It lists active requests for the staff member's assigned facility and includes requester contact details for case coordination.
- **Donor responses** is visible only to reviewers and facility administrators. It lists only donors who selected “I can be contacted” after receiving an outreach invitation from that facility.
- **Inventory** is available to all verified facility staff. Only inventory managers and facility administrators can record adjustments.
- **Facility profile** is available to all verified facility staff and shows the verified operating record used for public availability and request routing.

## Privacy rules

1. A facility can access only records linked to its own facility ID.
2. Inventory managers do not receive requester or donor contact data.
3. Donor contact data is not a directory: it is shown only after affirmative response to that facility's controlled outreach invitation.
4. Dates of birth, medical-history responses, and clinical eligibility data are not part of this release of the facility operations view.
5. Each operations-dashboard view writes an audit event. Private-casework views record the number of cases and consented donor responses accessed, without placing personal data in audit metadata.

## API contract

`GET /api/facility/operations` returns the role-scoped dashboard payload for a verified facility staff member. The response includes summary counts and inventory for all facility staff. Private `cases` and `donorResponses` arrays are populated only for reviewer and facility-administrator roles.

## Operational limitations

This dashboard supports coordination, not clinical decisions. Staff must use the responsible facility's approved policies for verification, donor screening, medical eligibility, blood matching, and any direct contact follow-up.
