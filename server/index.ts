import "dotenv/config";
import { existsSync } from "node:fs";
import { join } from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import type {
  AdminOverview,
  BloodRequest,
  CurrentUser,
  DonorProfile,
  DonorScreening,
  FacilityDashboard,
  FacilityOperations,
  InventoryItem,
  Invitation,
  PublicAvailability,
  RequestStatus,
  UserRole
} from "../src/types";
import {
  SESSION_HOURS,
  STALE_AFTER_HOURS,
  consumeAuthChallenge,
  createAuthChallenge,
  createNotification,
  createSession,
  deleteSession,
  deleteUserSessions,
  execute,
  getAuthChallenge,
  getAuthUserByEmail,
  getAuthUserById,
  getCurrentUser,
  getPool,
  hashPassword,
  initializeDatabase,
  one,
  query,
  setMfaSecret,
  csrfTokenFor,
  transaction,
  enableMfa,
  verifyCsrfToken,
  verifyPassword,
  writeAudit
} from "./db";
import { REQUEST_STATUS_LABELS, availabilityState, canTransition, makeRequestReference } from "./domain";
import { decryptMfaSecret, encryptMfaSecret, generateTotpSecret, totpUri, verifyTotp } from "./security";
import { canViewFacilityCasework, isBloodBankStaff } from "./facility-access";
import {
  DONOR_SCREENING_QUESTIONS,
  DONOR_SCREENING_VERSION,
  deriveAge,
  hasCompleteScreeningAnswers,
  isValidDateOfBirth,
  preliminaryEligibilityStatus,
  type DonorEligibilityStatus
} from "../src/donor-screening";
import { isNepalDistrict } from "../src/nepal-districts";
import { donationCooldownActive, donationCooldownMonths, donationCooldownUntil, isValidDonationDate, nepalCalendarDate } from "../src/donor-cooldown";
import {
  DocumentWorkflowError,
  documentObjectKey,
  documentRetentionUntil,
  documentUploadSecurity,
  documentWorkflowEnabled,
  documentWorkflowUnavailableMessage,
  safeDocumentName,
  scanDocument,
  sha256,
  signedDocumentDownload,
  storeCleanDocument,
  removeStoredDocument,
  validateDocument,
  type SupportedDocumentMime
} from "./document-storage";

const app = express();
const PORT = Number(process.env.PORT ?? 8787);
const isProduction = process.env.NODE_ENV === "production";
const frontendOrigin = process.env.FRONTEND_ORIGIN?.replace(/\/$/, "");
const validGroups = new Set(["A", "B", "AB", "O"]);
const validRh = new Set(["+", "-"]);
const validComponents = new Set(["Whole blood", "Packed red cells", "Platelets", "Plasma"]);
const facilityRoles = new Set<UserRole>(["inventory_manager", "reviewer", "facility_admin"]);
const localOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
const sessionCookieName = "__Host-rk_session";

interface AuthRequest extends Request {
  viewer?: CurrentUser;
}

interface RequestRow {
  id: number;
  reference: string;
  requester_id: number;
  facility_id: number;
  patient_initials: string;
  requester_relationship: string;
  blood_group: string;
  rh_factor: string;
  component: string;
  quantity: number;
  urgency: string;
  district: string;
  needed_by: string;
  status: RequestStatus;
  requester_visible_message: string | null;
  created_at: string;
  updated_at: string;
  facility_name: string;
}

type InventoryRow = Omit<InventoryItem, "publicVisible"> & { publicVisible: number };
type DonorProfileRow = Omit<DonorProfile, "outreachConsent" | "age" | "eligibilityStatus"> & { outreachConsent: number };
type AdminFacilityRow = Omit<AdminOverview["facilities"][number], "publicAvailability"> & { publicAvailability: number };
type FacilityCaseRow = RequestRow & { requesterName: string; requesterPhone: string };
type FacilityDonorResponseRow = Omit<FacilityOperations["donorResponses"][number], "age"> & { dateOfBirth: string | null };
type DonorScreeningRow = Omit<DonorScreening, "answers">;
type DonorScreeningAnswerRow = { questionKey: string; answer: string };
type RequestDocumentRow = {
  id: number;
  requestId: number;
  uploaderUserId: number;
  originalName: string;
  storageName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  scanStatus: "clean" | "unscanned" | "malicious" | "scan_error" | "pending";
  reviewStatus: "pending" | "accepted" | "rejected";
  reviewedAt: string | null;
  reviewedByUserId: number | null;
  reviewNote: string | null;
  retentionUntil: string;
  createdAt: string;
  deletedAt: string | null;
};
type RequestDocumentAccessRow = RequestDocumentRow & {
  requesterId: number;
  facilityId: number;
  requestReference: string;
  requestStatus: RequestStatus;
};

function apiError(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

function text(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
    secure: isProduction,
    partitioned: isProduction,
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
    path: "/"
  };
}

function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  if (!isProduction) localOrigins.forEach((origin) => origins.add(origin));
  if (frontendOrigin) origins.add(frontendOrigin);
  return origins;
}

function getToken(req: Request): string | undefined {
  return typeof req.cookies?.[sessionCookieName] === "string" ? req.cookies[sessionCookieName] : undefined;
}

function requiresMfa(role: UserRole): boolean {
  return role === "platform_admin" || facilityRoles.has(role);
}

async function hasVerifiedFacility(viewer: CurrentUser): Promise<boolean> {
  if (!viewer.facilityId) return false;
  const facility = await one<{ verification_status: string }>("SELECT verification_status FROM facilities WHERE id = ? LIMIT 1", [viewer.facilityId]);
  return facility?.verification_status === "verified";
}

async function requestRow(requestId: number): Promise<RequestRow | undefined> {
  return one<RequestRow>(
    `SELECT br.*, f.name as facility_name
     FROM blood_requests br JOIN facilities f ON f.id = br.facility_id
     WHERE br.id = ? LIMIT 1`,
    [requestId]
  );
}

function mayAccessRequest(viewer: CurrentUser, row: RequestRow): boolean {
  if (viewer.role === "platform_admin") return true;
  if (viewer.id === row.requester_id) return true;
  return facilityRoles.has(viewer.role) && viewer.facilityId === row.facility_id;
}

async function requestEvents(requestId: number): Promise<BloodRequest["events"]> {
  return query<BloodRequest["events"][number]>(
    `SELECT e.id, e.from_status as fromStatus, e.to_status as toStatus, e.message,
            COALESCE(u.name, 'System') as actorName, e.created_at as createdAt
     FROM request_events e LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE e.request_id = ? ORDER BY e.created_at ASC, e.id ASC`,
    [requestId]
  );
}

