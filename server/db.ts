import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from "mysql2/promise";
import type { CurrentUser, UserRole } from "../src/types";

export const STALE_AFTER_HOURS = Number(process.env.STALE_AFTER_HOURS ?? 12);
export const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 24);

let pool: Pool | null = null;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured before the API can start.`);
  return value;
}

function requiredRuntimeSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error(`${name} must be configured before the API can start.`);
  return `development-only-${name}`;
}

function opaqueHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildPool(): Pool {
  const databaseUrl = new URL(requiredEnvironment("DATABASE_URL"));
  if (databaseUrl.protocol !== "mysql:") throw new Error("DATABASE_URL must use the mysql:// protocol.");
  const ca = process.env.TIDB_CA_CERT?.replace(/\\n/g, "\n");
  const ssl = process.env.DATABASE_SSL === "false" ? undefined : {
    ...(ca ? { ca } : {}),
    minVersion: "TLSv1.2" as const,
    rejectUnauthorized: true
  };

  return mysql.createPool({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 4000),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, "")),
    ssl,
    waitForConnections: true,
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 8),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    dateStrings: true
  });
}

export function getPool(): Pool {
  pool ??= buildPool();
  return pool;
}

export async function query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().execute(sql, values as never[]);
  return rows as T[];
}

export async function one<T>(sql: string, values: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(sql, values))[0];
}

export async function execute(sql: string, values: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await getPool().execute(sql, values as never[]);
  return result as ResultSetHeader;
}

export async function transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function now(): string {
  return new Date().toISOString();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export interface AuthUser {
  id: number;
  email: string;
  passwordHash: string;
  role: UserRole;
  accountStatus: "active" | "suspended";
  mfaSecretEncrypted: string | null;
  mfaEnabledAt: string | null;
}

export interface AuthChallenge {
  userId: number;
  purpose: "mfa_enroll" | "mfa_verify";
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export async function writeAudit(actorUserId: number | null, action: string, entityType: string, entityId: string | number, metadata: Record<string, unknown> = {}): Promise<void> {
  await execute(
    "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [actorUserId, action, entityType, String(entityId), JSON.stringify(metadata), now()]
  );
}

export async function createNotification(userId: number, category: string, title: string, body: string): Promise<void> {
  await execute(
    "INSERT INTO notifications (user_id, category, title, body, status, created_at) VALUES (?, ?, ?, ?, 'in_app', ?)",
    [userId, category, title, body, now()]
  );
}

export async function createSession(userId: number): Promise<{ token: string; csrfToken: string }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await execute("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [opaqueHash(token), userId, expiresAt, now()]);
  return { token, csrfToken: csrfTokenFor(token) };
}

export async function deleteSession(token: string): Promise<void> {
  await execute("DELETE FROM sessions WHERE token = ?", [opaqueHash(token)]);
}

export async function deleteUserSessions(userId: number): Promise<void> {
  await execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

export function csrfTokenFor(token: string): string {
  return createHmac("sha256", requiredRuntimeSecret("CSRF_SECRET")).update(token).digest("base64url");
}

export function verifyCsrfToken(token: string, submittedToken: string | undefined): boolean {
  if (!submittedToken) return false;
  const expected = Buffer.from(csrfTokenFor(token));
  const received = Buffer.from(submittedToken);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function getAuthUserByEmail(email: string): Promise<AuthUser | undefined> {
  return one<AuthUser>(
    `SELECT id, email, password_hash as passwordHash, role, account_status as accountStatus,
            mfa_secret_encrypted as mfaSecretEncrypted, mfa_enabled_at as mfaEnabledAt
     FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
    [email]
  );
}

