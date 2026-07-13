import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import { execute, getPool, hashPassword, one, query, verifyPassword } from "../server/db";

if (process.env.RUN_LIVE_TENANT_TEST !== "true") {
  throw new Error("Set RUN_LIVE_TENANT_TEST=true to create and clean up temporary live tenant test records.");
}

if (process.env.MIGRATION_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;

const apiBaseUrl = (process.env.TEST_API_BASE_URL ?? "https://raktakoshv1.onrender.com").replace(/\/$/, "");
const origin = process.env.TEST_FRONTEND_ORIGIN ?? "https://raktakoshv1.vercel.app";
const nonce = randomBytes(8).toString("hex");
const superEmail = `qa-super-${nonce}@example.invalid`;
const branchEmail = `qa-branch-${nonce}@example.invalid`;
const facilityName = `QA Tenant ${nonce}`;
const superPassword = "SuperAdmin#2026!";
const temporaryPassword = "BranchTemp#2026!";
const replacementPassword = "BranchOwn#2026!";

type Session = { cookie: string; csrfToken: string; user: { passwordChangeRequired: boolean } };

function totpCode(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = secret.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid test TOTP secret.");
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<{ body: T; response: Response }> {
  const headers = new Headers(init.headers);
  headers.set("Origin", origin);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const body = await response.json() as T;
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return { body, response };
}

async function login(email: string, password: string, staffOnly = false): Promise<Session> {
  const login = await request<{ user: { passwordChangeRequired: boolean }; csrfToken: string }>(staffOnly ? "/api/auth/blood-bank/login" : "/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const cookie = login.response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie || !login.body.csrfToken) throw new Error("Password sign-in did not establish a session.");
  return { cookie, csrfToken: login.body.csrfToken, user: login.body.user };
}

async function loginSuperAdmin(email: string, password: string): Promise<Session> {
  const started = await request<{ mfaEnrollmentRequired?: boolean; mfaChallengeToken?: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!started.body.mfaEnrollmentRequired || !started.body.mfaChallengeToken) throw new Error("Super Admin authenticator enrollment was not required.");
  const setup = await request<{ secret: string }>("/api/auth/mfa/enroll/start", { method: "POST", body: JSON.stringify({ challengeToken: started.body.mfaChallengeToken }) });
  const confirmed = await request<{ user: { passwordChangeRequired: boolean }; csrfToken: string }>("/api/auth/mfa/enroll/confirm", { method: "POST", body: JSON.stringify({ challengeToken: started.body.mfaChallengeToken, code: totpCode(setup.body.secret) }) });
  const cookie = confirmed.response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie || !confirmed.body.csrfToken) throw new Error("Super Admin authenticator confirmation did not establish a session.");
  return { cookie, csrfToken: confirmed.body.csrfToken, user: confirmed.body.user };
}

async function cleanup(): Promise<void> {
  const users = await query<{ id: number }>("SELECT id FROM users WHERE email IN (?, ?)", [superEmail, branchEmail]);
  const ids = users.map((user) => user.id);
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(", ");
    await execute(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, ids);
    await execute(`DELETE FROM audit_events WHERE actor_user_id IN (${placeholders})`, ids);
    await execute(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
  }
  await execute("DELETE FROM facilities WHERE name = ?", [facilityName]);
}

try {
  const createdAt = new Date().toISOString();
  await execute(
    `INSERT INTO users (name, email, phone, role, facility_id, password_hash, verified_at, account_status, password_change_required_at, password_changed_at, created_at)
     VALUES ('QA Super Admin', ?, '+9779800000000', 'platform_admin', NULL, ?, ?, 'active', NULL, ?, ?)`,
    [superEmail, hashPassword(superPassword), createdAt, createdAt, createdAt]
  );

  const superSession = await loginSuperAdmin(superEmail, superPassword);
  if (superSession.user.passwordChangeRequired) throw new Error("Temporary QA Super Admin should not require a password change.");
  const createdTenant = await request<{ tenant: { facilityId: number; facilityName: string; adminEmail: string } }>("/api/admin/tenants", {
    method: "POST",
    headers: { Cookie: superSession.cookie, "X-RK-CSRF": superSession.csrfToken },
    body: JSON.stringify({
      facilityName,
      facilityType: "Blood Bank",
      district: "Jhapa",
      address: "QA-only address, Damak",
      publicContact: "+9779800000001",
      operatingHours: "Sun–Fri · 09:00–17:00 NPT",
      acceptsRequests: true,
      participatesOutreach: false,
      activateNow: true,
      adminName: "QA Branch Admin",
      adminEmail: branchEmail,
      adminPhone: "+9779800000002",
      temporaryPassword
    })
  });
  if (createdTenant.body.tenant.facilityName !== facilityName || createdTenant.body.tenant.adminEmail !== branchEmail) throw new Error("Tenant provisioning returned an unexpected tenant.");

  const branchSession = await login(branchEmail, temporaryPassword, true);
  if (!branchSession.user.passwordChangeRequired) throw new Error("Provisioned branch admin was not forced to change the temporary password.");

  const locked = await fetch(`${apiBaseUrl}/api/facility/operations`, { headers: { Origin: origin, Cookie: branchSession.cookie } });
  if (locked.status !== 428) throw new Error(`Tenant workspace should be locked before password replacement; received ${locked.status}.`);

  const changed = await request<{ user: { passwordChangeRequired: boolean }; csrfToken: string }>("/api/auth/change-password", {
    method: "POST",
    headers: { Cookie: branchSession.cookie, "X-RK-CSRF": branchSession.csrfToken },
    body: JSON.stringify({ currentPassword: temporaryPassword, newPassword: replacementPassword, confirmation: replacementPassword })
  });
  const changedCookie = changed.response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!changedCookie || changed.body.user.passwordChangeRequired) throw new Error("Password replacement did not unlock the branch account.");

  const operations = await request<{ operations: { facility: { id: number; name: string } } }>("/api/facility/operations", { headers: { Cookie: changedCookie } });
  if (operations.body.operations.facility.id !== createdTenant.body.tenant.facilityId || operations.body.operations.facility.name !== facilityName) throw new Error("Tenant dashboard was not scoped to the provisioned Blood Bank.");

  const stored = await one<{ passwordHash: string }>("SELECT password_hash as passwordHash FROM users WHERE email = ? LIMIT 1", [branchEmail]);
  if (!stored || verifyPassword(temporaryPassword, stored.passwordHash) || !verifyPassword(replacementPassword, stored.passwordHash)) throw new Error("Password replacement was not persisted securely.");
  console.log("Live multi-tenant provisioning verification passed.");
} finally {
  await cleanup();
  await getPool().end();
}
