export type Locale = "en" | "ne";

export type UserRole =
  | "requester"
  | "donor"
  | "inventory_manager"
  | "reviewer"
  | "facility_admin"
  | "platform_admin";

export type RequestStatus =
  | "draft"
  | "submitted"
  | "needs_information"
  | "under_review"
  | "verified"
  | "inventory_located"
  | "reservation_pending"
  | "inventory_unavailable"
  | "donor_outreach_active"
  | "donor_response_received"
  | "facility_follow_up"
  | "fulfilled"
  | "unable_to_fulfill"
  | "rejected"
  | "cancelled"
  | "expired";

export type AvailabilityState = "reported_available" | "limited" | "not_reported" | "stale";

export interface PublicAvailability {
  facilityId: number;
  facilityName: string;
  facilityType: string;
  district: string;
  contact: string;
  operatingHours: string;
  bloodGroup: string;
  rhFactor: string;
  component: string;
  state: AvailabilityState;
  lastUpdated: string;
}

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  facilityId: number | null;
  facilityName?: string | null;
}

export interface RequestEvent {
  id: number;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  message: string;
  actorName: string;
  createdAt: string;
}

export interface BloodRequest {
  id: number;
  reference: string;
  requesterId: number;
  facilityId: number;
  facilityName: string;
  patientInitials: string;
  bloodGroup: string;
  rhFactor: string;
  component: string;
  quantity: number;
  urgency: string;
  district: string;
  neededBy: string;
  status: RequestStatus;
  requesterVisibleMessage: string | null;
  createdAt: string;
  updatedAt: string;
  events: RequestEvent[];
  documents?: Array<{ id: number; originalName: string; scanStatus: string; createdAt: string }>;
  internalNotes?: Array<{ id: number; body: string; authorName: string; createdAt: string }>;
}

export interface InventoryItem {
  id: number;
  bloodGroup: string;
  rhFactor: string;
  component: string;
  availableQuantity: number;
  reservedQuantity: number;
  publicVisible: boolean;
  lastUpdated: string;
  updatedBy: string;
  reason: string;
}

export interface DonorProfile {
  id: number;
  selfReportedGroup: string;
  selfReportedRh: string;
  district: string;
  availability: "available" | "unavailable" | "temporarily_deferred" | "opted_out";
  outreachConsent: boolean;
  contactWindow: string;
  maxContactsPerMonth: number;
  preScreeningResult: string;
  policyVersion: string;
  lastDonationDate: string | null;
}

export interface Invitation {
  id: number;
  campaignId: number;
  requestReference: string;
  facilityName: string;
  bloodGroup: string;
  rhFactor: string;
  component: string;
  expiresAt: string;
  status: "pending" | "interested" | "declined" | "stopped";
  createdAt: string;
}

export interface FacilityDashboard {
  facility: { id: number; name: string; district: string; verificationStatus: string };
  requestCounts: Array<{ status: RequestStatus; count: number }>;
  staleCount: number;
  todayUpdates: number;
}

export interface AdminOverview {
  facilities: Array<{ id: number; name: string; district: string; status: string; publicAvailability: boolean; openRequests: number }>;
  policies: Array<{ id: number; name: string; version: string; effectiveAt: string; summary: string }>;
  auditEvents: Array<{ id: number; action: string; entityType: string; entityId: string; actorName: string; createdAt: string }>;
}
