import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ApiError, api, toQuery } from "./api";
import { t } from "./i18n";
import type {
  AdminOverview,
  AvailabilityState,
  BloodRequest,
  CurrentUser,
  DonorProfile,
  FacilityDashboard as FacilityDashboardData,
  InventoryItem,
  Invitation,
  Locale,
  PublicAvailability,
  RequestStatus
} from "./types";

const groups = ["A", "B", "AB", "O"];
const components = ["Whole blood", "Packed red cells", "Platelets", "Plasma"];
const districts = ["Morang"];

const statusLabels: Record<RequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  needs_information: "Needs information",
  under_review: "Under review",
  verified: "Verified for coordination",
  inventory_located: "Inventory located",
  reservation_pending: "Reservation pending",
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

const allowedClientTransitions: Partial<Record<RequestStatus, RequestStatus[]>> = {
  submitted: ["under_review", "needs_information", "rejected", "cancelled"],
  needs_information: ["submitted", "under_review", "rejected", "cancelled"],
  under_review: ["needs_information", "verified", "rejected", "cancelled"],
  verified: ["inventory_located", "inventory_unavailable", "rejected", "cancelled"],
  inventory_located: ["reservation_pending", "fulfilled", "cancelled"],
  reservation_pending: ["fulfilled", "unable_to_fulfill", "cancelled"],
  inventory_unavailable: ["donor_outreach_active", "unable_to_fulfill", "cancelled"],
  donor_outreach_active: ["facility_follow_up", "unable_to_fulfill", "cancelled"],
  donor_response_received: ["facility_follow_up", "unable_to_fulfill", "cancelled"],
  facility_follow_up: ["fulfilled", "unable_to_fulfill", "cancelled"]
};

function formatDate(value: string, locale: Locale, withTime = true): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ne" ? "ne-NP" : "en-GB", {
    timeZone: "Asia/Kathmandu",
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {})
  }).format(parsed);
}

function statusClass(status: RequestStatus | AvailabilityState): string {
  return `status-${status.replaceAll("_", "-")}`;
}

function availabilityLabel(state: AvailabilityState): string {
  return {
    reported_available: "Reported available",
    limited: "Limited — confirm with facility",
    not_reported: "Not reported",
    stale: "Stale information"
  }[state];
}

function Logo(): ReactNode {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 44 52" focusable="false">
        <path d="M22 2C16 13 5 23 5 33.5A17 17 0 0 0 39 33.5C39 23 28 13 22 2Z" />
        <path className="brand-mark-cut" d="M13 34.5c4.4 4.4 12.6 5.8 18.2 0" />
      </svg>
    </span>
  );
}

function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`pill ${className}`}>{children}</span>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`paper-card ${className}`}>{children}</section>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <span className="empty-symbol" aria-hidden="true">+</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "success" }) {
  return <div className={`notice notice-${tone}`} role="status">{children}</div>;
}

function StatusPill({ status }: { status: RequestStatus }) {
  return <Pill className={`status-pill ${statusClass(status)}`}>{statusLabels[status]}</Pill>;
}

function AvailabilityPill({ state }: { state: AvailabilityState }) {
  return <Pill className={`availability-pill ${statusClass(state)}`}><span className="pulse-dot" />{availabilityLabel(state)}</Pill>;
}