export async function getAuthUserById(id: number): Promise<AuthUser | undefined> {
  return one<AuthUser>(
    `SELECT id, email, password_hash as passwordHash, role, account_status as accountStatus,
            mfa_secret_encrypted as mfaSecretEncrypted, mfa_enabled_at as mfaEnabledAt
     FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
}

export async function createAuthChallenge(userId: number, purpose: AuthChallenge["purpose"]): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await execute("INSERT INTO auth_challenges (token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", [opaqueHash(token), userId, purpose, expiresAt, now()]);
  return token;
}

export async function getAuthChallenge(token: string, purpose: AuthChallenge["purpose"]): Promise<AuthChallenge | undefined> {
  return one<AuthChallenge>(
    "SELECT user_id as userId, purpose FROM auth_challenges WHERE token_hash = ? AND purpose = ? AND expires_at > ? LIMIT 1",
    [opaqueHash(token), purpose, now()]
  );
}

export async function consumeAuthChallenge(token: string): Promise<void> {
  await execute("DELETE FROM auth_challenges WHERE token_hash = ?", [opaqueHash(token)]);
}

export async function setMfaSecret(userId: number, encryptedSecret: string): Promise<void> {
  await execute("UPDATE users SET mfa_secret_encrypted = ?, mfa_enabled_at = NULL WHERE id = ?", [encryptedSecret, userId]);
}

export async function enableMfa(userId: number): Promise<void> {
  await execute("UPDATE users SET mfa_enabled_at = ? WHERE id = ?", [now(), userId]);
}

export async function getCurrentUser(token: string | undefined): Promise<CurrentUser | null> {
  if (!token) return null;
  const row = await one<CurrentUser>(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.facility_id as facilityId, f.name as facilityName
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN facilities f ON f.id = u.facility_id
     WHERE s.token = ? AND s.expires_at > ? AND u.account_status = 'active' LIMIT 1`,
    [opaqueHash(token), now()]
  );
  return row ?? null;
}

