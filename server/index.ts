import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type {
  AdminOverview,
  BloodRequest,
  CurrentUser,
  DonorProfile,
  FacilityDashboard,
  InventoryItem,
  Invitation,
  PublicAvailability,
  RequestStatus,
  UserRole
} from "../src/types";
import {
  SESSION_HOURS,
  STALE_AFTER_HOURS,
  createNotification,
  createSession,
  db,
  deleteSession,
  getCurrentUser,
  getUserByEmail,
  hashDocument,
  uploadsDirectory,
  verifyPassword,
  writeAudit
} from "./db";
import { REQUEST_STATUS_LABELS, allowedTransitions, availabilityState, canTransition, makeRequestReference } from "./domain";

const app = express();
const PORT = Number(process.env.PORT ?? 8787);
const validGroups = new Set(["A", "B", "AB", "O"]);
const validRh = new Set(["+", "-"]);
const validComponents = new Set(["Whole blood", "Packed red cells", "Platelets", "Plasma"]);
const facilityRoles = new Set<UserRole>(["inventory_manager", "reviewer", "facility_admin"]);
const accessProfiles: Array<{ key: string; label: string; description: string; role: UserRole }> = [
  { key: "requester", label: "Requester workspace", description: "Create and track a private blood coordination request.", role: "requester" },
  { key: "donor", label: "Donor workspace", description: "Manage availability, consent, and outreach responses.", role: "donor" },
  { key: "inventory", label: "Inventory workspace", description: "Maintain facility availability with adjustment history.", role: "inventory_manager" },
  { key: "reviewer", label: "Review workspace", description: "Review requests and coordinate the next verified step.", role: "reviewer" },
  { key: "administrator", label: "Administrator workspace", description: "Review facility governance, policies, and audit activity.", role: "platform_admin" }
];

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

type RateEntry = { count: number; expiresAt: number };
const rateEntries = new Map<string, RateEntry>();

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cache-Control", req.path.startsWith("/api") ? "no-store" : "public, max-age=300");
  next();
});

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