function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [view, setView] = useState<"home" | "dashboard">("home");
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [availability, setAvailability] = useState<PublicAvailability[]>([]);
  const [searching, setSearching] = useState(true);
  const [searchFilters, setSearchFilters] = useState({ district: "Morang", bloodGroup: "", rhFactor: "+", component: "" });
  const [accessProfiles, setAccessProfiles] = useState<Array<{ key: string; label: string; description: string }>>([]);

  async function loadAvailability(filters = searchFilters) {
    setSearching(true);
    try {
      const payload = await api<{ results: PublicAvailability[] }>(`/api/public/availability${toQuery(filters)}`);
      setAvailability(payload.results);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Availability search could not be loaded.");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    void loadAvailability();
    void api<{ profiles: Array<{ key: string; label: string; description: string }> }>("/api/access-profiles").then((data) => setAccessProfiles(data.profiles));
    void api<{ user: CurrentUser }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => undefined);
  }, []);

  async function logout() {
    await api<void>("/api/auth/logout", { method: "POST" });
    setUser(null);
    setView("home");
    setNotice("You are signed out.");
  }

  function startRequest() {
    if (user && (user.role === "requester" || user.role === "donor")) {
      setView("dashboard");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setAuthOpen(true);
    }
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <button className="brand" onClick={() => setView("home")} aria-label="Raktakosh home">
          <Logo />
          <span><strong>Raktakosh</strong><small>रक्तकोष</small></span>
        </button>
        <nav aria-label="Primary navigation" className="desktop-nav">
          <button onClick={() => { setView("home"); window.setTimeout(() => document.getElementById("availability")?.scrollIntoView({ behavior: "smooth" }), 0); }}>{t(locale, "findAvailability")}</button>
          <button onClick={() => { setView("home"); window.setTimeout(() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" }), 0); }}>{t(locale, "howItWorks")}</button>
        </nav>
        <div className="header-actions">
          <button className="language-switch" onClick={() => setLocale(locale === "en" ? "ne" : "en")} aria-label="Change language">{t(locale, "language")}</button>
          {user ? (
            <>
              <button className="button button-quiet" onClick={() => setView("dashboard")}>{t(locale, "dashboard")}</button>
              <button className="button button-quiet" onClick={() => setAuthOpen(true)}>Switch workspace</button>
              <button className="button button-outline" onClick={() => void logout()}>{t(locale, "signOut")}</button>
            </>
          ) : (
            <button className="button button-ink" onClick={() => setAuthOpen(true)}>{t(locale, "signIn")}</button>
          )}
        </div>
      </header>

      {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

      <main id="main-content">
        {view === "home" ? (
          <Home
            locale={locale}
            filters={searchFilters}
            setFilters={setSearchFilters}
            results={availability}
            searching={searching}
            onSearch={() => void loadAvailability()}
            onRequest={startRequest}
            onExplore={() => setAuthOpen(true)}
          />
        ) : user ? (
          <Dashboard user={user} locale={locale} onMessage={setNotice} onReturnHome={() => setView("home")} />
        ) : null}
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><Logo /><span>Raktakosh <em>Blood Coordination Platform · Version 1.0</em></span></div>
        <p>Clinical decisions, blood matching, and inventory confirmation remain with the responsible facility.</p>
        <span>Asia/Kathmandu · Version 1.0</span>
      </footer>

      {authOpen && <AuthDialog profiles={accessProfiles} onClose={() => setAuthOpen(false)} onLoggedIn={(loggedIn) => { setUser(loggedIn); setAuthOpen(false); setView("dashboard"); setNotice(`${loggedIn.name}'s workspace is ready.`); }} />}
    </div>
  );
}

function Home({
  locale,
  filters,
  setFilters,
  results,
  searching,
  onSearch,
  onRequest,
  onExplore
}: {
  locale: Locale;
  filters: { district: string; bloodGroup: string; rhFactor: string; component: string };
  setFilters: (filters: { district: string; bloodGroup: string; rhFactor: string; component: string }) => void;
  results: PublicAvailability[];
  searching: boolean;
  onSearch: () => void;
  onRequest: () => void;
  onExplore: () => void;
}) {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-ink">
          <div className="hero-copy">
            <Pill className="version-pill"><span className="live-mark" /> MORANG NETWORK · VERSION 1.0</Pill>
            <h1 id="hero-title">{t(locale, "verifiedStep")}</h1>
            <p>{t(locale, "heroBody")}</p>
            <div className="hero-actions">
              <button className="button button-signal" onClick={() => document.getElementById("availability")?.scrollIntoView({ behavior: "smooth" })}>{t(locale, "findAvailability")} <span aria-hidden="true">↓</span></button>
              <button className="button button-ghost-light" onClick={onRequest}>{t(locale, "requestBlood")}</button>
            </div>
          </div>
          <div className="signal-board" aria-label="Raktakosh coordination status">
            <div className="signal-board-top"><span>RAKTA SIGNAL</span><span>01 / 03</span></div>
            <div className="signal-core"><span className="signal-number">03</span><span className="signal-label">verified<br />network facilities</span></div>
            <div className="signal-track"><span className="track-active" /><span /><span /></div>
            <p>Search first. Confirm directly with the responsible facility.</p>
          </div>
        </div>
        <div className="safety-strip"><span className="strip-icon">!</span><p>{t(locale, "noGuarantee")}</p><span className="strip-end">NPT</span></div>
      </section>

      <section id="availability" className="search-section section-wrap" aria-labelledby="availability-title">
        <div className="section-kicker">01 · PUBLIC DISCOVERY</div>
        <div className="section-heading split-heading">
          <div><h2 id="availability-title">Facility-reported, <em>not promised.</em></h2></div>
          <p>Search high-level availability by district and component. Your search never reveals donor, patient, document, or staff information.</p>
        </div>
        <Card className="search-panel">
          <form onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
            <div className="search-grid">
              <label><span>{t(locale, "district")}</span><select value={filters.district} onChange={(event) => setFilters({ ...filters, district: event.target.value })}>{districts.map((district) => <option key={district}>{district}</option>)}</select></label>
              <label><span>{t(locale, "bloodGroup")}</span><select value={filters.bloodGroup} onChange={(event) => setFilters({ ...filters, bloodGroup: event.target.value })}><option value="">Any group</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
              <label><span>Rh factor</span><select value={filters.rhFactor} onChange={(event) => setFilters({ ...filters, rhFactor: event.target.value })}><option value="">Any</option><option value="+">Positive (+)</option><option value="-">Negative (−)</option></select></label>
              <label><span>{t(locale, "component")}</span><select value={filters.component} onChange={(event) => setFilters({ ...filters, component: event.target.value })}><option value="">Any component</option>{components.map((component) => <option key={component}>{component}</option>)}</select></label>
              <button className="button button-signal search-submit" type="submit" disabled={searching}>{searching ? "Searching…" : t(locale, "search")}</button>
            </div>
          </form>
        </Card>

        <div className="results-bar" aria-live="polite"><span><b>{searching ? "…" : results.length}</b> facility records</span><span>Records older than 12 hours are visibly marked stale.</span></div>
        <div className="availability-grid">
          {!searching && results.map((item) => <AvailabilityCard key={`${item.facilityId}-${item.bloodGroup}-${item.rhFactor}-${item.component}`} item={item} locale={locale} />)}
          {!searching && results.length === 0 && <EmptyState title="No matching public records" body="Try another group or component, or contact a verified facility directly for the next safe step." />}
        </div>
        <div className="search-footnote"><span className="footnote-rule" /> <p>Raktakosh is a coordination layer. Final blood-service decisions, matching, and availability confirmation always belong to the responsible facility.</p> <button className="text-button" onClick={onRequest}>{t(locale, "requestPrivate")} →</button></div>
      </section>

      <section id="how-it-works" className="workflow-section" aria-labelledby="workflow-title">
        <div className="section-wrap">
          <div className="section-kicker light-kicker">02 · THE HANDOFF</div>
          <div className="section-heading workflow-heading"><h2 id="workflow-title">Built for the moment<br /><em>after a search.</em></h2><p>Each handoff is explicit, auditable, and owned by the right person.</p></div>
          <ol className="workflow-list">
            <li><span className="workflow-number">01</span><div><h3>Search the verified layer</h3><p>View public, timestamped facility availability without creating an account.</p></div></li>
            <li><span className="workflow-number">02</span><div><h3>Submit a private request</h3><p>A requester sends only the minimum information to the selected verified facility.</p></div></li>
            <li><span className="workflow-number">03</span><div><h3>Facility takes the next step</h3><p>Staff review, update the request, and use controlled donor outreach only after an inventory path is unavailable.</p></div></li>
          </ol>
        </div>
      </section>

      <section className="access-section section-wrap" aria-label="Platform access">
        <Card className="access-card"><div><Pill className="access-pill">ROLE-BASED ACCESS</Pill><h2>One platform. Every coordination workspace.</h2><p>Explore the requester, donor, facility, and administration workspaces through a consistent, role-aware experience.</p></div><button className="button button-ink" onClick={onExplore}>Explore workspaces <span aria-hidden="true">→</span></button></Card>
      </section>
    </>
  );
}

function AvailabilityCard({ item, locale }: { item: PublicAvailability; locale: Locale }) {
  return (
    <article className={`availability-card ${item.state === "stale" ? "is-stale" : ""}`}>
      <div className="availability-card-top"><span className="facility-type">{item.facilityType}</span><AvailabilityPill state={item.state} /></div>
      <h3>{item.facilityName}</h3>
      <p className="facility-location">{item.district} · {item.operatingHours}</p>
      <div className="blood-lockup"><strong>{item.bloodGroup}<sup>{item.rhFactor}</sup></strong><span>{item.component}</span></div>
      <div className="availability-card-bottom"><span>{t(locale, "lastUpdated")}<b>{formatDate(item.lastUpdated, locale)}</b></span><span className="contact-mark" title={item.contact}>Verified contact ↗</span></div>
    </article>
  );
}

function AuthDialog({ profiles, onClose, onLoggedIn }: { profiles: Array<{ key: string; label: string; description: string }>; onClose: () => void; onLoggedIn: (user: CurrentUser) => void }) {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  async function chooseProfile(profile: { key: string }) {
    setWorking(true); setError("");
    try {
      const result = await api<{ user: CurrentUser }>("/api/auth/access-profile", { method: "POST", body: JSON.stringify({ key: profile.key }) });
      onLoggedIn(result.user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in."); }
    finally { setWorking(false); }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" onClick={onClose} aria-label="Close sign in">×</button>
        <Pill className="access-pill">SECURE ROLE ACCESS</Pill>
        <h2 id="auth-title">Choose your workspace.</h2>
        <p>Each workspace presents the information and actions appropriate to its responsibility in the coordination process.</p>
        <div className="access-role-grid">{profiles.map((profile) => <button key={profile.key} className="access-role" onClick={() => void chooseProfile(profile)} disabled={working}><span>{profile.label}</span><small>{profile.description}</small><b>{working ? "Opening…" : "Open →"}</b></button>)}</div>
        {error && <Notice tone="warning">{error}</Notice>}
      </section>
    </div>
  );
}

function Dashboard({ user, locale, onMessage, onReturnHome }: { user: CurrentUser; locale: Locale; onMessage: (message: string) => void; onReturnHome: () => void }) {
  const title = { requester: "Your coordination desk", donor: "Your donor controls", inventory_manager: "Facility availability desk", reviewer: "Facility review queue", facility_admin: "Facility operations", platform_admin: "Platform governance desk" }[user.role];
  return (
    <section className="dashboard-shell section-wrap">
      <div className="dashboard-topline"><button className="back-link" onClick={onReturnHome}>← Public search</button><Pill className="role-pill">{user.role.replaceAll("_", " ")}</Pill></div>
      <div className="dashboard-heading"><div><div className="section-kicker">PRIVATE WORKSPACE</div><h1>{title}</h1><p>Signed in as {user.name}{user.facilityName ? ` · ${user.facilityName}` : ""}.</p></div><div className="user-stamp"><Logo /><span><b>{user.name.split(" ").map((part) => part[0]).join("")}</b><small>verified active session</small></span></div></div>
      <Notice>{user.role === "platform_admin" ? "Administrative actions are recorded in the audit trail and scoped to platform governance." : "Request status supports coordination. Blood matching, medical eligibility, and final availability confirmation remain facility responsibilities."}</Notice>
      {user.role === "requester" && <RequesterDashboard locale={locale} onMessage={onMessage} />}
      {user.role === "donor" && <DonorDashboard locale={locale} onMessage={onMessage} />}
      {(user.role === "inventory_manager" || user.role === "reviewer" || user.role === "facility_admin") && <FacilityWorkspace user={user} locale={locale} onMessage={onMessage} />}
      {user.role === "platform_admin" && <AdminDashboard locale={locale} onMessage={onMessage} />}
    </section>
  );
}

function RequesterDashboard({ locale, onMessage }: { locale: Locale; onMessage: (message: string) => void }) {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [facilities, setFacilities] = useState<Array<{ id: number; name: string; district: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [document, setDocument] = useState<File | null>(null);
  const clientToken = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const [form, setForm] = useState({ facilityId: "", patientInitials: "", relationship: "Family member", bloodGroup: "", rhFactor: "+", component: "Packed red cells", quantity: "1", urgency: "Urgent", district: "Morang", neededBy: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) });

  async function load() {
    setLoading(true);
    try {
      const [requestData, facilityData] = await Promise.all([
        api<{ requests: BloodRequest[] }>("/api/requests"),
        api<{ facilities: Array<{ id: number; name: string; district: string }> }>("/api/public/facilities")
      ]);
      setRequests(requestData.requests); setFacilities(facilityData.facilities);
      setForm((current) => current.facilityId ? current : { ...current, facilityId: String(facilityData.facilities[0]?.id ?? "") });
    } catch (error) { onMessage(error instanceof Error ? error.message : "Could not load your requests."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setWorking(true);
    try {
      const result = await api<{ request: BloodRequest }>("/api/requests", { method: "POST", body: JSON.stringify({ ...form, facilityId: Number(form.facilityId), quantity: Number(form.quantity), neededBy: new Date(form.neededBy).toISOString(), clientToken: clientToken.current }) });
      if (document) {
        const body = new FormData(); body.append("document", document);
        await api(`/api/requests/${result.request.id}/document`, { method: "POST", body });
      }
      onMessage(`Request ${result.request.reference} submitted. A facility must review it before any next step.`);
      clientToken.current = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      setDocument(null); setForm((current) => ({ ...current, patientInitials: "", bloodGroup: "", quantity: "1", neededBy: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) }));
      await load();
    } catch (error) { onMessage(error instanceof Error ? error.message : "Your request could not be submitted."); }
    finally { setWorking(false); }
  }

  return (
    <div className="dashboard-grid requester-grid">
      <Card className="request-form-card"><div className="card-eyebrow">NEW COORDINATION REQUEST</div><h2>Share the minimum needed for a facility review.</h2><p className="card-intro">This creates a private request—not a reservation, blood match, or clinical approval.</p>
        <form className="form-grid" onSubmit={submit}>
          <label className="full-field"><span>Preferred verified facility</span><select value={form.facilityId} onChange={(event) => setForm({ ...form, facilityId: event.target.value })} required><option value="">Choose a facility</option>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name} · {facility.district}</option>)}</select></label>
          <label><span>Patient initials</span><input value={form.patientInitials} onChange={(event) => setForm({ ...form, patientInitials: event.target.value })} placeholder="e.g. A.R." maxLength={32} required /></label>
          <label><span>Relationship</span><select value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })}><option>Family member</option><option>Guardian</option><option>Self</option><option>Hospital staff</option><option>Other</option></select></label>
          <label><span>Requested group</span><select value={form.bloodGroup} onChange={(event) => setForm({ ...form, bloodGroup: event.target.value })} required><option value="">Choose</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
          <label><span>Rh factor</span><select value={form.rhFactor} onChange={(event) => setForm({ ...form, rhFactor: event.target.value })}><option value="+">Positive (+)</option><option value="-">Negative (−)</option></select></label>
          <label><span>Component</span><select value={form.component} onChange={(event) => setForm({ ...form, component: event.target.value })}>{components.map((component) => <option key={component}>{component}</option>)}</select></label>
          <label><span>Quantity requested</span><input type="number" min="1" max="20" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></label>
          <label><span>Operational urgency</span><select value={form.urgency} onChange={(event) => setForm({ ...form, urgency: event.target.value })}><option>Routine</option><option>Urgent</option><option>Critical</option></select></label>
          <label><span>Needed by (NPT)</span><input type="datetime-local" value={form.neededBy} onChange={(event) => setForm({ ...form, neededBy: event.target.value })} required /></label>
          <label className="full-field file-field"><span>Supporting document <i>optional when required by the facility</i></span><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setDocument(event.target.files?.[0] ?? null)} /><small>PDF, JPG, or PNG up to 5 MB. Files are available only to authorized reviewers while validation is pending.</small></label>
          <div className="form-action full-field"><button className="button button-signal" type="submit" disabled={working}>{working ? "Submitting…" : "Submit for facility review →"}</button></div>
        </form>
      </Card>
      <Card className="request-list-card"><div className="card-eyebrow">YOUR REQUESTS</div><h2>Follow the documented handoff.</h2>{loading ? <div className="loader">Loading private requests…</div> : requests.length ? <div className="request-stack">{requests.map((request) => <RequestCard key={request.id} request={request} locale={locale} />)}</div> : <EmptyState title="No private requests yet" body="Submit one when a verified facility needs to coordinate a request." />}</Card>
    </div>
  );
}