async function requestDocuments(requestId: number): Promise<NonNullable<BloodRequest["documents"]>> {
  return query<NonNullable<BloodRequest["documents"]>[number]>(
    `SELECT id, original_name as originalName, mime_type as mimeType, byte_size as byteSize,
            scan_status as scanStatus, review_status as reviewStatus, created_at as createdAt, reviewed_at as reviewedAt
     FROM request_documents
     WHERE request_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [requestId]
  );
}

async function requestDocumentForAccess(documentId: number): Promise<RequestDocumentAccessRow | undefined> {
  return one<RequestDocumentAccessRow>(
    `SELECT d.id, d.request_id as requestId, d.uploader_user_id as uploaderUserId, d.original_name as originalName,
            d.storage_name as storageName, d.mime_type as mimeType, d.byte_size as byteSize, d.sha256,
            d.scan_status as scanStatus, d.review_status as reviewStatus, d.reviewed_at as reviewedAt,
            d.reviewed_by_user_id as reviewedByUserId, d.review_note as reviewNote, d.retention_until as retentionUntil,
            d.created_at as createdAt, d.deleted_at as deletedAt, br.requester_id as requesterId, br.facility_id as facilityId,
            br.reference as requestReference, br.status as requestStatus
     FROM request_documents d
     JOIN blood_requests br ON br.id = d.request_id
     WHERE d.id = ? LIMIT 1`,
    [documentId]
  );
}

function mayViewDocument(viewer: CurrentUser, document: RequestDocumentAccessRow): boolean {
  if (viewer.role === "platform_admin") return true;
  if (viewer.id === document.requesterId) return true;
  return canViewFacilityCasework(viewer.role) && viewer.facilityId === document.facilityId;
}

async function requestNotes(requestId: number): Promise<NonNullable<BloodRequest["internalNotes"]>> {
  return query<NonNullable<BloodRequest["internalNotes"]>[number]>(
    `SELECT n.id, n.body, u.name as authorName, n.created_at as createdAt
     FROM request_notes n JOIN users u ON u.id = n.author_user_id
     WHERE n.request_id = ? ORDER BY n.created_at DESC`,
    [requestId]
  );
}

async function requestDto(row: RequestRow, includeInternal = false): Promise<BloodRequest> {
  const dto: BloodRequest = {
    id: row.id,
    reference: row.reference,
    requesterId: row.requester_id,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
    patientInitials: row.patient_initials,
    bloodGroup: row.blood_group,
    rhFactor: row.rh_factor,
    component: row.component,
    quantity: row.quantity,
    urgency: row.urgency,
    district: row.district,
    neededBy: row.needed_by,
    status: row.status,
    requesterVisibleMessage: row.requester_visible_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: await requestEvents(row.id),
    documents: await requestDocuments(row.id)
  };
  if (includeInternal) dto.internalNotes = await requestNotes(row.id);
  return dto;
}

async function inventoryForFacility(facilityId: number): Promise<InventoryItem[]> {
  const inventory = await query<InventoryRow>(
    `SELECT i.id, i.blood_group as bloodGroup, i.rh_factor as rhFactor, i.component, i.available_quantity as availableQuantity, i.reserved_quantity as reservedQuantity,
            i.public_visible as publicVisible, i.last_updated as lastUpdated, COALESCE(u.name, 'System') as updatedBy, i.last_reason as reason
     FROM inventory_records i LEFT JOIN users u ON u.id = i.updated_by_user_id
     WHERE i.facility_id = ? ORDER BY i.component, i.blood_group, i.rh_factor`,
    [facilityId]
  );
  return inventory.map((item) => ({ ...item, publicVisible: Boolean(item.publicVisible) }));
}

async function donorScreeningDto(donorUserId: number): Promise<DonorScreening> {
  const screening = await one<DonorScreeningRow>(
    `SELECT questionnaire_version as questionnaireVersion, eligibility_status as eligibilityStatus,
            medical_data_consent_at as consentedAt, submitted_at as submittedAt, reviewed_at as reviewedAt,
            review_reason as reviewReason
     FROM donor_health_screenings
     WHERE donor_user_id = ? AND questionnaire_version = ? LIMIT 1`,
    [donorUserId, DONOR_SCREENING_VERSION]
  );
  if (!screening) {
    return {
      questionnaireVersion: DONOR_SCREENING_VERSION,
      eligibilityStatus: "not_started",
      consentedAt: null,
      submittedAt: null,
      reviewedAt: null,
      reviewReason: null,
      answers: {}
    };
  }
  const answers = await query<DonorScreeningAnswerRow>(
    `SELECT question_key as questionKey, answer
     FROM donor_screening_answers a
     JOIN donor_health_screenings s ON s.id = a.screening_id
     WHERE s.donor_user_id = ? AND s.questionnaire_version = ?`,
    [donorUserId, DONOR_SCREENING_VERSION]
  );
  return {
    ...screening,
    answers: Object.fromEntries(answers.map((answer) => [answer.questionKey, answer.answer])) as DonorScreening["answers"]
  };
}

async function hasActiveInterestedDonorResponse(facilityId: number, donorUserId: number): Promise<boolean> {
  const recipient = await one<{ id: number }>(
    `SELECT cr.id
     FROM campaign_recipients cr
     JOIN outreach_campaigns c ON c.id = cr.campaign_id
     JOIN blood_requests br ON br.id = c.request_id
     WHERE c.facility_id = ? AND cr.donor_user_id = ? AND cr.status = 'interested'
       AND br.status NOT IN ('fulfilled','unable_to_fulfill','rejected','cancelled','expired')
     LIMIT 1`,
    [facilityId, donorUserId]
  );
  return Boolean(recipient);
}

async function addRequestEvent(requestId: number, fromStatus: RequestStatus | null, toStatus: RequestStatus, message: string, actorId: number | null): Promise<void> {
  await execute(
    "INSERT INTO request_events (request_id, from_status, to_status, message, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [requestId, fromStatus, toStatus, message, actorId, new Date().toISOString()]
  );
}

async function notifyReviewers(facilityId: number, title: string, body: string): Promise<void> {
  const staff = await query<{ id: number }>("SELECT id FROM users WHERE facility_id = ? AND role IN ('reviewer', 'facility_admin')", [facilityId]);
  await Promise.all(staff.map((member) => createNotification(member.id, "request", title, body)));
}

function statusMessage(status: RequestStatus): string {
  const messages: Partial<Record<RequestStatus, string>> = {
    submitted: "Your request is waiting for facility review.",
    needs_information: "The facility needs more information before it can continue coordination.",
    under_review: "A facility reviewer has accepted this request.",
    verified: "The request is verified for coordination. This is not medical approval or a reservation.",
    inventory_located: "The facility has recorded a possible inventory path. Final facility confirmation is still required.",
    reservation_pending: "The facility is confirming the next coordination step.",
    inventory_unavailable: "The reviewing facility cannot satisfy this request from currently recorded availability.",
    donor_outreach_active: "The facility has started controlled donor outreach. This does not confirm a donor or availability.",
    donor_response_received: "A donor response was received. The facility will handle the next step.",
    facility_follow_up: "The facility coordinator is following up.",
    fulfilled: "The facility recorded the coordination task as complete.",
    unable_to_fulfill: "The facility recorded that it could not fulfill this coordination request.",
    rejected: "The facility could not accept this request under its operating workflow.",
    cancelled: "This request was cancelled.",
    expired: "The requested time passed; a facility must explicitly reopen a new coordination path."
  };
  return messages[status] ?? "Request status updated.";
}

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const viewer = await getCurrentUser(getToken(req));
    if (!viewer) return apiError(res, 401, "Please sign in to continue.");
    req.viewer = viewer;
    next();
  } catch (error) {
    next(error);
  }
}

function requireCsrf(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = getToken(req);
  if (!token || !verifyCsrfToken(token, req.header("X-RK-CSRF"))) {
    return apiError(res, 403, "Your security session has expired. Please sign in again.");
  }
  next();
}

function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.viewer || !roles.includes(req.viewer.role)) return apiError(res, 403, "You do not have access to this action.");
    next();
  };
}

async function requireVerifiedFacility(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.viewer || !facilityRoles.has(req.viewer.role) || !(await hasVerifiedFacility(req.viewer))) {
      return apiError(res, 403, "Only staff of a verified facility may perform this action.");
    }
    next();
  } catch (error) {
    next(error);
  }
}

function trustedOriginGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isProduction || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!frontendOrigin || req.headers.origin !== frontendOrigin) return apiError(res, 403, "This request origin is not authorized.");
  next();
}

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins().has(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-RK-CSRF"]
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(trustedOriginGuard);
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many attempts. Please wait and try again." } });
const writeRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many submissions. Please wait and try again." } });

app.get("/api/health", async (_req, res, next) => {
  try {
    await query<{ ok: number }>("SELECT 1 as ok");
    res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch (error) { next(error); }
});

app.post("/api/auth/register", authRateLimit, async (req, res, next) => {
  try {
    const name = text(req.body?.name, 160);
    const email = text(req.body?.email, 190).toLowerCase();
    const phone = text(req.body?.phone, 40);
    const password = text(req.body?.password, 200);
    const role = text(req.body?.role, 30) as "requester" | "donor";
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !phone || password.length < 12 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(password) || !["requester", "donor"].includes(role)) {
      return apiError(res, 400, "Enter a valid name, email, phone, account type, and a password of at least 12 characters with upper-case, lower-case, number, and symbol.");
    }
    const existing = await getAuthUserByEmail(email);
    if (existing) return apiError(res, 409, "An account already exists for this email address.");
    const createdAt = new Date().toISOString();
    const userId = await transaction(async (connection) => {
      const [userResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO users (name, email, phone, role, facility_id, password_hash, verified_at, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)",
        [name, email, phone, role, hashPassword(password), createdAt, createdAt]
      );
      const insertedId = Number(userResult.insertId);
      if (role === "donor") {
        const bloodGroup = text(req.body?.bloodGroup, 4);
        const rhFactor = text(req.body?.rhFactor, 2);
        const district = text(req.body?.district, 80);
        const dateOfBirth = text(req.body?.dateOfBirth, 10);
        if (!validGroups.has(bloodGroup) || !validRh.has(rhFactor) || !isNepalDistrict(district) || !isValidDateOfBirth(dateOfBirth)) throw new Error("Donor registration requires a valid blood group, Rh factor, Nepal district, and date of birth.");
        await connection.execute(
          `INSERT INTO donor_profiles (user_id, self_reported_group, self_reported_rh, district, date_of_birth, availability, outreach_consent, contact_window, max_contacts_per_month, pre_screening_result, policy_version, last_donation_date, last_contact_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'available', ?, '08:00–20:00 NPT', 2, ?, 'Donor pre-screen v1.0', NULL, NULL, ?, ?)`,
          [insertedId, bloodGroup, rhFactor, district, dateOfBirth, req.body?.outreachConsent ? 1 : 0, "Complete the confidential health pre-screening. A blood-centre clinician makes the final eligibility decision.", createdAt, createdAt]
        );
      }
      return insertedId;
    });
    const session = await createSession(userId);
    const user = await getCurrentUser(session.token);
    await writeAudit(userId, "account_registered", "user", userId, { role, source: clientIp(req) });
    res.cookie(sessionCookieName, session.token, cookieOptions());
    res.status(201).json({ user, csrfToken: session.csrfToken });
  } catch (error) { next(error); }
});

async function completeLogin(req: Request, res: Response, staffOnly: boolean): Promise<void> {
  const email = text(req.body?.email, 190).toLowerCase();
  const password = text(req.body?.password, 200);
  if (!email || !password) return apiError(res, 400, "Email and password are required.");
  const user = await getAuthUserByEmail(email);
  if (!user || user.accountStatus !== "active" || !verifyPassword(password, user.passwordHash)) {
    await writeAudit(null, staffOnly ? "blood_bank_login_denied" : "login_denied", "account", email, { source: clientIp(req) });
    return apiError(res, 401, "The email or password is not correct.");
  }
  if (staffOnly && !isBloodBankStaff(user.role)) {
    await writeAudit(user.id, "blood_bank_login_denied", "account", user.id, { source: clientIp(req), reason: "not_blood_bank_staff" });
    return apiError(res, 403, "This is the Blood Bank staff sign-in. Use the standard account sign-in for this account.");
  }
  if (requiresMfa(user.role)) {
    const purpose = user.mfaEnabledAt && user.mfaSecretEncrypted ? "mfa_verify" : "mfa_enroll";
    const challengeToken = await createAuthChallenge(user.id, purpose);
    res.json({ mfaRequired: purpose === "mfa_verify", mfaEnrollmentRequired: purpose === "mfa_enroll", mfaChallengeToken: challengeToken });
    return;
  }
  const session = await createSession(user.id);
  const viewer = await getCurrentUser(session.token);
  await writeAudit(user.id, staffOnly ? "blood_bank_login_succeeded" : "login_succeeded", "account", user.id, { source: clientIp(req) });
  res.cookie(sessionCookieName, session.token, cookieOptions());
  res.json({ user: viewer, csrfToken: session.csrfToken });
}

app.post("/api/auth/login", authRateLimit, async (req, res, next) => {
  try {
    await completeLogin(req, res, false);
  } catch (error) { next(error); }
});

app.post("/api/auth/blood-bank/login", authRateLimit, async (req, res, next) => {
  try {
    await completeLogin(req, res, true);
  } catch (error) { next(error); }
});

app.post("/api/auth/mfa/enroll/start", authRateLimit, async (req, res, next) => {
  try {
    const challengeToken = text(req.body?.challengeToken, 128);
    const challenge = challengeToken ? await getAuthChallenge(challengeToken, "mfa_enroll") : undefined;
    const user = challenge ? await getAuthUserById(challenge.userId) : undefined;
    if (!challenge || !user || user.accountStatus !== "active" || !requiresMfa(user.role)) return apiError(res, 401, "The secure sign-in step has expired. Start again.");
    const secret = generateTotpSecret();
    await setMfaSecret(user.id, encryptMfaSecret(secret));
    res.json({ secret, otpauthUri: totpUri(user.email, secret) });
  } catch (error) { next(error); }
});

app.post("/api/auth/mfa/enroll/confirm", authRateLimit, async (req, res, next) => {
  try {
    const challengeToken = text(req.body?.challengeToken, 128);
    const code = text(req.body?.code, 8);
    const challenge = challengeToken ? await getAuthChallenge(challengeToken, "mfa_enroll") : undefined;
    const user = challenge ? await getAuthUserById(challenge.userId) : undefined;
    if (!challenge || !user || !user.mfaSecretEncrypted || !verifyTotp(decryptMfaSecret(user.mfaSecretEncrypted), code)) return apiError(res, 401, "The authenticator code is not correct or has expired.");
    await enableMfa(user.id);
    await consumeAuthChallenge(challengeToken);
    const session = await createSession(user.id);
    const viewer = await getCurrentUser(session.token);
    await writeAudit(user.id, "mfa_enrolled", "account", user.id, { source: clientIp(req) });
    res.cookie(sessionCookieName, session.token, cookieOptions());
    res.json({ user: viewer, csrfToken: session.csrfToken });
  } catch (error) { next(error); }
});

app.post("/api/auth/mfa/verify", authRateLimit, async (req, res, next) => {
  try {
    const challengeToken = text(req.body?.challengeToken, 128);
    const code = text(req.body?.code, 8);
    const challenge = challengeToken ? await getAuthChallenge(challengeToken, "mfa_verify") : undefined;
    const user = challenge ? await getAuthUserById(challenge.userId) : undefined;
    if (!challenge || !user || !user.mfaSecretEncrypted || !user.mfaEnabledAt || !verifyTotp(decryptMfaSecret(user.mfaSecretEncrypted), code)) return apiError(res, 401, "The authenticator code is not correct or has expired.");
    await consumeAuthChallenge(challengeToken);
    const session = await createSession(user.id);
    const viewer = await getCurrentUser(session.token);
    await writeAudit(user.id, "mfa_verified", "account", user.id, { source: clientIp(req) });
    res.cookie(sessionCookieName, session.token, cookieOptions());
    res.json({ user: viewer, csrfToken: session.csrfToken });
  } catch (error) { next(error); }
});

app.post("/api/auth/logout", requireAuth, requireCsrf, async (req: AuthRequest, res, next) => {
  try {
    const token = getToken(req);
    if (token) await deleteSession(token);
    res.clearCookie(sessionCookieName, cookieOptions());
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get("/api/auth/me", async (req, res, next) => {
  try {
    // A visitor without a session is a normal public state, not an API error.
    // Returning `null` avoids an expected 401 in browser consoles on the landing page.
    const token = getToken(req);
    const user = await getCurrentUser(token);
    res.json({ user, ...(user && token ? { csrfToken: csrfTokenFor(token) } : {}) });
  } catch (error) { next(error); }
});

app.get("/api/policies", async (_req, res, next) => {
  try {
    res.json({ policies: await query("SELECT id, name, version, effective_at as effectiveAt, summary FROM policy_versions ORDER BY effective_at DESC") });
  } catch (error) { next(error); }
});

app.get("/api/public/availability", async (req, res, next) => {
  try {
    const requestedDistrict = text(req.query.district, 80);
    const district = requestedDistrict === "All districts" ? "" : requestedDistrict;
    const bloodGroup = text(req.query.bloodGroup, 4);
    const rhFactor = text(req.query.rhFactor, 2);
    const component = text(req.query.component, 80);
    const filters = ["f.verification_status = 'verified'", "f.public_availability = 1", "i.public_visible = 1"];
    const values: unknown[] = [];
    if (district && !isNepalDistrict(district)) return apiError(res, 400, "Choose a valid Nepal district.");
    if (district) { filters.push("f.district = ?"); values.push(district); }
    if (bloodGroup && validGroups.has(bloodGroup)) { filters.push("i.blood_group = ?"); values.push(bloodGroup); }
    if (rhFactor && validRh.has(rhFactor)) { filters.push("i.rh_factor = ?"); values.push(rhFactor); }
    if (component && validComponents.has(component)) { filters.push("i.component = ?"); values.push(component); }
    const rows = await query<Omit<PublicAvailability, "state"> & { availableQuantity: number }>(
      `SELECT f.id as facilityId, f.name as facilityName, f.facility_type as facilityType, f.district, f.public_contact as contact, f.operating_hours as operatingHours,
              i.blood_group as bloodGroup, i.rh_factor as rhFactor, i.component, i.available_quantity as availableQuantity, i.last_updated as lastUpdated
       FROM inventory_records i JOIN facilities f ON f.id = i.facility_id
       WHERE ${filters.join(" AND ")} ORDER BY f.name, i.component`,
      values
    );
    const results: PublicAvailability[] = rows.map((row) => ({ ...row, state: availabilityState(Number(row.availableQuantity), row.lastUpdated, STALE_AFTER_HOURS) }));
    await writeAudit(null, "public_search", "availability", "district-filter", { district: district || "all", count: results.length });
    res.json({ results, staleAfterHours: STALE_AFTER_HOURS });
  } catch (error) { next(error); }
});

app.get("/api/public/facilities", async (_req, res, next) => {
  try {
    res.json({ facilities: await query("SELECT id, name, district, facility_type as facilityType, public_contact as contact, operating_hours as operatingHours FROM facilities WHERE verification_status = 'verified' AND accepts_requests = 1 ORDER BY name") });
  } catch (error) { next(error); }
});

app.get("/api/public/config", (_req, res) => {
  res.json({
    documentUploadsEnabled: documentWorkflowEnabled(),
    documentUploadRequired: true,
    documentUploadSecurity: documentUploadSecurity(),
    documentUploadMessage: documentWorkflowEnabled() ? null : documentWorkflowUnavailableMessage()
  });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, new Set(["application/pdf", "image/jpeg", "image/png"]).has(file.mimetype))
});

app.get("/api/requests", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const viewer = req.viewer!;
    let rows: RequestRow[];
    if (viewer.role === "platform_admin") {
      rows = await query<RequestRow>("SELECT br.*, f.name as facility_name FROM blood_requests br JOIN facilities f ON f.id = br.facility_id ORDER BY br.updated_at DESC");
    } else if (facilityRoles.has(viewer.role) && viewer.facilityId) {
      if (!canViewFacilityCasework(viewer.role)) return res.json({ requests: [] });
      rows = await query<RequestRow>("SELECT br.*, f.name as facility_name FROM blood_requests br JOIN facilities f ON f.id = br.facility_id WHERE br.facility_id = ? ORDER BY br.updated_at DESC", [viewer.facilityId]);
    } else {
      rows = await query<RequestRow>("SELECT br.*, f.name as facility_name FROM blood_requests br JOIN facilities f ON f.id = br.facility_id WHERE br.requester_id = ? ORDER BY br.updated_at DESC", [viewer.id]);
    }
    const includeInternal = canViewFacilityCasework(viewer.role) || viewer.role === "platform_admin";
    res.json({ requests: await Promise.all(rows.map((row) => requestDto(row, includeInternal))) });
  } catch (error) { next(error); }
});

app.post("/api/requests", requireAuth, requireCsrf, requireRoles("requester", "donor"), writeRateLimit, upload.single("document"), async (req: AuthRequest, res, next) => {
  try {
    if (!documentWorkflowEnabled()) return apiError(res, 503, documentWorkflowUnavailableMessage());
    const viewer = req.viewer!;
    const facilityId = positiveInteger(req.body?.facilityId);
    const quantity = positiveInteger(req.body?.quantity);
    const patientInitials = text(req.body?.patientInitials, 32);
    const relationship = text(req.body?.relationship, 80);
    const bloodGroup = text(req.body?.bloodGroup, 4);
    const rhFactor = text(req.body?.rhFactor, 2);
    const component = text(req.body?.component, 80);
    const urgency = text(req.body?.urgency, 32);
    const district = text(req.body?.district, 80);
    const neededBy = text(req.body?.neededBy, 40);
    const clientToken = text(req.body?.clientToken, 100);
    if (!facilityId || !quantity || !patientInitials || !relationship || !validGroups.has(bloodGroup) || !validRh.has(rhFactor) || !validComponents.has(component) || !urgency || !isNepalDistrict(district) || !neededBy) return apiError(res, 400, "Complete all required request fields with a valid Nepal district, supported blood group, and component.");
    if (!req.file) return apiError(res, 400, "A hospital slip, prescription, or blood-request PDF/JPG/PNG is required before a request can be submitted.");
    const requiredBy = new Date(neededBy);
    if (Number.isNaN(requiredBy.getTime()) || requiredBy.getTime() <= Date.now()) return apiError(res, 400, "Choose a future needed-by date and time.");
    const facility = await one<{ id: number }>("SELECT id FROM facilities WHERE id = ? AND verification_status = 'verified' AND accepts_requests = 1 LIMIT 1", [facilityId]);
    if (!facility) return apiError(res, 400, "Choose a verified facility that is accepting requests.");
    if (clientToken) {
      const duplicate = await one<{ id: number }>("SELECT id FROM blood_requests WHERE requester_id = ? AND client_token = ? LIMIT 1", [viewer.id, clientToken]);
      if (duplicate) {
        const existing = await requestRow(duplicate.id);
        if (existing) return res.json({ request: await requestDto(existing), duplicate: true });
      }
    }

    const mimeType = validateDocument(req.file.buffer, req.file.mimetype);
    const originalName = safeDocumentName(req.file.originalname, mimeType);
    const checksum = sha256(req.file.buffer);
    const scan = await scanDocument(req.file.buffer, mimeType, checksum);
    const createdAt = new Date().toISOString();
    const reference = makeRequestReference();
    const storageName = documentObjectKey(reference, mimeType);
    await storeCleanDocument({ key: storageName, buffer: req.file.buffer, mimeType, originalName, checksum });
    let requestId: number;
    let documentId: number;
    try {
      ({ requestId, documentId } = await transaction(async (connection) => {
        const [requestResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO blood_requests (reference, requester_id, facility_id, client_token, patient_initials, requester_relationship, blood_group, rh_factor, component, quantity, urgency, district, needed_by, status, requester_visible_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'document_pending_review', ?, ?, ?)`,
           [reference, viewer.id, facilityId, clientToken || null, patientInitials, relationship, bloodGroup, rhFactor, component, quantity, urgency, district, requiredBy.toISOString(), scan.status === "clean" ? "Your verification document passed security screening and is pending facility review." : "Your verification document passed basic file checks and is pending facility review. It was not malware scanned.", createdAt, createdAt]
        );
        const createdRequestId = Number(requestResult.insertId);
        const [documentResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO request_documents (request_id, uploader_user_id, original_name, storage_name, mime_type, byte_size, sha256, scan_status, scan_provider, scanned_at, review_status, reviewed_by_user_id, reviewed_at, review_note, retention_until, deleted_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, NULL, ?)`,
          [createdRequestId, viewer.id, originalName, storageName, mimeType, req.file!.size, checksum, scan.status, scan.provider, scan.scannedAt, documentRetentionUntil(new Date(createdAt)), createdAt]
        );
        await connection.execute(
          "INSERT INTO request_events (request_id, from_status, to_status, message, actor_user_id, created_at) VALUES (?, NULL, 'document_pending_review', ?, ?, ?)",
          [createdRequestId, scan.status === "clean" ? "Verification document scanned clean and is pending facility review." : "Verification document passed basic file validation only and is pending facility review.", viewer.id, createdAt]
        );
        return { requestId: createdRequestId, documentId: Number(documentResult.insertId) };
      }));
    } catch (error) {
      await removeStoredDocument(storageName).catch(() => undefined);
      throw error;
    }
    await notifyReviewers(facilityId, "Verification document pending review", `Request ${reference} has a ${scan.status === "clean" ? "malware-scanned" : "basic-validation-only"} verification document awaiting review.`);
    await writeAudit(viewer.id, "request_submitted_with_document", "blood_request", requestId, { facilityId, bloodGroup, component, quantity, documentId, documentSha256: checksum, documentScanStatus: scan.status, documentScanProvider: scan.provider });
    const row = await requestRow(requestId);
    res.status(201).json({ request: await requestDto(row!) });
  } catch (error) { next(error); }
});

app.post("/api/requests/:id/documents", requireAuth, requireCsrf, requireRoles("requester", "donor"), writeRateLimit, upload.single("document"), async (req: AuthRequest, res, next) => {
  try {
    if (!documentWorkflowEnabled()) return apiError(res, 503, documentWorkflowUnavailableMessage());
    const requestId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    if (!requestId || !req.file) return apiError(res, 400, "Upload one replacement PDF, JPG, or PNG document up to 5 MB.");
    const row = await requestRow(requestId);
    if (!row || viewer.id !== row.requester_id) return apiError(res, 404, "Request not found.");
    if (row.status !== "needs_information") return apiError(res, 409, "A replacement document can be added only when the facility has requested more information.");
    const mimeType = validateDocument(req.file.buffer, req.file.mimetype);
    const originalName = safeDocumentName(req.file.originalname, mimeType);
    const checksum = sha256(req.file.buffer);
    const scan = await scanDocument(req.file.buffer, mimeType, checksum);
    const createdAt = new Date().toISOString();
    const storageName = documentObjectKey(row.reference, mimeType);
    await storeCleanDocument({ key: storageName, buffer: req.file.buffer, mimeType, originalName, checksum });
    let documentId: number;
    try {
      ({ documentId } = await transaction(async (connection) => {
        const [documentResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO request_documents (request_id, uploader_user_id, original_name, storage_name, mime_type, byte_size, sha256, scan_status, scan_provider, scanned_at, review_status, reviewed_by_user_id, reviewed_at, review_note, retention_until, deleted_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, NULL, ?)`,
          [requestId, viewer.id, originalName, storageName, mimeType, req.file!.size, checksum, scan.status, scan.provider, scan.scannedAt, documentRetentionUntil(new Date(createdAt)), createdAt]
        );
        await connection.execute("UPDATE blood_requests SET status = 'document_pending_review', requester_visible_message = ?, updated_at = ? WHERE id = ?", [scan.status === "clean" ? "Your replacement verification document passed security screening and is pending facility review." : "Your replacement verification document passed basic file checks and is pending facility review. It was not malware scanned.", createdAt, requestId]);
        await connection.execute(
          "INSERT INTO request_events (request_id, from_status, to_status, message, actor_user_id, created_at) VALUES (?, 'needs_information', 'document_pending_review', ?, ?, ?)",
          [requestId, scan.status === "clean" ? "Replacement verification document scanned clean and is pending facility review." : "Replacement verification document passed basic file validation only and is pending facility review.", viewer.id, createdAt]
        );
        return { documentId: Number(documentResult.insertId) };
      }));
    } catch (error) {
      await removeStoredDocument(storageName).catch(() => undefined);
      throw error;
    }
    await notifyReviewers(row.facility_id, "Replacement verification document pending review", `Request ${row.reference} has a new ${scan.status === "clean" ? "malware-scanned" : "basic-validation-only"} document awaiting review.`);
    await writeAudit(viewer.id, "replacement_document_uploaded", "request_document", documentId, { requestId, documentSha256: checksum, documentScanStatus: scan.status, documentScanProvider: scan.provider });
    res.status(201).json({ request: await requestDto((await requestRow(requestId))!) });
  } catch (error) { next(error); }
});

