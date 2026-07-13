import assert from "node:assert/strict";
import test from "node:test";
import { availabilityState, canTransition, isStale } from "./domain";
import { canViewFacilityCasework } from "./facility-access";
import { deriveAge, hasCompleteScreeningAnswers, isValidDateOfBirth, preliminaryEligibilityStatus } from "../src/donor-screening";
import { NEPAL_DISTRICTS, isNepalDistrict } from "../src/nepal-districts";

test("uses a complete canonical directory of Nepal districts", () => {
  assert.equal(NEPAL_DISTRICTS.length, 77);
  assert.equal(isNepalDistrict("Morang"), true);
  assert.equal(isNepalDistrict("Kanchanpur"), true);
  assert.equal(isNepalDistrict("Not a district"), false);
});

test("limits facility casework to coordination roles", () => {
  assert.equal(canViewFacilityCasework("reviewer"), true);
  assert.equal(canViewFacilityCasework("facility_admin"), true);
  assert.equal(canViewFacilityCasework("inventory_manager"), false);
  assert.equal(canViewFacilityCasework("platform_admin"), false);
});

test("derives a Nepal-local age without storing an editable age", () => {
  const beforeBirthday = new Date("2026-07-12T18:14:59.000Z");
  const birthday = new Date("2026-07-12T18:15:00.000Z");
  assert.equal(deriveAge("2000-07-13", beforeBirthday), 25);
  assert.equal(deriveAge("2000-07-13", birthday), 26);
  assert.equal(isValidDateOfBirth("2026-02-29", birthday), false);
  assert.equal(isValidDateOfBirth("2000-07-13", birthday), true);
});

test("keeps pre-screening conservative", () => {
  const allNo = {
    currently_unwell: "no",
    medical_condition_or_medicine: "no",
    recent_procedure_or_tattoo: "no",
    previous_donation_reaction: "no",
    pregnancy_or_postpartum: "not_applicable",
    travel_or_infection_risk: "no"
  } as const;
  assert.equal(hasCompleteScreeningAnswers(allNo), true);
  assert.equal(preliminaryEligibilityStatus(allNo), "pending");
  assert.equal(preliminaryEligibilityStatus({ ...allNo, currently_unwell: "unsure" }), "needs_review");
});

test("allows only safe request transitions", () => {
  assert.equal(canTransition("submitted", "under_review"), true);
  assert.equal(canTransition("submitted", "donor_outreach_active"), false);
  assert.equal(canTransition("fulfilled", "under_review"), false);
});

test("does not present stale availability as current", () => {
  const old = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
  assert.equal(isStale(old, 12), true);
  assert.equal(availabilityState(12, old, 12), "stale");
});

test("derives qualified availability states", () => {
  const now = new Date().toISOString();
  assert.equal(availabilityState(6, now, 12), "reported_available");
  assert.equal(availabilityState(2, now, 12), "limited");
  assert.equal(availabilityState(0, now, 12), "not_reported");
});