function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${clientIp(req)}:${req.path}`;
    const now = Date.now();
    const existing = rateEntries.get(key);
    if (!existing || existing.expiresAt <= now) {
      rateEntries.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }
    existing.count += 1;
    if (existing.count > limit) return apiError(res, 429, "Too many requests. Please wait and try again.");
    next();
  };
}

function getToken(req: Request): string | undefined {
  return typeof req.cookies?.rk_session === "string" ? req.cookies.rk_session : undefined;
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const viewer = getCurrentUser(getToken(req));
  if (!viewer) return apiError(res, 401, "Please sign in to continue.");
  req.viewer = viewer;
  next();
}

function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.viewer || !roles.includes(req.viewer.role)) return apiError(res, 403, "You do not have access to this action.");
    next();
  };
}

function hasVerifiedFacility(viewer: CurrentUser): boolean {
  if (!viewer.facilityId) return false;
  const facility = db.prepare("SELECT verification_status FROM facilities WHERE id = ?").get(viewer.facilityId) as { verification_status?: string } | undefined;
  return facility?.verification_status === "verified";
}

function requireVerifiedFacility(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.viewer || !facilityRoles.has(req.viewer.role) || !hasVerifiedFacility(req.viewer)) {
    return apiError(res, 403, "Only staff of a verified facility may perform this action.");
  }
  next();
}

function requestRow(requestId: number): RequestRow | undefined {
  return db
    .prepare(
      `SELECT br.*, f.name as facility_name
       FROM blood_requests br
       JOIN facilities f ON f.id = br.facility_id
       WHERE br.id = ?`
    )
    .get(requestId) as RequestRow | undefined;
}

function mayAccessRequest(viewer: CurrentUser, row: RequestRow): boolean {
  if (viewer.role === "platform_admin") return true;
  if (viewer.id === row.requester_id) return true;
  return facilityRoles.has(viewer.role) && viewer.facilityId === row.facility_id;
}

function requestEvents(requestId: number) {
  return db
    .prepare(
      `SELECT e.id, e.from_status as fromStatus, e.to_status as toStatus, e.message, COALESCE(u.name, 'System') as actorName, e.created_at as createdAt
       FROM request_events e LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.request_id = ? ORDER BY e.created_at ASC, e.id ASC`
    )
    .all(requestId);
}

function requestDocuments(requestId: number) {
  return db
    .prepare(
      "SELECT id, original_name as originalName, scan_status as scanStatus, created_at as createdAt FROM request_documents WHERE request_id = ? ORDER BY created_at DESC"
    )
    .all(requestId);
}

function requestNotes(requestId: number) {
  return db
    .prepare(
      `SELECT n.id, n.body, u.name as authorName, n.created_at as createdAt
       FROM request_notes n JOIN users u ON u.id = n.author_user_id
       WHERE n.request_id = ? ORDER BY n.created_at DESC`
    )
    .all(requestId);
}

function requestDto(row: RequestRow, includeInternal = false): BloodRequest {
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
    events: requestEvents(row.id) as unknown as BloodRequest["events"],
    documents: requestDocuments(row.id) as unknown as NonNullable<BloodRequest["documents"]>
  };
  if (includeInternal) dto.internalNotes = requestNotes(row.id) as unknown as NonNullable<BloodRequest["internalNotes"]>;
  return dto;
}

function addRequestEvent(requestId: number, fromStatus: RequestStatus | null, toStatus: RequestStatus, message: string, actorId: number | null): void {
  db.prepare("INSERT INTO request_events (request_id, from_status, to_status, message, actor_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    requestId,
    fromStatus,
    toStatus,
    message,
    actorId,
    new Date().toISOString()
  );
}

function notifyReviewers(facilityId: number, title: string, body: string): void {
  const staff = db.prepare("SELECT id FROM users WHERE facility_id = ? AND role IN ('reviewer', 'facility_admin')").all(facilityId) as Array<{ id: number }>;
  staff.forEach((staffMember) => createNotification(staffMember.id, "request", title, body));
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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", mode: "ready", timestamp: new Date().toISOString() });
});

app.get("/api/access-profiles", (_req, res) => {
  res.json({ profiles: accessProfiles.map(({ key, label, description }) => ({ key, label, description })) });
});

app.post("/api/auth/access-profile", rateLimit(12, 15 * 60 * 1000), (req, res) => {
  const key = text(req.body?.key, 32);
  const profile = accessProfiles.find((candidate) => candidate.key === key);
  if (!profile) return apiError(res, 400, "Choose a valid workspace.");
  const user = db.prepare("SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1").get(profile.role) as { id: number } | undefined;
  if (!user) return apiError(res, 503, "This workspace is temporarily unavailable.");
  const token = createSession(user.id);
  const viewer = getCurrentUser(token);
  writeAudit(user.id, "workspace_accessed", "account", user.id, { profile: profile.key, source: clientIp(req) });
  res.cookie("rk_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
    path: "/"
  });
  res.json({ user: viewer });
});

app.post("/api/auth/login", rateLimit(8, 15 * 60 * 1000), (req, res) => {
  const email = text(req.body?.email, 120).toLowerCase();
  const password = text(req.body?.password, 200);
  if (!email || !password) return apiError(res, 400, "Email and password are required.");
  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    writeAudit(null, "login_denied", "account", email, { source: clientIp(req) });
    return apiError(res, 401, "The email or password is not correct.");
  }
  const token = createSession(user.id);
  const viewer = getCurrentUser(token);
  writeAudit(user.id, "login_succeeded", "account", user.id, { source: clientIp(req) });
  res.cookie("rk_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
    path: "/"
  });
  res.json({ user: viewer });
});

app.post("/api/auth/logout", (req, res) => {
  const token = getToken(req);
  if (token) deleteSession(token);
  res.clearCookie("rk_session", { path: "/" });
  res.status(204).end();
});

app.get("/api/auth/me", requireAuth, (req: AuthRequest, res) => {
  res.json({ user: req.viewer });
});

app.get("/api/policies", (_req, res) => {
  const policies = db.prepare("SELECT id, name, version, effective_at as effectiveAt, summary FROM policy_versions ORDER BY effective_at DESC").all();
  res.json({ policies });
});

app.get("/api/public/availability", rateLimit(60, 10 * 60 * 1000), (req, res) => {
  const district = text(req.query.district, 60);
  const bloodGroup = text(req.query.bloodGroup, 4);
  const rhFactor = text(req.query.rhFactor, 2);
  const component = text(req.query.component, 30);
  const filters: string[] = ["f.verification_status = 'verified'", "f.public_availability = 1", "i.public_visible = 1"];
  const values: string[] = [];
  if (district && district !== "All districts") {
    filters.push("f.district = ?");
    values.push(district);
  }
  if (bloodGroup && validGroups.has(bloodGroup)) {
    filters.push("i.blood_group = ?");
    values.push(bloodGroup);
  }
  if (rhFactor && validRh.has(rhFactor)) {
    filters.push("i.rh_factor = ?");
    values.push(rhFactor);
  }
  if (component && validComponents.has(component)) {
    filters.push("i.component = ?");
    values.push(component);
  }
  const rows = db
    .prepare(
      `SELECT f.id as facilityId, f.name as facilityName, f.facility_type as facilityType, f.district, f.public_contact as contact, f.operating_hours as operatingHours,
              i.blood_group as bloodGroup, i.rh_factor as rhFactor, i.component, i.available_quantity as availableQuantity, i.last_updated as lastUpdated
       FROM inventory_records i JOIN facilities f ON f.id = i.facility_id
       WHERE ${filters.join(" AND ")} ORDER BY f.name, i.component`
    )
    .all(...values) as Array<Omit<PublicAvailability, "state"> & { availableQuantity: number }>;
  const results: PublicAvailability[] = rows.map((row) => ({
    facilityId: row.facilityId,
    facilityName: row.facilityName,
    facilityType: row.facilityType,
    district: row.district,
    contact: row.contact,
    operatingHours: row.operatingHours,
    bloodGroup: row.bloodGroup,
    rhFactor: row.rhFactor,
    component: row.component,
    state: availabilityState(row.availableQuantity, row.lastUpdated, STALE_AFTER_HOURS),
    lastUpdated: row.lastUpdated
  }));
  writeAudit(null, "public_search", "availability", "district-filter", { district: district || "all", count: results.length });
  res.json({ results, staleAfterHours: STALE_AFTER_HOURS });
});

app.get("/api/public/facilities", (_req, res) => {
  const facilities = db
    .prepare("SELECT id, name, district, facility_type as facilityType, public_contact as contact, operating_hours as operatingHours FROM facilities WHERE verification_status = 'verified' AND accepts_requests = 1 ORDER BY name")
    .all();
  res.json({ facilities });
});

app.get("/api/requests", requireAuth, (req: AuthRequest, res) => {
  const viewer = req.viewer!;
  let rows: RequestRow[] = [];
  if (viewer.role === "platform_admin") {
    rows = db.prepare(`SELECT br.*, f.name as facility_name FROM blood_requests br JOIN facilities f ON f.id = br.facility_id ORDER BY br.updated_at DESC`).all() as unknown as RequestRow[];
  } else if (facilityRoles.has(viewer.role) && viewer.facilityId) {
    rows = db.prepare(`SELECT br.*, f.name as facility_name FROM blood_requests br JOIN facilities f ON f.id = br.facility_id WHERE br.facility_id = ? ORDER BY br.updated_at DESC`).all(viewer.facilityId) as unknown as RequestRow[];
  } else {
    rows = db.prepare(`SELECT br.*, f.name as facility_name FROM blood_requests br JOIN facilities f ON f.id = br.facility_id WHERE br.requester_id = ? ORDER BY br.updated_at DESC`).all(viewer.id) as unknown as RequestRow[];
  }
  const includeInternal = facilityRoles.has(viewer.role) || viewer.role === "platform_admin";
  res.json({ requests: rows.map((row) => requestDto(row, includeInternal)) });
});

app.post("/api/requests", requireAuth, requireRoles("requester", "donor"), rateLimit(8, 60 * 60 * 1000), (req: AuthRequest, res) => {
  const viewer = req.viewer!;
  const facilityId = positiveInteger(req.body?.facilityId);
  const quantity = positiveInteger(req.body?.quantity);
  const patientInitials = text(req.body?.patientInitials, 32);
  const relationship = text(req.body?.relationship, 60);
  const bloodGroup = text(req.body?.bloodGroup, 4);
  const rhFactor = text(req.body?.rhFactor, 2);
  const component = text(req.body?.component, 32);
  const urgency = text(req.body?.urgency, 32);
  const district = text(req.body?.district, 60);
  const neededBy = text(req.body?.neededBy, 40);
  const clientToken = text(req.body?.clientToken, 80);
  if (!facilityId || !quantity || !patientInitials || !relationship || !validGroups.has(bloodGroup) || !validRh.has(rhFactor) || !validComponents.has(component) || !urgency || !district || !neededBy) {
    return apiError(res, 400, "Complete all required request fields with a supported blood group and component.");
  }
  const requiredBy = new Date(neededBy);
  if (Number.isNaN(requiredBy.getTime()) || requiredBy.getTime() <= Date.now()) return apiError(res, 400, "Choose a future needed-by date and time.");
  const facility = db.prepare("SELECT id FROM facilities WHERE id = ? AND verification_status = 'verified' AND accepts_requests = 1").get(facilityId) as { id: number } | undefined;
  if (!facility) return apiError(res, 400, "Choose a verified facility that is accepting requests.");
  if (clientToken) {
    const duplicate = db.prepare("SELECT id FROM blood_requests WHERE requester_id = ? AND client_token = ?").get(viewer.id, clientToken) as { id: number } | undefined;
    if (duplicate) {
      const existing = requestRow(duplicate.id);
      if (existing) return res.json({ request: requestDto(existing), duplicate: true });
    }
  }
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO blood_requests (reference, requester_id, facility_id, client_token, patient_initials, requester_relationship, blood_group, rh_factor, component, quantity, urgency, district, needed_by, status, requester_visible_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`
    )
    .run(
      makeRequestReference(),
      viewer.id,
      facilityId,
      clientToken || null,
      patientInitials,
      relationship,
      bloodGroup,
      rhFactor,
      component,
      quantity,
      urgency,
      district,
      requiredBy.toISOString(),
      "Your request has been submitted for facility review. It is not a reservation or medical confirmation.",
      createdAt,
      createdAt
    );
  const requestId = Number(result.lastInsertRowid);
  addRequestEvent(requestId, null, "submitted", "Request submitted for facility review.", viewer.id);
  notifyReviewers(facilityId, "New coordination request", "A new request needs facility review.");
  writeAudit(viewer.id, "request_submitted", "blood_request", requestId, { facilityId, bloodGroup, component, quantity });
  res.status(201).json({ request: requestDto(requestRow(requestId)!) });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png"]);
    callback(null, allowed.has(file.mimetype));
  }
});