app.get("/api/request-documents/:id/download", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const documentId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    if (!documentId) return apiError(res, 404, "Document not found.");
    const document = await requestDocumentForAccess(documentId);
    if (!document || document.deletedAt || !mayViewDocument(viewer, document)) return apiError(res, 404, "Document not found.");
    if (!["clean", "unscanned"].includes(document.scanStatus)) return apiError(res, 409, "This document is not available until its security checks are complete.");
    if (new Date(document.retentionUntil).getTime() <= Date.now()) return apiError(res, 410, "This document has reached its retention deadline and is no longer available.");
    const download = await signedDocumentDownload(document.storageName, document.originalName);
    await writeAudit(viewer.id, "request_document_download_authorized", "request_document", document.id, { requestId: document.requestId, role: viewer.role, expiresAt: download.expiresAt });
    res.json(download);
  } catch (error) { next(error); }
});

app.post("/api/request-documents/:id/review", requireAuth, requireCsrf, requireRoles("reviewer", "facility_admin", "platform_admin"), async (req: AuthRequest, res, next) => {
  try {
    const documentId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    const reviewStatus = text(req.body?.reviewStatus, 20) as "accepted" | "rejected";
    const reviewNote = text(req.body?.reviewNote, 500);
    if (!documentId || !["accepted", "rejected"].includes(reviewStatus)) return apiError(res, 400, "Choose whether the verification document is accepted or rejected.");
    if (reviewStatus === "rejected" && !reviewNote) return apiError(res, 400, "Explain what document information is needed before rejecting it.");
    const document = await requestDocumentForAccess(documentId);
    if (!document || document.deletedAt || !["clean", "unscanned"].includes(document.scanStatus)) return apiError(res, 404, "Document not found.");
    if (viewer.role !== "platform_admin" && (!canViewFacilityCasework(viewer.role) || viewer.facilityId !== document.facilityId || !(await hasVerifiedFacility(viewer)))) return apiError(res, 404, "Document not found.");
    if (document.reviewStatus !== "pending") return apiError(res, 409, "This document has already been reviewed.");
    const reviewedAt = new Date().toISOString();
    const requestStatus: RequestStatus = reviewStatus === "accepted" ? "submitted" : "needs_information";
    const requesterMessage = reviewStatus === "accepted"
      ? "Your verification document was accepted. Your request is now submitted for facility coordination review."
      : "The facility needs a clearer or updated verification document before it can continue coordination.";
    await transaction(async (connection) => {
      await connection.execute(
        "UPDATE request_documents SET review_status = ?, reviewed_by_user_id = ?, reviewed_at = ?, review_note = ? WHERE id = ?",
        [reviewStatus, viewer.id, reviewedAt, reviewNote || null, documentId]
      );
      await connection.execute(
        "UPDATE blood_requests SET status = ?, requester_visible_message = ?, updated_at = ? WHERE id = ?",
        [requestStatus, requesterMessage, reviewedAt, document.requestId]
      );
      await connection.execute(
        "INSERT INTO request_events (request_id, from_status, to_status, message, actor_user_id, created_at) VALUES (?, 'document_pending_review', ?, ?, ?, ?)",
        [document.requestId, requestStatus, requesterMessage, viewer.id, reviewedAt]
      );
    });
    await createNotification(document.requesterId, "request", `Verification document ${reviewStatus}`, requesterMessage);
    await writeAudit(viewer.id, "request_document_reviewed", "request_document", documentId, { requestId: document.requestId, reviewStatus });
    res.json({ request: await requestDto((await requestRow(document.requestId))!, true) });
  } catch (error) { next(error); }
});