const schema = [
  `CREATE TABLE IF NOT EXISTS facilities (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    facility_type VARCHAR(80) NOT NULL,
    district VARCHAR(80) NOT NULL,
    address VARCHAR(255) NOT NULL,
    public_contact VARCHAR(255) NOT NULL,
    operating_hours VARCHAR(160) NOT NULL,
    verification_status VARCHAR(40) NOT NULL DEFAULT 'draft',
    public_availability TINYINT(1) NOT NULL DEFAULT 0,
    accepts_requests TINYINT(1) NOT NULL DEFAULT 1,
    participates_outreach TINYINT(1) NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uq_facilities_name (name),
    KEY idx_facilities_public (verification_status, public_availability, district)
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    email VARCHAR(190) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    role VARCHAR(50) NOT NULL,
    facility_id BIGINT UNSIGNED NULL,
    password_hash VARCHAR(255) NOT NULL,
    verified_at VARCHAR(40) NULL,
    account_status VARCHAR(20) NOT NULL DEFAULT 'active',
    mfa_secret_encrypted TEXT NULL,
    mfa_enabled_at VARCHAR(40) NULL,
    created_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_facility_role (facility_id, role),
    CONSTRAINT fk_users_facility FOREIGN KEY (facility_id) REFERENCES facilities(id)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(128) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    expires_at VARCHAR(40) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uq_sessions_token (token),
    KEY idx_sessions_expiry (expires_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS auth_challenges (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    token_hash VARCHAR(128) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    purpose VARCHAR(40) NOT NULL,
    expires_at VARCHAR(40) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uq_auth_challenge_token (token_hash),
    KEY idx_auth_challenge_expiry (expires_at),
    CONSTRAINT fk_auth_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    facility_id BIGINT UNSIGNED NOT NULL,
    blood_group VARCHAR(4) NOT NULL,
    rh_factor VARCHAR(2) NOT NULL,
    component VARCHAR(80) NOT NULL,
    available_quantity INT NOT NULL,
    reserved_quantity INT NOT NULL DEFAULT 0,
    public_visible TINYINT(1) NOT NULL DEFAULT 1,
    last_updated VARCHAR(40) NOT NULL,
    updated_by_user_id BIGINT UNSIGNED NULL,
    last_reason VARCHAR(80) NOT NULL,
    UNIQUE KEY uq_inventory_scope (facility_id, blood_group, rh_factor, component),
    KEY idx_inventory_public (blood_group, rh_factor, component, last_updated),
    CONSTRAINT fk_inventory_facility FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    inventory_record_id BIGINT UNSIGNED NOT NULL,
    editor_user_id BIGINT UNSIGNED NOT NULL,
    previous_quantity INT NOT NULL,
    new_quantity INT NOT NULL,
    reason VARCHAR(80) NOT NULL,
    note TEXT NULL,
    created_at VARCHAR(40) NOT NULL,
    KEY idx_adjustments_record (inventory_record_id, created_at),
    CONSTRAINT fk_adjustment_record FOREIGN KEY (inventory_record_id) REFERENCES inventory_records(id) ON DELETE CASCADE,
    CONSTRAINT fk_adjustment_user FOREIGN KEY (editor_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS blood_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reference VARCHAR(40) NOT NULL,
    requester_id BIGINT UNSIGNED NOT NULL,
    facility_id BIGINT UNSIGNED NOT NULL,
    client_token VARCHAR(100) NULL,
    patient_initials VARCHAR(32) NOT NULL,
    requester_relationship VARCHAR(80) NOT NULL,
    blood_group VARCHAR(4) NOT NULL,
    rh_factor VARCHAR(2) NOT NULL,
    component VARCHAR(80) NOT NULL,
    quantity INT NOT NULL,
    urgency VARCHAR(32) NOT NULL,
    district VARCHAR(80) NOT NULL,
    needed_by VARCHAR(40) NOT NULL,
    status VARCHAR(50) NOT NULL,
    requester_visible_message TEXT NULL,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uq_requests_reference (reference),
    UNIQUE KEY uq_requests_idempotency (requester_id, client_token),
    KEY idx_requests_facility_status (facility_id, status, updated_at),
    KEY idx_requests_requester (requester_id, updated_at),
    CONSTRAINT fk_requests_requester FOREIGN KEY (requester_id) REFERENCES users(id),
    CONSTRAINT fk_requests_facility FOREIGN KEY (facility_id) REFERENCES facilities(id)
  )`,
  `CREATE TABLE IF NOT EXISTS request_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(50) NULL,
    to_status VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    created_at VARCHAR(40) NOT NULL,
    KEY idx_request_events_request (request_id, created_at),
    CONSTRAINT fk_request_events_request FOREIGN KEY (request_id) REFERENCES blood_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_request_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS request_notes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT UNSIGNED NOT NULL,
    author_user_id BIGINT UNSIGNED NOT NULL,
    body TEXT NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    KEY idx_request_notes_request (request_id, created_at),
    CONSTRAINT fk_request_notes_request FOREIGN KEY (request_id) REFERENCES blood_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_request_notes_author FOREIGN KEY (author_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS request_documents (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT UNSIGNED NOT NULL,
    uploader_user_id BIGINT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    storage_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size INT NOT NULL,
    sha256 VARCHAR(128) NOT NULL,
    scan_status VARCHAR(50) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    KEY idx_request_documents_request (request_id, created_at),
    CONSTRAINT fk_documents_request FOREIGN KEY (request_id) REFERENCES blood_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_documents_uploader FOREIGN KEY (uploader_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS donor_profiles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    self_reported_group VARCHAR(4) NOT NULL,
    self_reported_rh VARCHAR(2) NOT NULL,
    district VARCHAR(80) NOT NULL,
    availability VARCHAR(50) NOT NULL,
    outreach_consent TINYINT(1) NOT NULL DEFAULT 0,
    contact_window VARCHAR(100) NOT NULL,
    max_contacts_per_month INT NOT NULL DEFAULT 2,
    pre_screening_result TEXT NOT NULL,
    policy_version VARCHAR(80) NOT NULL,
    last_donation_date VARCHAR(40) NULL,
    last_contact_at VARCHAR(40) NULL,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uq_donor_profile_user (user_id),
    KEY idx_donor_campaign (district, self_reported_group, self_reported_rh, availability, outreach_consent),
    CONSTRAINT fk_donor_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT UNSIGNED NOT NULL,
    facility_id BIGINT UNSIGNED NOT NULL,
    launched_by_user_id BIGINT UNSIGNED NOT NULL,
    candidate_count INT NOT NULL,
    status VARCHAR(40) NOT NULL,
    expires_at VARCHAR(40) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    KEY idx_campaigns_request (request_id, created_at),
    CONSTRAINT fk_campaign_request FOREIGN KEY (request_id) REFERENCES blood_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_campaign_facility FOREIGN KEY (facility_id) REFERENCES facilities(id),
    CONSTRAINT fk_campaign_launcher FOREIGN KEY (launched_by_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS campaign_recipients (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    campaign_id BIGINT UNSIGNED NOT NULL,
    donor_user_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(32) NOT NULL,
    sent_at VARCHAR(40) NOT NULL,
    responded_at VARCHAR(40) NULL,
    UNIQUE KEY uq_campaign_recipient (campaign_id, donor_user_id),
    KEY idx_recipients_donor (donor_user_id, sent_at),
    CONSTRAINT fk_recipient_campaign FOREIGN KEY (campaign_id) REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    CONSTRAINT fk_recipient_donor FOREIGN KEY (donor_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    KEY idx_notifications_user (user_id, created_at),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_user_id BIGINT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    metadata JSON NULL,
    created_at VARCHAR(40) NOT NULL,
    KEY idx_audit_created (created_at),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS policy_versions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    version VARCHAR(80) NOT NULL,
    effective_at VARCHAR(40) NOT NULL,
    summary TEXT NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    UNIQUE KEY uq_policy_version (name, version)
  )`
];