function RequestCard({ request, locale, staff = false, controls }: { request: BloodRequest; locale: Locale; staff?: boolean; controls?: ReactNode }) {
  return (
    <article className="request-card">
      <div className="request-card-top"><div><span className="reference">{request.reference}</span><h3>{request.bloodGroup}<sup>{request.rhFactor}</sup> · {request.component}</h3></div><StatusPill status={request.status} /></div>
      <div className="request-meta"><span>{request.quantity} requested · {request.urgency}</span><span>Needed {formatDate(request.neededBy, locale)}</span></div>
      <p className="request-message">{request.requesterVisibleMessage || "A facility needs to add the next safe update."}</p>
      {request.documents?.length ? <div className="document-row"><span>Supporting documents</span>{request.documents.map((document) => <Pill key={document.id} className="doc-pill">{document.originalName} · {document.scanStatus.replaceAll("_", " ")}</Pill>)}</div> : null}
      <StatusTimeline events={request.events} locale={locale} />
      {staff && request.internalNotes && <div className="internal-notes"><strong>Internal notes</strong>{request.internalNotes.length ? request.internalNotes.map((note) => <p key={note.id}><b>{note.authorName}</b> · {note.body}</p>) : <p>No internal notes yet.</p>}</div>}
      {controls && <div className="request-controls">{controls}</div>}
    </article>
  );
}