app.post("/api/requests/:id/status", requireAuth, requireCsrf, requireRoles("reviewer", "facility_admin", "platform_admin"), async (req: AuthRequest, res, next) => {
  try {
    const requestId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    const targetStatus = text(req.body?.status, 50) as RequestStatus;
    const note = text(req.body?.message, 700);
    if (!requestId || !Object.hasOwn(REQUEST_STATUS_LABELS, targetStatus)) return apiError(res, 400, "Choose a valid status.");
    const row = await requestRow(requestId);
    if (!row || !mayAccessRequest(viewer, row)) return apiError(res, 404, "Request not found.");
    if (viewer.role !== "platform_admin" && !(await hasVerifiedFacility(viewer))) return apiError(res, 403, "Your facility must be verified before it can update requests.");
    if (row.status === "document_pending_review") return apiError(res, 409, "Review the required verification document before changing this request status.");
    if (!canTransition(row.status, targetStatus)) return apiError(res, 409, `Cannot move this request from ${REQUEST_STATUS_LABELS[row.status]} to ${REQUEST_STATUS_LABELS[targetStatus]}.`);
    if (["rejected", "cancelled", "unable_to_fulfill"].includes(targetStatus) && !note) return apiError(res, 400, "A requester-safe explanation is required for this outcome.");
    const message = note || statusMessage(targetStatus);
    await execute("UPDATE blood_requests SET status = ?, requester_visible_message = ?, updated_at = ? WHERE id = ?", [targetStatus, message, new Date().toISOString(), requestId]);
    await addRequestEvent(requestId, row.status, targetStatus, message, viewer.id);
    await createNotification(row.requester_id, "request", `Request ${row.reference} updated`, message);
    await writeAudit(viewer.id, "request_status_changed", "blood_request", requestId, { from: row.status, to: targetStatus });
    res.json({ request: await requestDto((await requestRow(requestId))!, true) });
  } catch (error) { next(error); }
});

