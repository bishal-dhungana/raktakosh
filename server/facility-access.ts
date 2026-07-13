import type { UserRole } from "../src/types";

export type FacilityCaseworkRole = "reviewer" | "facility_admin";

/**
 * Private requester and donor-contact information is restricted to staff who
 * coordinate cases. Inventory staff retain inventory access without receiving
 * unnecessary personal data.
 */
export function canViewFacilityCasework(role: UserRole): role is FacilityCaseworkRole {
  return role === "reviewer" || role === "facility_admin";
}