function StatusTimeline({ events, locale }: { events: BloodRequest["events"]; locale: Locale }) {
  return <ol className="status-timeline">{events.map((event) => <li key={event.id}><span className="timeline-node" aria-hidden="true" /><div><b>{statusLabels[event.toStatus]}</b><p>{event.message}</p><small>{event.actorName} · {formatDate(event.createdAt, locale)}</small></div></li>)}</ol>;
}

function DonorDashboard({ locale, onMessage }: { locale: Locale; onMessage: (message: string) => void }) {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      const [profileData, invitationData] = await Promise.all([api<{ profile: DonorProfile }>("/api/donor/profile"), api<{ invitations: Invitation[] }>("/api/donor/invitations")]);
      setProfile(profileData.profile); setInvitations(invitationData.invitations);
    } catch (error) { onMessage(error instanceof Error ? error.message : "Could not load donor controls."); }
  }
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!profile) return; setSaving(true);
    try { await api("/api/donor/profile", { method: "PATCH", body: JSON.stringify({ availability: profile.availability, outreachConsent: profile.outreachConsent, contactWindow: profile.contactWindow, maxContactsPerMonth: profile.maxContactsPerMonth }) }); onMessage("Your outreach preferences are saved. Facility staff make final donation decisions."); await load(); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Preferences could not be saved."); }
    finally { setSaving(false); }
  }
  async function respond(id: number, response: "interested" | "declined" | "stopped") {
    try { await api(`/api/donor/invitations/${id}/respond`, { method: "POST", body: JSON.stringify({ response }) }); onMessage(response === "stopped" ? "Future outreach is now stopped." : "Your response was shared with the facility coordinator."); await load(); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Response could not be saved."); }
  }
  if (!profile) return <div className="loader">Loading donor controls…</div>;
  return <div className="dashboard-grid donor-grid">
    <Card className="donor-profile-card"><div className="card-eyebrow">YOUR CONSENT & AVAILABILITY</div><h2>Stay in control of when you are contacted.</h2><div className="donor-blood"><span>{profile.selfReportedGroup}<sup>{profile.selfReportedRh}</sup></span><p>Self-reported blood group<br /><small>Facility verification, if needed, happens separately.</small></p></div>
      <Notice>{profile.preScreeningResult}</Notice>
      <div className="form-grid donor-form"><label><span>Availability</span><select value={profile.availability} disabled={!profile.outreachConsent} onChange={(event) => setProfile({ ...profile, availability: event.target.value as DonorProfile["availability"] })}><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="temporarily_deferred">Temporarily deferred</option><option value="opted_out">Pause outreach</option></select></label><label><span>Preferred contact window</span><input value={profile.contactWindow} onChange={(event) => setProfile({ ...profile, contactWindow: event.target.value })} /></label><label><span>Maximum contact invitations / month</span><select value={profile.maxContactsPerMonth} onChange={(event) => setProfile({ ...profile, maxContactsPerMonth: Number(event.target.value) })}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
      <label className="consent-toggle"><input type="checkbox" checked={profile.outreachConsent} onChange={(event) => setProfile({ ...profile, outreachConsent: event.target.checked, availability: event.target.checked ? (profile.availability === "opted_out" ? "available" : profile.availability) : "opted_out" })} /><span><b>I choose to receive controlled emergency outreach.</b><small>This is optional. Opting out stops future campaigns immediately.</small></span></label>
      <div className="form-action"><button className="button button-signal" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save controls"}</button></div>
    </Card>
    <Card className="invitation-card"><div className="card-eyebrow">PRIVATE INVITATIONS</div><h2>A facility can ask—not expose.</h2><p className="card-intro">Invitations do not reveal the patient’s full identity, document, or requester contact details.</p>{invitations.length ? <div className="invitation-stack">{invitations.map((invite) => <article className="invite" key={invite.id}><div><Pill className={`invite-status ${invite.status}`}>{invite.status}</Pill><h3>{invite.bloodGroup}<sup>{invite.rhFactor}</sup> · {invite.component}</h3><p>{invite.facilityName} · expires {formatDate(invite.expiresAt, locale)}</p></div>{invite.status === "pending" && <div className="invite-actions"><button className="button button-ink" onClick={() => void respond(invite.id, "interested")}>I can be contacted</button><button className="button button-outline" onClick={() => void respond(invite.id, "declined")}>Not available</button><button className="text-button danger-text" onClick={() => void respond(invite.id, "stopped")}>Stop outreach</button></div>}</article>)}</div> : <EmptyState title="No active invitations" body="When you opt in and are available, a verified facility may send a limited private invitation." />}</Card>
  </div>;
}