app.post("/api/requests/:id/document", requireAuth, upload.single("document"), (req: AuthRequest, res) => {
  const requestId = positiveInteger(req.params.id);
  const viewer = req.viewer!;
  if (!requestId) return apiError(res, 400, "Invalid request identifier.");
  const row = requestRow(requestId);
  if (!row || !mayAccessRequest(viewer, row)) return apiError(res, 404, "Request not found.");
  if (viewer.id !== row.requester_id && viewer.role !== "platform_admin") return apiError(res, 403, "Only the requester may add a supporting document.");
  if (!req.file) return apiError(res, 400, "Upload a PDF, JPG, JPEG, or PNG file up to 5 MB.");
  const allowed = new Set(["application/pdf", "image/jpeg", "image/png"]);
  if (!allowed.has(req.file.mimetype)) return apiError(res, 400, "Only PDF, JPG, JPEG, and PNG files are permitted.");
  const extension = req.file.mimetype === "application/pdf" ? ".pdf" : req.file.mimetype === "image/png" ? ".png" : ".jpg";
  const storageName = `${randomUUID()}${extension}`;
  writeFileSync(join(uploadsDirectory, storageName), req.file.buffer, { flag: "wx" });
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      "INSERT INTO request_documents (request_id, uploader_user_id, original_name, storage_name, mime_type, byte_size, sha256, scan_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_validation', ?)"
    )
    .run(requestId, viewer.id, text(req.file.originalname, 160) || `supporting-document${extension}`, storageName, req.file.mimetype, req.file.size, hashDocument(req.file.buffer), createdAt);
  writeAudit(viewer.id, "document_uploaded", "request_document", Number(result.lastInsertRowid), { requestId, mimeType: req.file.mimetype, size: req.file.size });
  res.status(201).json({ document: { id: Number(result.lastInsertRowid), originalName: text(req.file.originalname, 160), scanStatus: "pending_validation", createdAt } });
});

