import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CurrentUser, UserRole } from "../src/types";

const dataDirectory = join(process.cwd(), "data");
mkdirSync(dataDirectory, { recursive: true });

export const uploadsDirectory = join(dataDirectory, "uploads");
mkdirSync(uploadsDirectory, { recursive: true });

export const db = new DatabaseSync(join(dataDirectory, "raktakosh.sqlite"));
db.exec("PRAGMA foreign_keys = ON;");

export const STALE_AFTER_HOURS = Number(process.env.STALE_AFTER_HOURS ?? 12);
export const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 24);

db.exec(`
  CREATE TABLE IF NOT EXISTS facilities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    facility_type TEXT NOT NULL,
    district TEXT NOT NULL,
    address TEXT NOT NULL,
    public_contact TEXT NOT NULL,
    operating_hours TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'draft',
    public_availability INTEGER NOT NULL DEFAULT 0,
    accepts_requests INTEGER NOT NULL DEFAULT 1,
    participates_outreach INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    role TEXT NOT NULL,
    facility_id INTEGER REFERENCES facilities(id),
    password_hash TEXT NOT NULL,
    verified_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_records (
    id INTEGER PRIMARY KEY,
    facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL,
    rh_factor TEXT NOT NULL,
    component TEXT NOT NULL,
    available_quantity INTEGER NOT NULL CHECK(available_quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK(reserved_quantity >= 0),
    public_visible INTEGER NOT NULL DEFAULT 1,
    last_updated TEXT NOT NULL,
    updated_by_user_id INTEGER REFERENCES users(id),
    last_reason TEXT NOT NULL,
    UNIQUE(facility_id, blood_group, rh_factor, component)
  );

  CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id INTEGER PRIMARY KEY,
    inventory_record_id INTEGER NOT NULL REFERENCES inventory_records(id) ON DELETE CASCADE,
    editor_user_id INTEGER NOT NULL REFERENCES users(id),
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blood_requests (
    id INTEGER PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    requester_id INTEGER NOT NULL REFERENCES users(id),
    facility_id INTEGER NOT NULL REFERENCES facilities(id),
    client_token TEXT,
    patient_initials TEXT NOT NULL,
    requester_relationship TEXT NOT NULL,
    blood_group TEXT NOT NULL,
    rh_factor TEXT NOT NULL,
    component TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    urgency TEXT NOT NULL,
    district TEXT NOT NULL,
    needed_by TEXT NOT NULL,
    status TEXT NOT NULL,
    requester_visible_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(requester_id, client_token)
  );

  CREATE TABLE IF NOT EXISTS request_events (
    id INTEGER PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    message TEXT NOT NULL,
    actor_user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS request_notes (
    id INTEGER PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    author_user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS request_documents (
    id INTEGER PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    uploader_user_id INTEGER NOT NULL REFERENCES users(id),
    original_name TEXT NOT NULL,
    storage_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    scan_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS donor_profiles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    self_reported_group TEXT NOT NULL,
    self_reported_rh TEXT NOT NULL,
    district TEXT NOT NULL,
    availability TEXT NOT NULL,
    outreach_consent INTEGER NOT NULL DEFAULT 0,
    contact_window TEXT NOT NULL,
    max_contacts_per_month INTEGER NOT NULL DEFAULT 2,
    pre_screening_result TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    last_donation_date TEXT,
    last_contact_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id INTEGER PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    facility_id INTEGER NOT NULL REFERENCES facilities(id),
    launched_by_user_id INTEGER NOT NULL REFERENCES users(id),
    candidate_count INTEGER NOT NULL,
    status TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    donor_user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    responded_at TEXT,
    UNIQUE(campaign_id, donor_user_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS policy_versions (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(name, version)
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_public_search ON inventory_records(facility_id, blood_group, rh_factor, component);
  CREATE INDEX IF NOT EXISTS idx_requests_facility_status ON blood_requests(facility_id, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_requests_requester ON blood_requests(requester_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
`);

