import type { RequestStatus } from "../src/types";

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  needs_information: "Needs information",
  under_review: "Under review",
  verified: "Verified for coordination",
  inventory_located: "Inventory located",
  reservation_pending: "Reservation pending facility confirmation",
  inventory_unavailable: "Inventory unavailable",
  donor_outreach_active: "Donor outreach active",
  donor_response_received: "Donor response received",
  facility_follow_up: "Facility follow-up",
  fulfilled: "Fulfilled",
  unable_to_fulfill: "Unable to fulfill",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired"
};

const transitions: Record<RequestStatus, RequestStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["needs_information", "under_review", "rejected", "cancelled", "expired"],
  needs_information: ["submitted", "under_review", "rejected", "cancelled", "expired"],
  under_review: ["needs_information", "verified", "rejected", "cancelled", "expired"],
  verified: ["inventory_located", "inventory_unavailable", "rejected", "cancelled", "expired"],
  inventory_located: ["reservation_pending", "fulfilled", "rejected", "cancelled", "expired"],
  reservation_pending: ["fulfilled", "unable_to_fulfill", "cancelled", "expired"],
  inventory_unavailable: ["donor_outreach_active", "unable_to_fulfill", "cancelled", "expired"],
  donor_outreach_active: ["donor_response_received", "unable_to_fulfill", "cancelled", "expired"],
  donor_response_received: ["facility_follow_up", "unable_to_fulfill", "cancelled", "expired"],
  facility_follow_up: ["fulfilled", "unable_to_fulfill", "cancelled", "expired"],
  fulfilled: [],
  unable_to_fulfill: [],
  rejected: [],
  cancelled: [],
  expired: []
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return transitions[from].includes(to);
}

export function allowedTransitions(status: RequestStatus): RequestStatus[] {
  return transitions[status];
}

export function isTerminal(status: RequestStatus): boolean {
  return transitions[status].length === 0;
}

export function isStale(lastUpdated: string, staleAfterHours: number): boolean {
  return Date.now() - new Date(lastUpdated).getTime() > staleAfterHours * 60 * 60 * 1000;
}

export function makeRequestReference(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const nonce = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RK-${date}-${nonce}`;
}

export function availabilityState(quantity: number, lastUpdated: string, staleAfterHours: number): "reported_available" | "limited" | "not_reported" | "stale" {
  if (isStale(lastUpdated, staleAfterHours)) return "stale";
  if (quantity >= 5) return "reported_available";
  if (quantity > 0) return "limited";
  return "not_reported";
}