app.post("/api/requests/:id/status", requireAuth, requireRoles("reviewer", "facility_admin", "platform_admin"), (req: AuthRequest, res) => {
  const requestId = positiveInteger(req.params.id);
  const viewer = req.viewer!;
  const targetStatus = text(req.body?.status, 40) as RequestStatus;
  const note = text(req.body?.message, 700);
  if (!requestId || !Object.hasOwn(REQUEST_STATUS_LABELS, targetStatus)) return apiError(res, 400, "Choose a valid status.");
  const row = requestRow(requestId);
  if (!row || !mayAccessRequest(viewer, row)) return apiError(res, 404, "Request not found.");
  if (viewer.role !== "platform_admin" && !hasVerifiedFacility(viewer)) return apiError(res, 403, "Your facility must be verified before it can update requests.");
  if (!canTransition(row.status, targetStatus)) return apiError(res, 409, `Cannot move this request from ${REQUEST_STATUS_LABELS[row.status]} to ${REQUEST_STATUS_LABELS[targetStatus]}.`);
  if (["rejected", "cancelled", "unable_to_fulfill"].includes(targetStatus) && !note) return apiError(res, 400, "A requester-safe explanation is required for this outcome.");
  const message = note || statusMessage(targetStatus);
  const updatedAt = new Date().toISOString();
  db.prepare("UPDATE blood_requests SET status = ?, requester_visible_message = ?, updated_at = ? WHERE id = ?").run(targetStatus, message, updatedAt, requestId);
  addRequestEvent(requestId, row.status, targetStatus, message, viewer.id);
  createNotification(row.requester_id, "request", `Request ${row.reference} updated`, message);
  writeAudit(viewer.id, "request_status_changed", "blood_request", requestId, { from: row.status, to: targetStatus });
  res.json({ request: requestDto(requestRow(requestId)!, true) });
});