app.post("/api/requests/:id/notes", requireAuth, requireCsrf, requireRoles("reviewer", "facility_admin"), requireVerifiedFacility, async (req: AuthRequest, res, next) => {
  try {
    const requestId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    const body = text(req.body?.body, 1200);
    if (!requestId || !body) return apiError(res, 400, "Write a concise internal note.");
    const row = await requestRow(requestId);
    if (!row || viewer.facilityId !== row.facility_id) return apiError(res, 404, "Request not found.");
    const result = await execute("INSERT INTO request_notes (request_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?)", [requestId, viewer.id, body, new Date().toISOString()]);
    await writeAudit(viewer.id, "request_note_added", "request_note", Number(result.insertId), { requestId });
    const notes = await requestNotes(requestId);
    res.status(201).json({ note: notes[0] });
  } catch (error) { next(error); }
});

app.post("/api/requests/:id/outreach", requireAuth, requireCsrf, requireRoles("reviewer", "facility_admin"), async (req: AuthRequest, res, next) => {
  try {
    const requestId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    if (!requestId || !(await hasVerifiedFacility(viewer))) return apiError(res, 403, "Only an authorized reviewer at a verified facility can start outreach.");
    const row = await requestRow(requestId);
    if (!row || viewer.facilityId !== row.facility_id) return apiError(res, 404, "Request not found.");
    if (row.status !== "inventory_unavailable") return apiError(res, 409, "Outreach is only available after a verified request is marked Inventory unavailable.");
    const cooldownMonths = donationCooldownMonths();
    const candidates = await query<{ userId: number }>(
      `SELECT d.user_id as userId FROM donor_profiles d
        WHERE d.outreach_consent = 1 AND d.availability = 'available' AND d.district = ?
          AND d.self_reported_group = ? AND d.self_reported_rh = ?
          AND (d.last_contact_at IS NULL OR d.last_contact_at < ?)
          AND (d.last_donation_date IS NULL OR DATE_ADD(d.last_donation_date, INTERVAL ${cooldownMonths} MONTH) <= ?)
        ORDER BY d.last_contact_at ASC LIMIT 25`,
      [row.district, row.blood_group, row.rh_factor, new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), nepalCalendarDate()]
    );
    if (!candidates.length) return apiError(res, 409, "No consented, available donors meet the configured outreach criteria right now.");
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const campaignId = await transaction(async (connection) => {
      const [campaign] = await connection.execute<ResultSetHeader>(
        "INSERT INTO outreach_campaigns (request_id, facility_id, launched_by_user_id, candidate_count, status, expires_at, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
        [requestId, row.facility_id, viewer.id, candidates.length, expiresAt, createdAt]
      );
      const id = Number(campaign.insertId);
      for (const candidate of candidates) {
        await connection.execute("INSERT INTO campaign_recipients (campaign_id, donor_user_id, status, sent_at) VALUES (?, ?, 'pending', ?)", [id, candidate.userId, createdAt]);
        await connection.execute("UPDATE donor_profiles SET last_contact_at = ?, updated_at = ? WHERE user_id = ?", [createdAt, createdAt, candidate.userId]);
      }
      await connection.execute("UPDATE blood_requests SET status = 'donor_outreach_active', requester_visible_message = ?, updated_at = ? WHERE id = ?", [statusMessage("donor_outreach_active"), createdAt, requestId]);
      return id;
    });
    await Promise.all(candidates.map((candidate) => createNotification(candidate.userId, "outreach", "Facility contact invitation", `A verified facility requests permission to contact you about a ${row.blood_group}${row.rh_factor} ${row.component} need. No patient identity is shared.`)));
    await addRequestEvent(requestId, "inventory_unavailable", "donor_outreach_active", "A controlled, privacy-safe donor outreach was started.", viewer.id);
    await createNotification(row.requester_id, "request", `Request ${row.reference} outreach started`, statusMessage("donor_outreach_active"));
    await writeAudit(viewer.id, "outreach_launched", "outreach_campaign", campaignId, { requestId, candidateCount: candidates.length });
    res.status(201).json({ campaign: { id: campaignId, candidateCount: candidates.length, expiresAt }, request: await requestDto((await requestRow(requestId))!, true) });
  } catch (error) { next(error); }
});

app.get("/api/inventory", requireAuth, requireVerifiedFacility, async (req: AuthRequest, res, next) => {
  try {
    res.json({ inventory: await inventoryForFacility(req.viewer!.facilityId!) });
  } catch (error) { next(error); }
});

