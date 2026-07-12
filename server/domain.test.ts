import assert from "node:assert/strict";
import test from "node:test";
import { availabilityState, canTransition, isStale } from "./domain";

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