app.post("/api/requests/:id/notes", requireAuth, requireVerifiedFacility, (req: AuthRequest, res) => {
  const requestId = positiveInteger(req.params.id);
  const viewer = req.viewer!;
  const body = text(req.body?.body, 1200);
  if (!requestId || !body) return apiError(res, 400, "Write a concise internal note.");
  const row = requestRow(requestId);
  if (!row || viewer.facilityId !== row.facility_id) return apiError(res, 404, "Request not found.");
  const result = db.prepare("INSERT INTO request_notes (request_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?)").run(requestId, viewer.id, body, new Date().toISOString());
  writeAudit(viewer.id, "request_note_added", "request_note", Number(result.lastInsertRowid), { requestId });
  res.status(201).json({ note: requestNotes(requestId)[0] });
});

app.post("/api/requests/:id/outreach", requireAuth, requireRoles("reviewer", "facility_admin"), (req: AuthRequest, res) => {
  const requestId = positiveInteger(req.params.id);
  const viewer = req.viewer!;
  if (!requestId || !hasVerifiedFacility(viewer)) return apiError(res, 403, "Only an authorized reviewer at a verified facility can start outreach.");
  const row = requestRow(requestId);
  if (!row || viewer.facilityId !== row.facility_id) return apiError(res, 404, "Request not found.");
  if (row.status !== "inventory_unavailable") return apiError(res, 409, "Outreach is only available after a verified request is marked Inventory unavailable.");
  const candidates = db
    .prepare(
      `SELECT d.user_id as userId
       FROM donor_profiles d JOIN users u ON u.id = d.user_id
       WHERE d.outreach_consent = 1 AND d.availability = 'available' AND d.district = ?
         AND d.self_reported_group = ? AND d.self_reported_rh = ?
         AND (d.last_contact_at IS NULL OR d.last_contact_at < ?)
       ORDER BY d.last_contact_at ASC LIMIT 25`
    )
    .all(row.district, row.blood_group, row.rh_factor, new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()) as Array<{ userId: number }>;
  if (candidates.length === 0) return apiError(res, 409, "No consented, available donors meet the configured outreach criteria right now.");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const campaignId = Number(
    db.prepare("INSERT INTO outreach_campaigns (request_id, facility_id, launched_by_user_id, candidate_count, status, expires_at, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").run(requestId, row.facility_id, viewer.id, candidates.length, expiresAt, createdAt).lastInsertRowid
  );
  const addRecipient = db.prepare("INSERT INTO campaign_recipients (campaign_id, donor_user_id, status, sent_at) VALUES (?, ?, 'pending', ?)");
  const updateContact = db.prepare("UPDATE donor_profiles SET last_contact_at = ?, updated_at = ? WHERE user_id = ?");
  candidates.forEach((candidate) => {
    addRecipient.run(campaignId, candidate.userId, createdAt);
    updateContact.run(createdAt, createdAt, candidate.userId);
    createNotification(candidate.userId, "outreach", "Facility contact invitation", `A verified facility requests permission to contact you about a ${row.blood_group}${row.rh_factor} ${row.component} need. No patient identity is shared.`);
  });
  db.prepare("UPDATE blood_requests SET status = 'donor_outreach_active', requester_visible_message = ?, updated_at = ? WHERE id = ?").run(statusMessage("donor_outreach_active"), createdAt, requestId);
  addRequestEvent(requestId, "inventory_unavailable", "donor_outreach_active", "A controlled, privacy-safe donor outreach was started.", viewer.id);
  createNotification(row.requester_id, "request", `Request ${row.reference} outreach started`, statusMessage("donor_outreach_active"));
  writeAudit(viewer.id, "outreach_launched", "outreach_campaign", campaignId, { requestId, candidateCount: candidates.length });
  res.status(201).json({ campaign: { id: campaignId, candidateCount: candidates.length, expiresAt }, request: requestDto(requestRow(requestId)!, true) });
});