function FacilityWorkspace({ user, locale, onMessage }: { user: CurrentUser; locale: Locale; onMessage: (message: string) => void }) {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<FacilityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<Record<number, { status: string; message: string; note: string }>>({});
  const [inventoryForm, setInventoryForm] = useState({ bloodGroup: "O", rhFactor: "+", component: "Packed red cells", availableQuantity: "0", reservedQuantity: "0", reason: "routine_count", note: "", publicVisible: true });
  const canEditInventory = user.role === "inventory_manager" || user.role === "facility_admin";
  const canReview = user.role === "reviewer" || user.role === "facility_admin";
  async function load() {
    setLoading(true);
    try {
      const [requestData, inventoryData, dashboardData] = await Promise.all([api<{ requests: BloodRequest[] }>("/api/requests"), api<{ inventory: InventoryItem[] }>("/api/inventory"), api<{ dashboard: FacilityDashboardData }>("/api/facility/dashboard")]);
      setRequests(requestData.requests); setInventory(inventoryData.inventory); setSummary(dashboardData.dashboard);
    } catch (error) { onMessage(error instanceof Error ? error.message : "Could not load facility workspace."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const updateChange = (id: number, key: "status" | "message" | "note", value: string) => setChanges((current) => ({ ...current, [id]: { status: current[id]?.status ?? "", message: current[id]?.message ?? "", note: current[id]?.note ?? "", [key]: value } }));
  async function updateStatus(request: BloodRequest) {
    const change = changes[request.id]; if (!change?.status) return;
    try { await api(`/api/requests/${request.id}/status`, { method: "POST", body: JSON.stringify({ status: change.status, message: change.message }) }); onMessage(`Request ${request.reference} updated.`); await load(); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Status update could not be saved."); }
  }
  async function addNote(request: BloodRequest) {
    const note = changes[request.id]?.note; if (!note) return;
    try { await api(`/api/requests/${request.id}/notes`, { method: "POST", body: JSON.stringify({ body: note }) }); onMessage("Internal note saved."); setChanges((current) => ({ ...current, [request.id]: { ...current[request.id], note: "" } })); await load(); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Internal note could not be saved."); }
  }
  async function startOutreach(request: BloodRequest) {
    try { const result = await api<{ campaign: { candidateCount: number } }>(`/api/requests/${request.id}/outreach`, { method: "POST" }); onMessage(`Controlled outreach sent to ${result.campaign.candidateCount} eligible contact(s).`); await load(); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Outreach was not started."); }
  }
  async function saveInventory(event: FormEvent) {
    event.preventDefault();
    try { await api("/api/inventory", { method: "POST", body: JSON.stringify({ ...inventoryForm, availableQuantity: Number(inventoryForm.availableQuantity), reservedQuantity: Number(inventoryForm.reservedQuantity) }) }); onMessage("Availability recorded with an audit adjustment."); await load(); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Inventory update could not be saved."); }
  }
  return <div className="facility-workspace">
    {summary && <div className="facility-stats"><article><small>FACILITY</small><b>{summary.facility.name}</b><span>{summary.facility.district} · {summary.facility.verificationStatus}</span></article><article><small>OPEN REQUESTS</small><b>{summary.requestCounts.reduce((total, item) => total + item.count, 0)}</b><span>across documented states</span></article><article className={summary.staleCount ? "attention-stat" : ""}><small>STALE RECORDS</small><b>{summary.staleCount}</b><span>need an inventory check</span></article><article><small>YOUR UPDATES</small><b>{summary.todayUpdates}</b><span>recorded today</span></article></div>}
    <div className="facility-grid">
      <Card className="queue-card"><div className="card-eyebrow">REQUEST QUEUE</div><h2>Move only through documented states.</h2>{loading ? <div className="loader">Loading facility queue…</div> : <div className="request-stack">{requests.map((request) => <RequestCard key={request.id} request={request} locale={locale} staff controls={canReview ? <div className="review-controls"><div className="transition-row"><select value={changes[request.id]?.status ?? ""} onChange={(event) => updateChange(request.id, "status", event.target.value)} aria-label={`New status for ${request.reference}`}><option value="">Choose permitted next state</option>{(allowedClientTransitions[request.status] ?? []).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><input value={changes[request.id]?.message ?? ""} onChange={(event) => updateChange(request.id, "message", event.target.value)} placeholder="Requester-safe update (required for outcomes)" /><button className="button button-ink" onClick={() => void updateStatus(request)}>Update</button></div><div className="note-row"><input value={changes[request.id]?.note ?? ""} onChange={(event) => updateChange(request.id, "note", event.target.value)} placeholder="Internal note — never shown to requester" /><button className="button button-outline" onClick={() => void addNote(request)}>Add note</button>{request.status === "inventory_unavailable" && <button className="button button-signal" onClick={() => void startOutreach(request)}>Start donor outreach</button>}</div></div> : null} />)}</div>}</Card>
      <aside className="inventory-side">
        <Card><div className="card-eyebrow">AVAILABILITY SUMMARY</div><h2>Keep the public signal honest.</h2><div className="inventory-list">{inventory.map((item) => <div className="inventory-row" key={item.id}><div><b>{item.bloodGroup}<sup>{item.rhFactor}</sup></b><span>{item.component}</span></div><div><strong>{item.availableQuantity}</strong><small>reported · {formatDate(item.lastUpdated, locale, false)}</small></div></div>)}</div></Card>
        {canEditInventory && <Card className="inventory-editor"><div className="card-eyebrow">LOG AN ADJUSTMENT</div><h2>Record availability with a reason.</h2><form className="form-grid compact-form" onSubmit={saveInventory}><label><span>Group</span><select value={inventoryForm.bloodGroup} onChange={(event) => setInventoryForm({ ...inventoryForm, bloodGroup: event.target.value })}>{groups.map((group) => <option key={group}>{group}</option>)}</select></label><label><span>Rh</span><select value={inventoryForm.rhFactor} onChange={(event) => setInventoryForm({ ...inventoryForm, rhFactor: event.target.value })}><option>+</option><option>-</option></select></label><label className="full-field"><span>Component</span><select value={inventoryForm.component} onChange={(event) => setInventoryForm({ ...inventoryForm, component: event.target.value })}>{components.map((component) => <option key={component}>{component}</option>)}</select></label><label><span>Reported availability</span><input type="number" min="0" value={inventoryForm.availableQuantity} onChange={(event) => setInventoryForm({ ...inventoryForm, availableQuantity: event.target.value })} /></label><label><span>Reserved</span><input type="number" min="0" value={inventoryForm.reservedQuantity} onChange={(event) => setInventoryForm({ ...inventoryForm, reservedQuantity: event.target.value })} /></label><label className="full-field"><span>Adjustment reason</span><select value={inventoryForm.reason} onChange={(event) => setInventoryForm({ ...inventoryForm, reason: event.target.value })}><option value="routine_count">Routine count</option><option value="request_reservation">Request reservation</option><option value="issue_correction">Issue / correction</option><option value="expiry">Expiry</option><option value="reconciliation">Reconciliation</option><option value="other">Other</option></select></label><label className="full-field"><span>Optional note</span><input value={inventoryForm.note} onChange={(event) => setInventoryForm({ ...inventoryForm, note: event.target.value })} /></label><label className="checkbox-line full-field"><input type="checkbox" checked={inventoryForm.publicVisible} onChange={(event) => setInventoryForm({ ...inventoryForm, publicVisible: event.target.checked })} /> Allow the qualified public availability state to be shown</label><button className="button button-signal full-field" type="submit">Record adjustment</button></form></Card>}
      </aside>
    </div>
  </div>;
}

function AdminDashboard({ locale, onMessage }: { locale: Locale; onMessage: (message: string) => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  useEffect(() => { void api<{ overview: AdminOverview }>("/api/admin/overview").then((data) => setOverview(data.overview)).catch((error) => onMessage(error instanceof Error ? error.message : "Could not load governance data.")); }, []);
  if (!overview) return <div className="loader">Loading governance overview…</div>;
  return <div className="admin-grid">
    <Card className="admin-facilities"><div className="card-eyebrow">FACILITY VERIFICATION</div><h2>Public visibility begins with a verified operating partner.</h2><div className="facility-table"><div className="table-row table-head"><span>Facility</span><span>Status</span><span>Public</span><span>Open requests</span></div>{overview.facilities.map((facility) => <div className="table-row" key={facility.id}><div><b>{facility.name}</b><small>{facility.district}</small></div><Pill className={`verification ${facility.status}`}>{facility.status}</Pill><span>{facility.publicAvailability ? "Enabled" : "Hidden"}</span><strong>{facility.openRequests}</strong></div>)}</div></Card>
    <Card className="admin-policies"><div className="card-eyebrow">PUBLISHED POLICY</div><h2>Visible rules; no hidden medical automation.</h2>{overview.policies.map((policy) => <article className="policy-row" key={policy.id}><div><Pill>{policy.version}</Pill><h3>{policy.name}</h3></div><p>{policy.summary}</p><small>Effective {formatDate(policy.effectiveAt, locale, false)}</small></article>)}</Card>
    <Card className="audit-card"><div className="card-eyebrow">AUDIT FEED</div><h2>High-signal operating history.</h2><ol className="audit-feed">{overview.auditEvents.map((event) => <li key={event.id}><span className="audit-node" /><div><b>{event.action.replaceAll("_", " ")}</b><p>{event.actorName} · {event.entityType} #{event.entityId}</p><small>{formatDate(event.createdAt, locale)}</small></div></li>)}</ol></Card>
  </div>;
}

export default App;
