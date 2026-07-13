import type { UserRole } from "../src/types";

export type FacilityCaseworkRole = "reviewer" | "facility_admin";
export type BloodBankStaffRole = "inventory_manager" | FacilityCaseworkRole;

/**
 * Blood-bank staff accounts are issued by the platform or a verified facility.
 * They use the dedicated staff sign-in and cannot be created through public
 * requester/donor registration.
 */
export function isBloodBankStaff(role: UserRole): role is BloodBankStaffRole {
  return role === "inventory_manager" || role === "reviewer" || role === "facility_admin";
}

/**
 * Private requester and donor-contact information is restricted to staff who
 * coordinate cases. Inventory staff retain inventory access without receiving
 * unnecessary personal data.
 */
export function canViewFacilityCasework(role: UserRole): role is FacilityCaseworkRole {
  return role === "reviewer" || role === "facility_admin";
}
