import assert from "node:assert/strict";
import test from "node:test";
import { availabilityState, canTransition, isStale } from "./domain";
import { canViewFacilityCasework, isBloodBankStaff } from "./facility-access";
import { deriveAge, hasCompleteScreeningAnswers, isValidDateOfBirth, preliminaryEligibilityStatus } from "../src/donor-screening";
import { NEPAL_DISTRICTS, isNepalDistrict } from "../src/nepal-districts";
import { detectDocumentMime, documentUploadSecurity, documentWorkflowEnabled, safeDocumentName, scanDocument, validateDocument } from "./document-storage";
import { donationCooldownActive, donationCooldownUntil, isValidDonationDate } from "../src/donor-cooldown";

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

test("restricts the dedicated Blood Bank sign-in to issued facility staff accounts", () => {
  assert.equal(isBloodBankStaff("inventory_manager"), true);
  assert.equal(isBloodBankStaff("reviewer"), true);
  assert.equal(isBloodBankStaff("facility_admin"), true);
  assert.equal(isBloodBankStaff("requester"), false);
  assert.equal(isBloodBankStaff("donor"), false);
  assert.equal(isBloodBankStaff("platform_admin"), false);
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
  assert.equal(canTransition("document_pending_review", "submitted"), true);
  assert.equal(canTransition("document_pending_review", "under_review"), false);
  assert.equal(canTransition("submitted", "under_review"), true);
  assert.equal(canTransition("submitted", "donor_outreach_active"), false);
  assert.equal(canTransition("fulfilled", "under_review"), false);
});

test("accepts only genuine PDF/JPEG/PNG verification documents", () => {
  const pdf = Buffer.from("%PDF-1.7\nprivate verification document");
  assert.equal(detectDocumentMime(pdf), "application/pdf");
  assert.equal(validateDocument(pdf, "application/pdf"), "application/pdf");
  assert.throws(() => validateDocument(pdf, "image/png"));
  assert.throws(() => validateDocument(Buffer.from("not a document"), "application/pdf"));
  assert.equal(safeDocumentName("../Hospital slip?.PDF", "application/pdf"), ".._Hospital slip_.pdf");
});

test("labels explicitly enabled demo uploads as unscanned", async () => {
  const keys = ["DOCUMENT_STORAGE_MODE", "DOCUMENT_SCAN_MODE", "R2_BUCKET", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    DOCUMENT_STORAGE_MODE: "r2",
    DOCUMENT_SCAN_MODE: "basic_validation",
    R2_BUCKET: "qa-bucket",
    R2_ENDPOINT: "https://qa.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "qa-access-key",
    R2_SECRET_ACCESS_KEY: "qa-secret-key"
  });
  try {
    assert.equal(documentWorkflowEnabled(), true);
    assert.equal(documentUploadSecurity(), "basic_validation");
    const result = await scanDocument(Buffer.from("%PDF-1.7\\nQA document"), "application/pdf", "checksum");
    assert.deepEqual(result, { status: "unscanned", provider: "basic_validation", scannedAt: null });
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("enforces a three-calendar-month donation cooldown", () => {
  assert.equal(donationCooldownUntil("2026-04-13", 3), "2026-07-13");
  assert.equal(donationCooldownUntil("2026-01-31", 3), "2026-04-30");
  assert.equal(donationCooldownActive("2026-04-13", new Date("2026-07-12T18:14:59.000Z"), 3), true);
  assert.equal(donationCooldownActive("2026-04-13", new Date("2026-07-12T18:15:00.000Z"), 3), false);
  assert.equal(isValidDonationDate("2026-02-29"), false);
  assert.equal(isValidDonationDate("2024-02-29"), true);
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