async function seedReferenceData(): Promise<void> {
  const createdAt = now();
  const facilities = [
    ["Morang Community Blood Centre", "Blood centre", "Morang", "Biratnagar, Morang", "Call the verified facility desk: 021-000000", "Sun–Fri · 08:00–18:00 NPT", 1, 1, 1],
    ["Biratnagar Teaching Hospital", "Hospital blood service", "Morang", "Biratnagar, Morang", "Call the verified facility desk: 021-000001", "Every day · 07:00–20:00 NPT", 1, 1, 0],
    ["Urlabari Partner Clinic", "Partner clinic", "Morang", "Urlabari, Morang", "Call the verified facility desk: 021-000002", "Mon–Sat · 09:00–17:00 NPT", 1, 1, 0]
  ];
  for (const facility of facilities) {
    await execute(
      `INSERT IGNORE INTO facilities (name, facility_type, district, address, public_contact, operating_hours, verification_status, public_availability, accepts_requests, participates_outreach, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?)`,
      [...facility, createdAt]
    );
  }
  const morang = await one<{ id: number }>("SELECT id FROM facilities WHERE name = ? LIMIT 1", ["Morang Community Blood Centre"]);
  const teaching = await one<{ id: number }>("SELECT id FROM facilities WHERE name = ? LIMIT 1", ["Biratnagar Teaching Hospital"]);
  if (!morang || !teaching) throw new Error("Reference facilities could not be initialized.");
  const inventory = [
    [morang.id, "O", "+", "Packed red cells", 8, 1],
    [morang.id, "A", "+", "Platelets", 2, 0],
    [morang.id, "B", "+", "Whole blood", 0, 0],
    [teaching.id, "A", "+", "Packed red cells", 3, 0],
    [teaching.id, "AB", "+", "Plasma", 1, 0]
  ];
  for (const record of inventory) {
    await execute(
      `INSERT INTO inventory_records (facility_id, blood_group, rh_factor, component, available_quantity, reserved_quantity, public_visible, last_updated, updated_by_user_id, last_reason)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL, 'initial_import')
       ON DUPLICATE KEY UPDATE available_quantity = available_quantity`,
      [...record, createdAt]
    );
  }
  const policies = [
    ["Donor pre-screening", "v1.0", "Pre-screening is policy guidance only. Final donation eligibility is always determined by the participating facility."],
    ["Availability freshness", "v1.0", "Public availability becomes stale after the configured refresh window and cannot be presented as current."]
  ];
  for (const [name, version, summary] of policies) {
    await execute(
      "INSERT IGNORE INTO policy_versions (name, version, effective_at, summary, created_at) VALUES (?, ?, ?, ?, ?)",
      [name, version, "2026-06-26T00:00:00.000Z", summary, createdAt]
    );
  }
}

