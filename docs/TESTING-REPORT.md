# Testing Report

## Automated verification

| Area | Command | Expected result |
|---|---|---|
| Business-rule tests | `npm test` | Request transition and availability-state tests pass. |
| Type safety | `npm run build` | TypeScript compilation completes without errors. |
| Production bundle | `npm run build` | Vite generates the `dist/` web bundle. |
| Dependency review | `npm audit --omit=dev` | No known production dependency vulnerabilities. |

## Covered business rules

1. A request can move from `Submitted` to `Under review`.
2. A request cannot bypass review and move directly from `Submitted` to donor outreach.
3. A fulfilled request cannot return to review.
4. Availability that exceeds the freshness threshold is marked `Stale information`.
5. Availability states are correctly differentiated as reported, limited, not reported, or stale.

## Manual acceptance checklist

| Scenario | Expected result |
|---|---|
| Public search | Returns only verified facility availability with timestamps. |
| Request submission | Creates a reference code and a visible status timeline. |
| Supporting upload | Accepts PDF/JPG/PNG files within the defined size limit. |
| Request review | Shows only permitted next workflow states. |
| Internal note | Appears to facility staff and not the requester. |
| Inventory update | Records a new quantity and appears in the facility inventory summary. |
| Outreach guard | Rejects outreach unless the request is inventory unavailable. |
| Donor opt-out | Prevents future outreach participation immediately. |
| Audit feed | Records workspace access and critical changes. |
| Responsive interface | Public, requester, donor, facility, and admin views remain usable on narrow screens. |

## Final validation record

Run the following immediately before a presentation or submission:

```powershell
npm run reset-data
npm test
npm run build
npm run dev
```