app.get("/api/inventory", requireAuth, requireVerifiedFacility, (req: AuthRequest, res) => {
  const viewer = req.viewer!;
  const inventory = db
    .prepare(
      `SELECT i.id, i.blood_group as bloodGroup, i.rh_factor as rhFactor, i.component, i.available_quantity as availableQuantity, i.reserved_quantity as reservedQuantity,
              i.public_visible as publicVisible, i.last_updated as lastUpdated, u.name as updatedBy, i.last_reason as reason
       FROM inventory_records i LEFT JOIN users u ON u.id = i.updated_by_user_id
       WHERE i.facility_id = ? ORDER BY i.component, i.blood_group, i.rh_factor`
    )
    .all(viewer.facilityId) as unknown as InventoryItem[];
  res.json({ inventory: inventory.map((item) => ({ ...item, publicVisible: Boolean(item.publicVisible) })) });
});

app.post("/api/inventory", requireAuth, requireRoles("inventory_manager", "facility_admin"), requireVerifiedFacility, (req: AuthRequest, res) => {
  const viewer = req.viewer!;
  const bloodGroup = text(req.body?.bloodGroup, 4);
  const rhFactor = text(req.body?.rhFactor, 2);
  const component = text(req.body?.component, 32);
  const availableQuantity = Number(req.body?.availableQuantity);
  const reservedQuantity = Number(req.body?.reservedQuantity ?? 0);
  const reason = text(req.body?.reason, 60);
  const note = text(req.body?.note, 500);
  const publicVisible = req.body?.publicVisible !== false;
  if (!validGroups.has(bloodGroup) || !validRh.has(rhFactor) || !validComponents.has(component) || !Number.isInteger(availableQuantity) || availableQuantity < 0 || !Number.isInteger(reservedQuantity) || reservedQuantity < 0 || !reason) {
    return apiError(res, 400, "Enter a valid non-negative availability value, component, and adjustment reason.");
  }
  const current = db.prepare("SELECT id, available_quantity as availableQuantity FROM inventory_records WHERE facility_id = ? AND blood_group = ? AND rh_factor = ? AND component = ?").get(viewer.facilityId, bloodGroup, rhFactor, component) as { id: number; availableQuantity: number } | undefined;
  const updatedAt = new Date().toISOString();
  let recordId: number;
  const previous = current?.availableQuantity ?? 0;
  if (current) {
    db.prepare("UPDATE inventory_records SET available_quantity = ?, reserved_quantity = ?, public_visible = ?, last_updated = ?, updated_by_user_id = ?, last_reason = ? WHERE id = ?").run(availableQuantity, reservedQuantity, publicVisible ? 1 : 0, updatedAt, viewer.id, reason, current.id);
    recordId = current.id;
  } else {
    recordId = Number(db.prepare("INSERT INTO inventory_records (facility_id, blood_group, rh_factor, component, available_quantity, reserved_quantity, public_visible, last_updated, updated_by_user_id, last_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(viewer.facilityId, bloodGroup, rhFactor, component, availableQuantity, reservedQuantity, publicVisible ? 1 : 0, updatedAt, viewer.id, reason).lastInsertRowid);
  }
  db.prepare("INSERT INTO inventory_adjustments (inventory_record_id, editor_user_id, previous_quantity, new_quantity, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(recordId, viewer.id, previous, availableQuantity, reason, note || null, updatedAt);
  writeAudit(viewer.id, "inventory_updated", "inventory_record", recordId, { previous, availableQuantity, reason, publicVisible });
  res.status(201).json({ inventoryId: recordId });
});

app.get("/api/donor/profile", requireAuth, requireRoles("donor"), (req: AuthRequest, res) => {
  const row = db
    .prepare(
      `SELECT id, self_reported_group as selfReportedGroup, self_reported_rh as selfReportedRh, district, availability,
              outreach_consent as outreachConsent, contact_window as contactWindow, max_contacts_per_month as maxContactsPerMonth,
              pre_screening_result as preScreeningResult, policy_version as policyVersion, last_donation_date as lastDonationDate
       FROM donor_profiles WHERE user_id = ?`
    )
    .get(req.viewer!.id) as DonorProfile | undefined;
  if (!row) return apiError(res, 404, "Donor profile not found.");
  res.json({ profile: { ...row, outreachConsent: Boolean(row.outreachConsent) } });
});

app.patch("/api/donor/profile", requireAuth, requireRoles("donor"), (req: AuthRequest, res) => {
  const viewer = req.viewer!;
  const availability = text(req.body?.availability, 40);
  const outreachConsent = Boolean(req.body?.outreachConsent);
  const contactWindow = text(req.body?.contactWindow, 80);
  const maxContacts = Number(req.body?.maxContactsPerMonth);
  const allowedAvailability = new Set(["available", "unavailable", "temporarily_deferred", "opted_out"]);
  if (!allowedAvailability.has(availability) || !contactWindow || !Number.isInteger(maxContacts) || maxContacts < 1 || maxContacts > 4) {
    return apiError(res, 400, "Choose a valid availability state, contact window, and monthly contact limit.");
  }
  const storedAvailability = outreachConsent ? availability : "opted_out";
  db.prepare("UPDATE donor_profiles SET availability = ?, outreach_consent = ?, contact_window = ?, max_contacts_per_month = ?, updated_at = ? WHERE user_id = ?").run(storedAvailability, outreachConsent ? 1 : 0, contactWindow, maxContacts, new Date().toISOString(), viewer.id);
  writeAudit(viewer.id, "donor_preferences_updated", "donor_profile", viewer.id, { availability: storedAvailability, outreachConsent, maxContacts });
  res.json({ ok: true });
});

app.get("/api/donor/invitations", requireAuth, requireRoles("donor"), (req: AuthRequest, res) => {
  const invitations = db
    .prepare(
      `SELECT cr.id, cr.campaign_id as campaignId, br.reference as requestReference, f.name as facilityName, br.blood_group as bloodGroup, br.rh_factor as rhFactor,
              br.component, c.expires_at as expiresAt, cr.status, cr.sent_at as createdAt
       FROM campaign_recipients cr
       JOIN outreach_campaigns c ON c.id = cr.campaign_id
       JOIN blood_requests br ON br.id = c.request_id
       JOIN facilities f ON f.id = c.facility_id
       WHERE cr.donor_user_id = ? ORDER BY cr.sent_at DESC`
    )
    .all(req.viewer!.id) as unknown as Invitation[];
  res.json({ invitations });
});

app.post("/api/donor/invitations/:id/respond", requireAuth, requireRoles("donor"), (req: AuthRequest, res) => {
  const recipientId = positiveInteger(req.params.id);
  const viewer = req.viewer!;
  const response = text(req.body?.response, 16);
  const statusMap: Record<string, "interested" | "declined" | "stopped"> = { interested: "interested", declined: "declined", stopped: "stopped" };
  if (!recipientId || !statusMap[response]) return apiError(res, 400, "Choose an invitation response.");
  const recipient = db
    .prepare(
      `SELECT cr.id, cr.status, c.request_id as requestId
       FROM campaign_recipients cr JOIN outreach_campaigns c ON c.id = cr.campaign_id
       WHERE cr.id = ? AND cr.donor_user_id = ?`
    )
    .get(recipientId, viewer.id) as { id: number; status: string; requestId: number } | undefined;
  if (!recipient) return apiError(res, 404, "Invitation not found.");
  if (recipient.status !== "pending") return apiError(res, 409, "This invitation has already been answered.");
  const createdAt = new Date().toISOString();
  db.prepare("UPDATE campaign_recipients SET status = ?, responded_at = ? WHERE id = ?").run(statusMap[response], createdAt, recipientId);
  if (response === "stopped") {
    db.prepare("UPDATE donor_profiles SET outreach_consent = 0, availability = 'opted_out', updated_at = ? WHERE user_id = ?").run(createdAt, viewer.id);
  }
  const row = requestRow(recipient.requestId);
  if (response === "interested" && row && row.status === "donor_outreach_active") {
    db.prepare("UPDATE blood_requests SET status = 'donor_response_received', requester_visible_message = ?, updated_at = ? WHERE id = ?").run(statusMessage("donor_response_received"), createdAt, row.id);
    addRequestEvent(row.id, "donor_outreach_active", "donor_response_received", "A donor indicated interest. The facility must handle the next step.", viewer.id);
    notifyReviewers(row.facility_id, "Donor response received", "A donor indicated interest and needs coordinator follow-up.");
  }
  writeAudit(viewer.id, "outreach_response", "campaign_recipient", recipientId, { response });
  res.json({ ok: true });
});

app.get("/api/facility/dashboard", requireAuth, requireVerifiedFacility, (req: AuthRequest, res) => {
  const viewer = req.viewer!;
  const facility = db.prepare("SELECT id, name, district, verification_status as verificationStatus FROM facilities WHERE id = ?").get(viewer.facilityId) as FacilityDashboard["facility"];
  const requestCounts = db.prepare("SELECT status, COUNT(*) as count FROM blood_requests WHERE facility_id = ? GROUP BY status").all(viewer.facilityId) as FacilityDashboard["requestCounts"];
  const staleThreshold = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000).toISOString();
  const staleCount = (db.prepare("SELECT COUNT(*) as count FROM inventory_records WHERE facility_id = ? AND last_updated < ?").get(viewer.facilityId, staleThreshold) as { count: number }).count;
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const todayUpdates = (db.prepare("SELECT COUNT(*) as count FROM inventory_adjustments WHERE editor_user_id = ? AND created_at >= ?").get(viewer.id, dayStart.toISOString()) as { count: number }).count;
  res.json({ dashboard: { facility, requestCounts, staleCount, todayUpdates } satisfies FacilityDashboard });
});

app.get("/api/admin/overview", requireAuth, requireRoles("platform_admin"), (_req: AuthRequest, res) => {
  const rawFacilities = db
    .prepare(
      `SELECT f.id, f.name, f.district, f.verification_status as status, f.public_availability as publicAvailability,
              (SELECT COUNT(*) FROM blood_requests br WHERE br.facility_id = f.id AND br.status NOT IN ('fulfilled','unable_to_fulfill','rejected','cancelled','expired')) as openRequests
       FROM facilities f ORDER BY f.name`
    )
    .all() as unknown as Array<Omit<AdminOverview["facilities"][number], "publicAvailability"> & { publicAvailability: number }>;
  const facilities: AdminOverview["facilities"] = rawFacilities.map((facility) => ({ ...facility, publicAvailability: Boolean(facility.publicAvailability) }));
  const policies = db.prepare("SELECT id, name, version, effective_at as effectiveAt, summary FROM policy_versions ORDER BY effective_at DESC").all() as unknown as AdminOverview["policies"];
  const auditEvents = db
    .prepare(
      `SELECT a.id, a.action, a.entity_type as entityType, a.entity_id as entityId, COALESCE(u.name, 'System') as actorName, a.created_at as createdAt
       FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC, a.id DESC LIMIT 20`
    )
    .all() as unknown as AdminOverview["auditEvents"];
  res.json({ overview: { facilities, policies, auditEvents } satisfies AdminOverview });
});

app.get("/api/admin/audit", requireAuth, requireRoles("platform_admin"), (_req: AuthRequest, res) => {
  const events = db
    .prepare(
      `SELECT a.id, a.action, a.entity_type as entityType, a.entity_id as entityId, a.metadata, COALESCE(u.name, 'System') as actorName, a.created_at as createdAt
       FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC, a.id DESC LIMIT 100`
    )
    .all();
  res.json({ events });
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
  if (error instanceof multer.MulterError) return apiError(res, 400, "The upload was not accepted. Use one PDF/JPG/PNG file no larger than 5 MB.");
  console.error(error);
  apiError(res, 500, "Something went wrong. No request or outreach confirmation was made.");
});

app.listen(PORT, () => {
  console.log(`Raktakosh API running on http://localhost:${PORT}`);
});