async function bootstrapStaff(): Promise<void> {
  if (process.env.BOOTSTRAP_STAFF !== "true") return;
  const morang = await one<{ id: number }>("SELECT id FROM facilities WHERE name = ? LIMIT 1", ["Morang Community Blood Centre"]);
  if (!morang) return;
  const entries: Array<{ role: UserRole; name: string; email?: string; password?: string; facilityId: number | null }> = [
    { role: "platform_admin", name: "Platform Administrator", email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD, facilityId: null },
    { role: "reviewer", name: "Facility Reviewer", email: process.env.BOOTSTRAP_REVIEWER_EMAIL, password: process.env.BOOTSTRAP_REVIEWER_PASSWORD, facilityId: morang.id },
    { role: "inventory_manager", name: "Inventory Manager", email: process.env.BOOTSTRAP_INVENTORY_EMAIL, password: process.env.BOOTSTRAP_INVENTORY_PASSWORD, facilityId: morang.id }
  ];
  for (const entry of entries) {
    if (!entry.email || !entry.password) continue;
    await execute(
      `INSERT IGNORE INTO users (name, email, phone, role, facility_id, password_hash, verified_at, created_at)
       VALUES (?, ?, 'configured-at-deployment', ?, ?, ?, ?, ?)`,
      [entry.name, entry.email.toLowerCase(), entry.role, entry.facilityId, hashPassword(entry.password), now(), now()]
    );
  }
}

export async function initializeDatabase(): Promise<void> {
  for (const statement of schema) await execute(statement);
  await applySecurityMigrations();
  await seedReferenceData();
  await bootstrapStaff();
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await one<{ count: number }>(
    "SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  return Number(result?.count ?? 0) > 0;
}

async function applySecurityMigrations(): Promise<void> {
  await execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(120) PRIMARY KEY,
      applied_at VARCHAR(40) NOT NULL
    )`
  );
  const migrationId = "2026-07-13-security-session-hashing-and-mfa";
  const alreadyApplied = await one<{ id: string }>("SELECT id FROM schema_migrations WHERE id = ? LIMIT 1", [migrationId]);
  if (alreadyApplied) return;
  if (!(await columnExists("users", "account_status"))) {
    await execute("ALTER TABLE users ADD COLUMN account_status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER verified_at");
  }
  if (!(await columnExists("users", "mfa_secret_encrypted"))) {
    await execute("ALTER TABLE users ADD COLUMN mfa_secret_encrypted TEXT NULL AFTER account_status");
  }
  if (!(await columnExists("users", "mfa_enabled_at"))) {
    await execute("ALTER TABLE users ADD COLUMN mfa_enabled_at VARCHAR(40) NULL AFTER mfa_secret_encrypted");
  }
  await execute(
    `CREATE TABLE IF NOT EXISTS auth_challenges (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      token_hash VARCHAR(128) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      purpose VARCHAR(40) NOT NULL,
      expires_at VARCHAR(40) NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      UNIQUE KEY uq_auth_challenge_token (token_hash),
      KEY idx_auth_challenge_expiry (expires_at),
      CONSTRAINT fk_auth_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  // Earlier releases stored raw session tokens. Invalidate them once so only hashes remain after migration.
  await execute("DELETE FROM sessions");
  await execute("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [migrationId, now()]);
}

export function hashDocument(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