app.post("/api/inventory", requireAuth, requireCsrf, requireRoles("inventory_manager", "facility_admin"), requireVerifiedFacility, async (req: AuthRequest, res, next) => {
  try {
    const viewer = req.viewer!;
    const bloodGroup = text(req.body?.bloodGroup, 4);
    const rhFactor = text(req.body?.rhFactor, 2);
    const component = text(req.body?.component, 80);
    const availableQuantity = Number(req.body?.availableQuantity);
    const reservedQuantity = Number(req.body?.reservedQuantity ?? 0);
    const reason = text(req.body?.reason, 80);
    const note = text(req.body?.note, 500);
    const publicVisible = req.body?.publicVisible !== false;
    if (!validGroups.has(bloodGroup) || !validRh.has(rhFactor) || !validComponents.has(component) || !Number.isInteger(availableQuantity) || availableQuantity < 0 || !Number.isInteger(reservedQuantity) || reservedQuantity < 0 || !reason) return apiError(res, 400, "Enter a valid non-negative availability value, component, and adjustment reason.");
    const updatedAt = new Date().toISOString();
    const recordId = await transaction(async (connection) => {
      const [currentRaw] = await connection.execute(
        "SELECT id, available_quantity as availableQuantity FROM inventory_records WHERE facility_id = ? AND blood_group = ? AND rh_factor = ? AND component = ? FOR UPDATE",
        [viewer.facilityId, bloodGroup, rhFactor, component]
      );
      const currentRows = currentRaw as Array<{ id: number; availableQuantity: number }>;
      const current = currentRows[0];
      let id: number;
      let previous = 0;
      if (current) {
        id = Number(current.id); previous = Number(current.availableQuantity);
        await connection.execute("UPDATE inventory_records SET available_quantity = ?, reserved_quantity = ?, public_visible = ?, last_updated = ?, updated_by_user_id = ?, last_reason = ? WHERE id = ?", [availableQuantity, reservedQuantity, publicVisible ? 1 : 0, updatedAt, viewer.id, reason, id]);
      } else {
        const [created] = await connection.execute<ResultSetHeader>("INSERT INTO inventory_records (facility_id, blood_group, rh_factor, component, available_quantity, reserved_quantity, public_visible, last_updated, updated_by_user_id, last_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [viewer.facilityId, bloodGroup, rhFactor, component, availableQuantity, reservedQuantity, publicVisible ? 1 : 0, updatedAt, viewer.id, reason]);
        id = Number(created.insertId);
      }
      await connection.execute("INSERT INTO inventory_adjustments (inventory_record_id, editor_user_id, previous_quantity, new_quantity, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, viewer.id, previous, availableQuantity, reason, note || null, updatedAt]);
      return id;
    });
    await writeAudit(viewer.id, "inventory_updated", "inventory_record", recordId, { availableQuantity, reason, publicVisible });
    res.status(201).json({ inventoryId: recordId });
  } catch (error) { next(error); }
});

app.get("/api/donor/profile", requireAuth, requireRoles("donor"), async (req: AuthRequest, res, next) => {
  try {
    const profile = await one<DonorProfileRow>(
      `SELECT id, self_reported_group as selfReportedGroup, self_reported_rh as selfReportedRh, district, date_of_birth as dateOfBirth, availability,
              outreach_consent as outreachConsent, contact_window as contactWindow, max_contacts_per_month as maxContactsPerMonth,
              pre_screening_result as preScreeningResult, policy_version as policyVersion, last_donation_date as lastDonationDate
       FROM donor_profiles WHERE user_id = ? LIMIT 1`,
      [req.viewer!.id]
    );
    if (!profile) return apiError(res, 404, "Donor profile not found.");
    const screening = await donorScreeningDto(req.viewer!.id);
    const cooldownUntil = donationCooldownUntil(profile.lastDonationDate);
    res.json({ profile: { ...profile, outreachConsent: Boolean(profile.outreachConsent), age: profile.dateOfBirth ? deriveAge(profile.dateOfBirth) : null, eligibilityStatus: screening.eligibilityStatus, donationCooldownActive: donationCooldownActive(profile.lastDonationDate), cooldownUntil, donationCooldownMonths: donationCooldownMonths() } });
  } catch (error) { next(error); }
});

app.get("/api/donor/screening", requireAuth, requireRoles("donor"), async (req: AuthRequest, res, next) => {
  try {
    res.json({ screening: await donorScreeningDto(req.viewer!.id) });
  } catch (error) { next(error); }
});

app.patch("/api/donor/screening", requireAuth, requireCsrf, requireRoles("donor"), async (req: AuthRequest, res, next) => {
  try {
    const viewer = req.viewer!;
    const answers = req.body?.answers;
    if (req.body?.healthDataConsent !== true || !hasCompleteScreeningAnswers(answers)) return apiError(res, 400, "Answer every confidential pre-screening question and confirm consent before submitting.");
    const status = preliminaryEligibilityStatus(answers);
    const timestamp = new Date().toISOString();
    await transaction(async (connection) => {
      const [existingRaw] = await connection.execute(
        "SELECT id FROM donor_health_screenings WHERE donor_user_id = ? AND questionnaire_version = ? FOR UPDATE",
        [viewer.id, DONOR_SCREENING_VERSION]
      );
      const existing = (existingRaw as Array<{ id: number }>)[0];
      let screeningId: number;
      if (existing) {
        screeningId = Number(existing.id);
        await connection.execute(
          `UPDATE donor_health_screenings
           SET eligibility_status = ?, medical_data_consent_at = ?, submitted_at = ?, reviewed_by_user_id = NULL,
               reviewed_at = NULL, review_reason = NULL, updated_at = ?
           WHERE id = ?`,
          [status, timestamp, timestamp, timestamp, screeningId]
        );
      } else {
        const [created] = await connection.execute<ResultSetHeader>(
          `INSERT INTO donor_health_screenings (donor_user_id, questionnaire_version, eligibility_status, medical_data_consent_at, submitted_at, reviewed_by_user_id, reviewed_at, review_reason, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
          [viewer.id, DONOR_SCREENING_VERSION, status, timestamp, timestamp, timestamp, timestamp]
        );
        screeningId = Number(created.insertId);
      }
      for (const question of DONOR_SCREENING_QUESTIONS) {
        await connection.execute(
          `INSERT INTO donor_screening_answers (screening_id, question_key, answer, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE answer = VALUES(answer), updated_at = VALUES(updated_at)`,
          [screeningId, question.key, answers[question.key], timestamp, timestamp]
        );
      }
      await connection.execute(
        "UPDATE donor_profiles SET pre_screening_result = ?, policy_version = ?, updated_at = ? WHERE user_id = ?",
        [status === "needs_review" ? "Your answers need confidential blood-centre review before any donation outreach." : "Your pre-screening was submitted. A blood-centre clinician must make the final eligibility decision.", `Donor pre-screen ${DONOR_SCREENING_VERSION}`, timestamp, viewer.id]
      );
    });
    await writeAudit(viewer.id, "donor_screening_submitted", "donor_health_screening", viewer.id, { questionnaireVersion: DONOR_SCREENING_VERSION, eligibilityStatus: status });
    res.json({ screening: await donorScreeningDto(viewer.id) });
  } catch (error) { next(error); }
});

app.patch("/api/donor/profile", requireAuth, requireCsrf, requireRoles("donor"), async (req: AuthRequest, res, next) => {
  try {
    const viewer = req.viewer!;
    const availability = text(req.body?.availability, 50);
    const outreachConsent = Boolean(req.body?.outreachConsent);
    const contactWindow = text(req.body?.contactWindow, 100);
    const maxContacts = Number(req.body?.maxContactsPerMonth);
    const allowedAvailability = new Set(["available", "unavailable", "temporarily_deferred", "opted_out"]);
    if (!allowedAvailability.has(availability) || !contactWindow || !Number.isInteger(maxContacts) || maxContacts < 1 || maxContacts > 4) return apiError(res, 400, "Choose a valid availability state, contact window, and monthly contact limit.");
    const current = await one<{ lastDonationDate: string | null }>("SELECT last_donation_date as lastDonationDate FROM donor_profiles WHERE user_id = ? LIMIT 1", [viewer.id]);
    const storedAvailability = outreachConsent
      ? (availability === "available" && donationCooldownActive(current?.lastDonationDate) ? "temporarily_deferred" : availability)
      : "opted_out";
    await execute("UPDATE donor_profiles SET availability = ?, outreach_consent = ?, contact_window = ?, max_contacts_per_month = ?, updated_at = ? WHERE user_id = ?", [storedAvailability, outreachConsent ? 1 : 0, contactWindow, maxContacts, new Date().toISOString(), viewer.id]);
    const cooldownUntil = donationCooldownUntil(current?.lastDonationDate);
    await writeAudit(viewer.id, "donor_preferences_updated", "donor_profile", viewer.id, { availability: storedAvailability, outreachConsent, maxContacts, cooldownUntil });
    res.json({ ok: true, cooldownUntil, availability: storedAvailability });
  } catch (error) { next(error); }
});

app.get("/api/donor/invitations", requireAuth, requireRoles("donor"), async (req: AuthRequest, res, next) => {
  try {
    const invitations = await query<Invitation>(
      `SELECT cr.id, cr.campaign_id as campaignId, br.reference as requestReference, f.name as facilityName, br.blood_group as bloodGroup, br.rh_factor as rhFactor,
              br.component, c.expires_at as expiresAt, cr.status, cr.sent_at as createdAt
       FROM campaign_recipients cr
       JOIN outreach_campaigns c ON c.id = cr.campaign_id
       JOIN blood_requests br ON br.id = c.request_id
       JOIN facilities f ON f.id = c.facility_id
       WHERE cr.donor_user_id = ? ORDER BY cr.sent_at DESC`,
      [req.viewer!.id]
    );
    res.json({ invitations });
  } catch (error) { next(error); }
});

app.post("/api/donor/invitations/:id/respond", requireAuth, requireCsrf, requireRoles("donor"), async (req: AuthRequest, res, next) => {
  try {
    const recipientId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    const response = text(req.body?.response, 16);
    const statusMap: Record<string, "interested" | "declined" | "stopped"> = { interested: "interested", declined: "declined", stopped: "stopped" };
    if (!recipientId || !statusMap[response]) return apiError(res, 400, "Choose an invitation response.");
    const recipient = await one<{ id: number; status: string; requestId: number }>(
      `SELECT cr.id, cr.status, c.request_id as requestId
       FROM campaign_recipients cr JOIN outreach_campaigns c ON c.id = cr.campaign_id
       WHERE cr.id = ? AND cr.donor_user_id = ? LIMIT 1`,
      [recipientId, viewer.id]
    );
    if (!recipient) return apiError(res, 404, "Invitation not found.");
    if (recipient.status !== "pending") return apiError(res, 409, "This invitation has already been answered.");
    const createdAt = new Date().toISOString();
    await execute("UPDATE campaign_recipients SET status = ?, responded_at = ? WHERE id = ?", [statusMap[response], createdAt, recipientId]);
    if (response === "stopped") await execute("UPDATE donor_profiles SET outreach_consent = 0, availability = 'opted_out', updated_at = ? WHERE user_id = ?", [createdAt, viewer.id]);
    const row = await requestRow(recipient.requestId);
    if (response === "interested" && row && row.status === "donor_outreach_active") {
      await execute("UPDATE blood_requests SET status = 'donor_response_received', requester_visible_message = ?, updated_at = ? WHERE id = ?", [statusMessage("donor_response_received"), createdAt, row.id]);
      await addRequestEvent(row.id, "donor_outreach_active", "donor_response_received", "A donor indicated interest. The facility must handle the next step.", viewer.id);
      await notifyReviewers(row.facility_id, "Donor response received", "A donor indicated interest and needs coordinator follow-up.");
    }
    await writeAudit(viewer.id, "outreach_response", "campaign_recipient", recipientId, { response });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/facility/dashboard", requireAuth, requireVerifiedFacility, async (req: AuthRequest, res, next) => {
  try {
    const viewer = req.viewer!;
    const facility = await one<FacilityDashboard["facility"]>("SELECT id, name, district, verification_status as verificationStatus FROM facilities WHERE id = ? LIMIT 1", [viewer.facilityId]);
    const requestCounts = await query<FacilityDashboard["requestCounts"][number]>("SELECT status, COUNT(*) as count FROM blood_requests WHERE facility_id = ? GROUP BY status", [viewer.facilityId]);
    const staleThreshold = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000).toISOString();
    const stale = await one<{ count: number }>("SELECT COUNT(*) as count FROM inventory_records WHERE facility_id = ? AND last_updated < ?", [viewer.facilityId, staleThreshold]);
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const updates = await one<{ count: number }>("SELECT COUNT(*) as count FROM inventory_adjustments WHERE editor_user_id = ? AND created_at >= ?", [viewer.id, dayStart.toISOString()]);
    res.json({ dashboard: { facility: facility!, requestCounts, staleCount: Number(stale?.count ?? 0), todayUpdates: Number(updates?.count ?? 0) } });
  } catch (error) { next(error); }
});

app.get("/api/facility/operations", requireAuth, requireVerifiedFacility, async (req: AuthRequest, res, next) => {
  try {
    const viewer = req.viewer!;
    const facilityId = viewer.facilityId!;
    const privateCaseworkAvailable = canViewFacilityCasework(viewer.role);
    const staleThreshold = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000).toISOString();
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const [facility, requestCounts, stale, updates, urgent, pendingReview, donorResponseTotal, donorResponseRows, inventory, documentRows] = await Promise.all([
      one<FacilityOperations["facility"]>(
        `SELECT id, name, district, verification_status as verificationStatus, facility_type as facilityType, address,
                public_contact as publicContact, operating_hours as operatingHours, accepts_requests as acceptsRequests,
                participates_outreach as participatesOutreach
         FROM facilities WHERE id = ? LIMIT 1`,
        [facilityId]
      ),
      query<FacilityOperations["requestCounts"][number]>("SELECT status, COUNT(*) as count FROM blood_requests WHERE facility_id = ? GROUP BY status", [facilityId]),
      one<{ count: number }>("SELECT COUNT(*) as count FROM inventory_records WHERE facility_id = ? AND last_updated < ?", [facilityId, staleThreshold]),
      one<{ count: number }>("SELECT COUNT(*) as count FROM inventory_adjustments WHERE editor_user_id = ? AND created_at >= ?", [viewer.id, dayStart.toISOString()]),
      one<{ count: number }>("SELECT COUNT(*) as count FROM blood_requests WHERE facility_id = ? AND urgency IN ('Urgent', 'Critical') AND status NOT IN ('fulfilled','unable_to_fulfill','rejected','cancelled','expired')", [facilityId]),
      one<{ count: number }>("SELECT COUNT(*) as count FROM blood_requests WHERE facility_id = ? AND status IN ('document_pending_review', 'submitted', 'needs_information', 'under_review')", [facilityId]),
      privateCaseworkAvailable
        ? one<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM campaign_recipients cr
           JOIN outreach_campaigns c ON c.id = cr.campaign_id
           JOIN blood_requests br ON br.id = c.request_id
           WHERE c.facility_id = ? AND cr.status = 'interested' AND cr.responded_at IS NOT NULL
             AND br.status NOT IN ('fulfilled','unable_to_fulfill','rejected','cancelled','expired')`,
          [facilityId]
        )
        : Promise.resolve(undefined),
      privateCaseworkAvailable
        ? query<FacilityDonorResponseRow>(
          `SELECT cr.id as recipientId, cr.donor_user_id as donorUserId, c.id as campaignId, br.reference as requestReference, u.name as donorName, u.phone,
                  d.self_reported_group as bloodGroup, d.self_reported_rh as rhFactor, br.component, d.district, d.contact_window as contactWindow,
                  d.date_of_birth as dateOfBirth, COALESCE(s.eligibility_status, 'not_started') as eligibilityStatus, cr.responded_at as respondedAt
           FROM campaign_recipients cr
           JOIN outreach_campaigns c ON c.id = cr.campaign_id
           JOIN blood_requests br ON br.id = c.request_id
           JOIN donor_profiles d ON d.user_id = cr.donor_user_id
           JOIN users u ON u.id = d.user_id
           LEFT JOIN donor_health_screenings s ON s.donor_user_id = d.user_id AND s.questionnaire_version = ?
           WHERE c.facility_id = ? AND cr.status = 'interested' AND cr.responded_at IS NOT NULL
             AND br.status NOT IN ('fulfilled','unable_to_fulfill','rejected','cancelled','expired')
           ORDER BY cr.responded_at DESC LIMIT 50`,
          [DONOR_SCREENING_VERSION, facilityId]
        )
        : Promise.resolve([]),
      inventoryForFacility(facilityId),
      privateCaseworkAvailable
        ? query<FacilityOperations["documents"][number]>(
          `SELECT d.id, d.request_id as requestId, br.reference as requestReference, br.patient_initials as patientInitials,
                  br.urgency, d.original_name as originalName, d.mime_type as mimeType, d.byte_size as byteSize,
                  d.scan_status as scanStatus, d.review_status as reviewStatus, d.created_at as createdAt,
                  d.reviewed_at as reviewedAt, d.retention_until as retentionUntil
           FROM request_documents d
           JOIN blood_requests br ON br.id = d.request_id
           WHERE br.facility_id = ? AND d.deleted_at IS NULL
           ORDER BY FIELD(d.review_status, 'pending', 'rejected', 'accepted'), d.created_at DESC
           LIMIT 100`,
          [facilityId]
        )
        : Promise.resolve([])
    ]);
    const caseRows = privateCaseworkAvailable
      ? await query<FacilityCaseRow>(
        `SELECT br.*, f.name as facility_name, u.name as requesterName, u.phone as requesterPhone
         FROM blood_requests br
         JOIN facilities f ON f.id = br.facility_id
         JOIN users u ON u.id = br.requester_id
         WHERE br.facility_id = ? AND br.status NOT IN ('fulfilled','unable_to_fulfill','rejected','cancelled','expired')
         ORDER BY FIELD(br.urgency, 'Critical', 'Urgent', 'Routine'), br.needed_by ASC, br.updated_at DESC
         LIMIT 100`,
        [facilityId]
      )
      : [];
    const cases = await Promise.all(caseRows.map(async (row) => ({
      ...(await requestDto(row, true)),
      requester: { name: row.requesterName, phone: row.requesterPhone }
    })));
    const donorResponses = donorResponseRows.map(({ dateOfBirth, ...response }) => ({
      ...response,
      age: dateOfBirth ? deriveAge(dateOfBirth) : null
    }));
    const donorResponseCount = Number(donorResponseTotal?.count ?? 0);
    await writeAudit(viewer.id, privateCaseworkAvailable ? "facility_private_casework_viewed" : "facility_operations_summary_viewed", "facility", facilityId, {
      caseCount: cases.length,
      donorResponseCount
    });
    res.json({
      operations: {
        facility: { ...facility!, acceptsRequests: Boolean(facility!.acceptsRequests), participatesOutreach: Boolean(facility!.participatesOutreach) },
        requestCounts,
        staleCount: Number(stale?.count ?? 0),
        todayUpdates: Number(updates?.count ?? 0),
        urgentOpenCount: Number(urgent?.count ?? 0),
        pendingReviewCount: Number(pendingReview?.count ?? 0),
        donorResponseCount,
        privateCaseworkAvailable,
        inventory,
        cases,
        donorResponses,
        documents: documentRows
      } satisfies FacilityOperations
    });
  } catch (error) { next(error); }
});

app.get("/api/facility/donors/:id/screening", requireAuth, requireRoles("reviewer", "facility_admin"), requireVerifiedFacility, async (req: AuthRequest, res, next) => {
  try {
    const donorUserId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    if (!donorUserId || !(await hasActiveInterestedDonorResponse(viewer.facilityId!, donorUserId))) return apiError(res, 404, "Donor response not found.");
    const screening = await donorScreeningDto(donorUserId);
    await writeAudit(viewer.id, "donor_health_screening_viewed", "donor_health_screening", donorUserId, { facilityId: viewer.facilityId, eligibilityStatus: screening.eligibilityStatus });
    res.json({ screening });
  } catch (error) { next(error); }
});

app.patch("/api/facility/donors/:id/eligibility", requireAuth, requireCsrf, requireRoles("reviewer", "facility_admin"), requireVerifiedFacility, async (req: AuthRequest, res, next) => {
  try {
    const donorUserId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    const eligibilityStatus = text(req.body?.eligibilityStatus, 40) as DonorEligibilityStatus;
    const reviewReason = text(req.body?.reviewReason, 500);
    const allowedStatuses = new Set<DonorEligibilityStatus>(["needs_review", "provisionally_eligible", "not_eligible_now"]);
    if (!donorUserId || !allowedStatuses.has(eligibilityStatus) || (eligibilityStatus === "not_eligible_now" && !reviewReason)) return apiError(res, 400, "Choose a permitted review status and include a reason when the donor is not eligible now.");
    if (!(await hasActiveInterestedDonorResponse(viewer.facilityId!, donorUserId))) return apiError(res, 404, "Donor response not found.");
    const reviewedAt = new Date().toISOString();
    const result = await execute(
      `UPDATE donor_health_screenings
       SET eligibility_status = ?, reviewed_by_user_id = ?, reviewed_at = ?, review_reason = ?, updated_at = ?
       WHERE donor_user_id = ? AND questionnaire_version = ?`,
      [eligibilityStatus, viewer.id, reviewedAt, reviewReason || null, reviewedAt, donorUserId, DONOR_SCREENING_VERSION]
    );
    if (!result.affectedRows) return apiError(res, 409, "The donor has not submitted the current pre-screening questionnaire.");
    await createNotification(donorUserId, "donor_screening", "Pre-screening status updated", "A facility updated your pre-screening status. This is not a clinical diagnosis or final medical clearance.");
    await writeAudit(viewer.id, "donor_screening_reviewed", "donor_health_screening", donorUserId, { facilityId: viewer.facilityId, eligibilityStatus });
    res.json({ screening: await donorScreeningDto(donorUserId) });
  } catch (error) { next(error); }
});

app.post("/api/facility/donors/:id/donations", requireAuth, requireCsrf, requireRoles("reviewer", "facility_admin"), requireVerifiedFacility, async (req: AuthRequest, res, next) => {
  try {
    const donorUserId = positiveInteger(req.params.id);
    const viewer = req.viewer!;
    const donatedOn = text(req.body?.donatedOn, 10);
    if (!donorUserId || !isValidDonationDate(donatedOn) || donatedOn > nepalCalendarDate()) return apiError(res, 400, "Record a valid donation date that is not in the future.");
    if (!(await hasActiveInterestedDonorResponse(viewer.facilityId!, donorUserId))) return apiError(res, 404, "Donor response not found.");
    const recordedAt = new Date().toISOString();
    const cooldownUntil = donationCooldownUntil(donatedOn)!;
    await transaction(async (connection) => {
      const [rows] = await connection.execute("SELECT last_donation_date as lastDonationDate FROM donor_profiles WHERE user_id = ? FOR UPDATE", [donorUserId]);
      const profile = (rows as Array<{ lastDonationDate: string | null }>)[0];
      if (!profile) throw new DocumentWorkflowError("Donor profile not found.", 404);
      if (profile.lastDonationDate && profile.lastDonationDate > donatedOn) throw new DocumentWorkflowError("A newer donation date is already recorded for this donor.", 409);
      if (profile.lastDonationDate === donatedOn) throw new DocumentWorkflowError("This donation date is already recorded.", 409);
      await connection.execute(
        "UPDATE donor_profiles SET last_donation_date = ?, availability = CASE WHEN availability = 'opted_out' THEN 'opted_out' ELSE 'temporarily_deferred' END, updated_at = ? WHERE user_id = ?",
        [donatedOn, recordedAt, donorUserId]
      );
    });
    await createNotification(donorUserId, "donation", "Donation cooldown recorded", `A confirmed donation on ${donatedOn} was recorded. This platform will not select you for new outreach before ${cooldownUntil}. A blood-centre makes the final clinical decision.`);
    await writeAudit(viewer.id, "donation_recorded", "donor_profile", donorUserId, { facilityId: viewer.facilityId, donatedOn, cooldownUntil, cooldownMonths: donationCooldownMonths() });
    res.json({ donatedOn, cooldownUntil, cooldownMonths: donationCooldownMonths() });
  } catch (error) { next(error); }
});

app.get("/api/admin/overview", requireAuth, requireRoles("platform_admin"), async (_req: AuthRequest, res, next) => {
  try {
    const facilities = await query<AdminFacilityRow>(
      `SELECT f.id, f.name, f.district, f.verification_status as status, f.public_availability as publicAvailability,
              (SELECT COUNT(*) FROM blood_requests br WHERE br.facility_id = f.id AND br.status NOT IN ('fulfilled','unable_to_fulfill','rejected','cancelled','expired')) as openRequests
       FROM facilities f ORDER BY f.name`
    );
    const policies = await query<AdminOverview["policies"][number]>("SELECT id, name, version, effective_at as effectiveAt, summary FROM policy_versions ORDER BY effective_at DESC");
    const auditEvents = await query<AdminOverview["auditEvents"][number]>(
      `SELECT a.id, a.action, a.entity_type as entityType, a.entity_id as entityId, COALESCE(u.name, 'System') as actorName, a.created_at as createdAt
       FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC, a.id DESC LIMIT 20`
    );
    const staff = await query<Omit<AdminOverview["staff"][number], "mfaEnabled"> & { mfaEnabled: number }>(
      `SELECT u.id, u.name, u.email, u.role, u.account_status as accountStatus, f.name as facilityName,
              CASE WHEN u.mfa_enabled_at IS NULL THEN 0 ELSE 1 END as mfaEnabled
       FROM users u LEFT JOIN facilities f ON f.id = u.facility_id
       WHERE u.role IN ('platform_admin', 'facility_admin', 'reviewer', 'inventory_manager')
       ORDER BY u.role, u.name`
    );
    res.json({ overview: { facilities: facilities.map((facility) => ({ ...facility, publicAvailability: Boolean(facility.publicAvailability), openRequests: Number(facility.openRequests) })), policies, auditEvents, staff: staff.map((member) => ({ ...member, mfaEnabled: Boolean(member.mfaEnabled) })) } satisfies AdminOverview });
  } catch (error) { next(error); }
});

app.patch("/api/admin/staff/:id/status", requireAuth, requireCsrf, requireRoles("platform_admin"), async (req: AuthRequest, res, next) => {
  try {
    const staffId = positiveInteger(req.params.id);
    const accountStatus = text(req.body?.accountStatus, 20);
    if (!staffId || !["active", "suspended"].includes(accountStatus)) return apiError(res, 400, "Choose an active or suspended account state.");
    if (staffId === req.viewer!.id) return apiError(res, 400, "You cannot change your own administrator access from this session.");
    const staff = await getAuthUserById(staffId);
    if (!staff || !requiresMfa(staff.role)) return apiError(res, 404, "Staff account not found.");
    await execute("UPDATE users SET account_status = ? WHERE id = ?", [accountStatus, staffId]);
    if (accountStatus === "suspended") await deleteUserSessions(staffId);
    await writeAudit(req.viewer!.id, "staff_account_status_changed", "user", staffId, { accountStatus });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/admin/audit", requireAuth, requireRoles("platform_admin"), async (_req: AuthRequest, res, next) => {
  try {
    const events = await query(
      `SELECT a.id, a.action, a.entity_type as entityType, a.entity_id as entityId, a.metadata, COALESCE(u.name, 'System') as actorName, a.created_at as createdAt
       FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC, a.id DESC LIMIT 100`
    );
    res.json({ events });
  } catch (error) { next(error); }
});

const distDirectory = join(process.cwd(), "dist");
if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(join(distDirectory, "index.html"));
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof DocumentWorkflowError) return apiError(res, error.status, error.message);
  if (error instanceof multer.MulterError) return apiError(res, 400, "The upload was not accepted. Use one PDF/JPG/PNG file no larger than 5 MB.");
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(JSON.stringify({ level: "error", message, timestamp: new Date().toISOString() }));
  apiError(res, 500, "The request could not be completed. No confirmation was made.");
});

async function start(): Promise<void> {
  if (isProduction && !frontendOrigin) throw new Error("FRONTEND_ORIGIN must be configured in production.");
  if (process.env.AUTO_MIGRATE === "true") await initializeDatabase();
  await getPool().query("SELECT 1");
  app.listen(PORT, () => console.log(`Raktakosh API listening on port ${PORT}`));
}

void start().catch((error) => {
  console.error(error);
  process.exit(1);
});