function now(): string {
  return new Date().toISOString();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function writeAudit(actorUserId: number | null, action: string, entityType: string, entityId: string | number, metadata: Record<string, unknown> = {}): void {
  db.prepare(
    "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(actorUserId, action, entityType, String(entityId), JSON.stringify(metadata), now());
}

export function createNotification(userId: number, category: string, title: string, body: string): void {
  db.prepare("INSERT INTO notifications (user_id, category, title, body, status, created_at) VALUES (?, ?, ?, ?, 'in_app', ?)").run(
    userId,
    category,
    title,
    body,
    now()
  );
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(token, userId, expiresAt, now());
  return token;
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserByEmail(email: string): { id: number; passwordHash: string } | undefined {
  const row = db.prepare("SELECT id, password_hash as passwordHash FROM users WHERE lower(email) = lower(?)").get(email) as
    | { id: number; passwordHash: string }
    | undefined;
  return row;
}

export function getCurrentUser(token: string | undefined): CurrentUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.facility_id as facilityId, f.name as facilityName
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN facilities f ON f.id = u.facility_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now()) as CurrentUser | undefined;
  return row ?? null;
}

export function seedDatabase(): void {
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (row.count > 0) return;

  const createdAt = now();
  const insertFacility = db.prepare(
    `INSERT INTO facilities (name, facility_type, district, address, public_contact, operating_hours, verification_status, public_availability, accepts_requests, participates_outreach, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?)`
  );
  const morangId = Number(
    insertFacility.run(
      "Morang Community Blood Centre",
      "Blood centre",
      "Morang",
      "Biratnagar, Morang",
      "Call the verified facility desk: 021-000000",
      "Sun–Fri · 08:00–18:00 NPT",
      1,
      1,
      1,
      createdAt
    ).lastInsertRowid
  );
  const teachingId = Number(
    insertFacility.run(
      "Biratnagar Teaching Hospital",
      "Hospital blood service",
      "Morang",
      "Biratnagar, Morang",
      "Call the verified facility desk: 021-000001",
      "Every day · 07:00–20:00 NPT",
      1,
      1,
      0,
      createdAt
    ).lastInsertRowid
  );
  insertFacility.run(
    "Urlabari Partner Clinic",
    "Partner clinic",
    "Morang",
    "Urlabari, Morang",
    "Call the verified facility desk: 021-000002",
    "Mon–Sat · 09:00–17:00 NPT",
    0,
    1,
    0,
    createdAt
  );

  const insertUser = db.prepare(
    "INSERT INTO users (name, email, phone, role, facility_id, password_hash, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const initialPassword = hashPassword(randomBytes(24).toString("hex"));
  const adminId = Number(insertUser.run("Aarati Platform", "admin@raktakosh.local", "+9779800000001", "platform_admin", null, initialPassword, createdAt, createdAt).lastInsertRowid);
  const requesterId = Number(insertUser.run("Maya Rai", "maya@raktakosh.local", "+9779800000002", "requester", null, initialPassword, createdAt, createdAt).lastInsertRowid);
  const donorId = Number(insertUser.run("Sanjay Limbu", "sanjay@raktakosh.local", "+9779800000003", "donor", null, initialPassword, createdAt, createdAt).lastInsertRowid);
  const donorTwoId = Number(insertUser.run("Nima Shrestha", "nima@raktakosh.local", "+9779800000004", "donor", null, initialPassword, createdAt, createdAt).lastInsertRowid);
  const inventoryId = Number(insertUser.run("Rina Inventory", "inventory@morang.raktakosh.local", "+9779800000005", "inventory_manager", morangId, initialPassword, createdAt, createdAt).lastInsertRowid);
  const reviewerId = Number(insertUser.run("Dr. Kiran Review", "reviewer@morang.raktakosh.local", "+9779800000006", "reviewer", morangId, initialPassword, createdAt, createdAt).lastInsertRowid);
  insertUser.run("Anil Facility", "admin@morang.raktakosh.local", "+9779800000007", "facility_admin", morangId, initialPassword, createdAt, createdAt);

  const upsertInventory = db.prepare(
    `INSERT INTO inventory_records (facility_id, blood_group, rh_factor, component, available_quantity, reserved_quantity, public_visible, last_updated, updated_by_user_id, last_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const staleTime = new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString();
  upsertInventory.run(morangId, "O", "+", "Packed red cells", 8, 1, 1, createdAt, inventoryId, "routine_count");
  upsertInventory.run(morangId, "A", "+", "Platelets", 2, 0, 1, createdAt, inventoryId, "routine_count");
  upsertInventory.run(morangId, "B", "+", "Whole blood", 0, 0, 1, staleTime, inventoryId, "reconciliation");
  upsertInventory.run(teachingId, "A", "+", "Packed red cells", 3, 0, 1, createdAt, inventoryId, "routine_count");
  upsertInventory.run(teachingId, "AB", "+", "Plasma", 1, 0, 1, createdAt, inventoryId, "routine_count");

  const insertDonor = db.prepare(
    `INSERT INTO donor_profiles (user_id, self_reported_group, self_reported_rh, district, availability, outreach_consent, contact_window, max_contacts_per_month, pre_screening_result, policy_version, last_donation_date, last_contact_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertDonor.run(donorId, "O", "+", "Morang", "available", 1, "08:00–20:00 NPT", 2, "Preliminarily available under policy guidance; final decision is facility-led.", "Donor pre-screen v1.0", "2026-02-03", null, createdAt, createdAt);
  insertDonor.run(donorTwoId, "A", "+", "Morang", "available", 1, "09:00–18:00 NPT", 2, "Preliminarily available under policy guidance; final decision is facility-led.", "Donor pre-screen v1.0", "2026-01-18", null, createdAt, createdAt);

  const insertRequest = db.prepare(
    `INSERT INTO blood_requests (reference, requester_id, facility_id, client_token, patient_initials, requester_relationship, blood_group, rh_factor, component, quantity, urgency, district, needed_by, status, requester_visible_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const requestOneId = Number(
    insertRequest.run(
      "RK-20260712-CR01",
      requesterId,
      morangId,
      "seed-request-one",
      "A.R.",
      "Family member",
      "A",
      "+",
      "Platelets",
      2,
      "Urgent",
      "Morang",
      new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      "under_review",
      "A reviewer has accepted this coordination request. This is not a reservation or medical confirmation.",
      createdAt,
      createdAt
    ).lastInsertRowid
  );
  const requestTwoId = Number(
    insertRequest.run(
      "RK-20260712-HOPE",
      requesterId,
      morangId,
      "seed-request-two",
      "S.K.",
      "Guardian",
      "O",
      "+",
      "Packed red cells",
      1,
      "Critical",
      "Morang",
      new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      "donor_outreach_active",
      "A verified facility started a privacy-safe donor outreach. The facility will follow up; this does not confirm a donor or availability.",
      createdAt,
      createdAt
    ).lastInsertRowid
  );
  const insertEvent = db.prepare("INSERT INTO request_events (request_id, from_status, to_status, message, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  insertEvent.run(requestOneId, null, "submitted", "Request submitted for facility review.", requesterId, createdAt);
  insertEvent.run(requestOneId, "submitted", "under_review", "A facility reviewer accepted the queue item.", reviewerId, createdAt);
  insertEvent.run(requestTwoId, null, "submitted", "Request submitted for facility review.", requesterId, createdAt);
  insertEvent.run(requestTwoId, "submitted", "under_review", "A facility reviewer accepted the queue item.", reviewerId, createdAt);
  insertEvent.run(requestTwoId, "under_review", "verified", "Request verified for coordination; this is not medical approval.", reviewerId, createdAt);
  insertEvent.run(requestTwoId, "verified", "inventory_unavailable", "Recorded facility availability could not satisfy this request.", reviewerId, createdAt);
  insertEvent.run(requestTwoId, "inventory_unavailable", "donor_outreach_active", "A controlled, privacy-safe donor outreach was started.", reviewerId, createdAt);

  const campaignId = Number(
    db.prepare("INSERT INTO outreach_campaigns (request_id, facility_id, launched_by_user_id, candidate_count, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      requestTwoId,
      morangId,
      reviewerId,
      1,
      "active",
      new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
      createdAt
    ).lastInsertRowid
  );
  db.prepare("INSERT INTO campaign_recipients (campaign_id, donor_user_id, status, sent_at) VALUES (?, ?, 'pending', ?)").run(campaignId, donorId, createdAt);
  createNotification(donorId, "outreach", "Facility contact invitation", "A verified Morang facility requests permission to contact you about an O+ packed red cells need. No patient identity is shared.");

  db.prepare("INSERT INTO policy_versions (name, version, effective_at, summary, created_at) VALUES (?, ?, ?, ?, ?)").run(
    "Donor pre-screening",
    "v1.0",
    "2026-06-26T00:00:00.000Z",
    "Pre-screening is policy guidance only. Final donation eligibility is always determined by the participating facility.",
    createdAt
  );
  db.prepare("INSERT INTO policy_versions (name, version, effective_at, summary, created_at) VALUES (?, ?, ?, ?, ?)").run(
    "Availability freshness",
    "v1.0",
    "2026-06-26T00:00:00.000Z",
    "Public availability becomes stale after the configured refresh window and cannot be presented as current.",
    createdAt
  );

  writeAudit(adminId, "initial_data_seeded", "system", "raktakosh-v1", { facilities: 3, users: 7 });
}

seedDatabase();

export function hashDocument(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
