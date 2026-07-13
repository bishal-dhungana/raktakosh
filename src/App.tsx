import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ApiError, api, toQuery } from "./api";
import { DONOR_SCREENING_QUESTIONS, type DonorScreeningAnswer } from "./donor-screening";
import { t } from "./i18n";
import { NEPAL_DISTRICTS } from "./nepal-districts";
import type {
  AdminOverview,
  AvailabilityState,
  BloodRequest,
  CurrentUser,
  DonorProfile,
  DonorScreening,
  FacilityOperations,
  InventoryItem,
  Invitation,
  Locale,
  PublicAvailability,
  RequestStatus
} from "./types";

const groups = ["A", "B", "AB", "O"];
const components = ["Whole blood", "Packed red cells", "Platelets", "Plasma"];

const statusLabels: Record<RequestStatus, string> = {
  draft: "Draft",
  document_pending_review: "Document pending review",
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

const roleLabels = {
  requester: "Requester",
  donor: "Donor",
  inventory_manager: "Blood Bank Inventory Manager",
  reviewer: "Blood Bank Reviewer",
  facility_admin: "Blood Bank Admin",
  platform_admin: "Platform Administrator"
} satisfies Record<CurrentUser["role"], string>;

const requestOperationalActions: Partial<Record<RequestStatus, { status: RequestStatus; label: string }>> = {
  submitted: { status: "under_review", label: "Start review" },
  needs_information: { status: "under_review", label: "Resume review" },
  under_review: { status: "verified", label: "Verify for coordination" },
  verified: { status: "inventory_located", label: "Record blood located" },
  inventory_located: { status: "reservation_pending", label: "Record reservation" },
  reservation_pending: { status: "fulfilled", label: "Record fulfillment" },
  donor_response_received: { status: "facility_follow_up", label: "Start facility follow-up" },
  facility_follow_up: { status: "fulfilled", label: "Record fulfillment" }
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

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
  const [bloodBankAuthOpen, setBloodBankAuthOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [availability, setAvailability] = useState<PublicAvailability[]>([]);
  const [searching, setSearching] = useState(true);
  const [searchFilters, setSearchFilters] = useState({ district: "", bloodGroup: "", rhFactor: "+", component: "" });

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
    void api<{ user: CurrentUser | null }>("/api/auth/me")
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
              <button className="button button-quiet" onClick={() => setAuthOpen(true)}>Account</button>
              <button className="button button-outline" onClick={() => void logout()}>{t(locale, "signOut")}</button>
            </>
          ) : (
            <>
              <button className="button button-quiet" onClick={() => setBloodBankAuthOpen(true)}>Blood Bank portal</button>
              <button className="button button-ink" onClick={() => setAuthOpen(true)}>{t(locale, "signIn")}</button>
            </>
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
          user.passwordChangeRequired ? <section className="dashboard-shell section-wrap"><Card><div className="card-eyebrow">SECURITY REQUIRED</div><h1>Change your temporary password.</h1><p className="card-intro">Your Blood Bank account is protected until you choose a new password.</p></Card></section> : <Dashboard user={user} locale={locale} onMessage={setNotice} onReturnHome={() => setView("home")} />
        ) : null}
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><Logo /><span>Raktakosh <em>Blood Coordination Platform · Version 1.0</em></span></div>
        <p>Clinical decisions, blood matching, and inventory confirmation remain with the responsible facility.</p>
        <span>Asia/Kathmandu · Version 1.0</span>
      </footer>

      {authOpen && <AuthDialog locale={locale} initialAudience="personal" onOpenBloodBankLogin={() => { setAuthOpen(false); setBloodBankAuthOpen(true); }} onClose={() => setAuthOpen(false)} onLoggedIn={(loggedIn) => { setUser(loggedIn); setAuthOpen(false); setView("dashboard"); setNotice(`${loggedIn.name}'s workspace is ready.`); }} />}
      {bloodBankAuthOpen && <AuthDialog locale={locale} initialAudience="blood_bank" onClose={() => setBloodBankAuthOpen(false)} onLoggedIn={(loggedIn) => { setUser(loggedIn); setBloodBankAuthOpen(false); setView("dashboard"); setNotice(`${loggedIn.name}'s Blood Bank Dashboard is ready.`); }} />}
      {user?.passwordChangeRequired && <PasswordChangeDialog onChanged={(updatedUser) => { setUser(updatedUser); setView("dashboard"); setNotice("Password changed. Your Blood Bank Dashboard is now unlocked."); }} />}
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
            <Pill className="version-pill"><span className="live-mark" /> NEPAL NETWORK · VERSION 1.0</Pill>
            <h1 id="hero-title">{t(locale, "verifiedStep")}</h1>
            <p>{t(locale, "heroBody")}</p>
            <div className="hero-actions">
              <button className="button button-signal" onClick={() => document.getElementById("availability")?.scrollIntoView({ behavior: "smooth" })}>{t(locale, "findAvailability")} <span aria-hidden="true">↓</span></button>
              <button className="button button-ghost-light" onClick={onRequest}>{t(locale, "requestBlood")}</button>
            </div>
          </div>
          <div className="coordination-card" aria-label={t(locale, "verifiedCoordination")}>
            <div className="coordination-card-top"><span>{t(locale, "verifiedCoordination")}</span><span>01—03</span></div>
            <ol>
              <li><b>01</b><span>{t(locale, "coordinationStepOne")}</span></li>
              <li><b>02</b><span>{t(locale, "coordinationStepTwo")}</span></li>
              <li><b>03</b><span>{t(locale, "coordinationStepThree")}</span></li>
            </ol>
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
              <label><span>{t(locale, "district")}</span><select value={filters.district} onChange={(event) => setFilters({ ...filters, district: event.target.value })}><option value="">{t(locale, "allDistricts")}</option>{NEPAL_DISTRICTS.map((district) => <option key={district}>{district}</option>)}</select></label>
              <label><span>{t(locale, "bloodGroup")}</span><select value={filters.bloodGroup} onChange={(event) => setFilters({ ...filters, bloodGroup: event.target.value })}><option value="">Any group</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
              <label><span>Rh factor</span><select value={filters.rhFactor} onChange={(event) => setFilters({ ...filters, rhFactor: event.target.value })}><option value="">Any</option><option value="+">Positive (+)</option><option value="-">Negative (−)</option></select></label>
              <label><span>{t(locale, "component")}</span><select value={filters.component} onChange={(event) => setFilters({ ...filters, component: event.target.value })}><option value="">Any component</option>{components.map((component) => <option key={component}>{component}</option>)}</select></label>
              <button className="button button-signal search-submit" type="submit" disabled={searching}>{searching ? "Searching…" : t(locale, "search")}</button>
            </div>
          </form>
        </Card>

        <div className="results-bar" aria-live="polite"><span><b>{searching ? "…" : results.length}</b> verified facility record{searching || results.length === 1 ? "" : "s"}</span><span>Records older than 12 hours are visibly marked stale.</span></div>
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

      <section className="education-section section-wrap" aria-labelledby="education-title">
        <div className="section-kicker">03 · {t(locale, "educationKicker")}</div>
        <div className="section-heading split-heading"><div><h2 id="education-title">{t(locale, "educationTitle")}</h2></div><p>Raktakosh shares general education so you can understand the coordination process. A responsible blood-service facility makes all clinical decisions.</p></div>
        <div className="education-grid">
          <article><span>01</span><h3>{t(locale, "whatBloodTitle")}</h3><p>{t(locale, "whatBloodBody")}</p></article>
          <article><span>02</span><h3>{t(locale, "whyDonateTitle")}</h3><p>{t(locale, "whyDonateBody")}</p></article>
          <article><span>03</span><h3>{t(locale, "donationSafetyTitle")}</h3><p>{t(locale, "donationSafetyBody")}</p></article>
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

function AuthDialog({ locale, initialAudience, onOpenBloodBankLogin, onClose, onLoggedIn }: { locale: Locale; initialAudience: "personal" | "blood_bank"; onOpenBloodBankLogin?: () => void; onClose: () => void; onLoggedIn: (user: CurrentUser) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const isBloodBankStaff = initialAudience === "blood_bank";
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "requester", bloodGroup: "", rhFactor: "+", district: "", dateOfBirth: "", outreachConsent: false });
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [mfaStage, setMfaStage] = useState<"credentials" | "enroll" | "verify">("credentials");
  const [mfaChallengeToken, setMfaChallengeToken] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  function finish(result: { user?: CurrentUser }) {
    if (!result.user) throw new Error("Secure sign-in could not be completed.");
    onLoggedIn(result.user);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true); setError("");
    try {
      const endpoint = isBloodBankStaff ? "/api/auth/blood-bank/login" : mode === "signin" ? "/api/auth/login" : "/api/auth/register";
      const payload = mode === "signin" ? { email: form.email, password: form.password } : form;
      const result = await api<{ user?: CurrentUser; mfaRequired?: boolean; mfaEnrollmentRequired?: boolean; mfaChallengeToken?: string }>(endpoint, { method: "POST", body: JSON.stringify(payload) });
      if (result.mfaRequired && result.mfaChallengeToken) {
        setMfaChallengeToken(result.mfaChallengeToken); setMfaStage("verify"); return;
      }
      if (result.mfaEnrollmentRequired && result.mfaChallengeToken) {
        setMfaChallengeToken(result.mfaChallengeToken);
        const setup = await api<{ secret: string; otpauthUri: string }>("/api/auth/mfa/enroll/start", { method: "POST", body: JSON.stringify({ challengeToken: result.mfaChallengeToken }) });
        setMfaSecret(setup.secret);
        setMfaQrCode(await QRCode.toDataURL(setup.otpauthUri, { width: 220, margin: 1, errorCorrectionLevel: "M" }));
        setMfaStage("enroll"); return;
      }
      finish(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in."); }
    finally { setWorking(false); }
  }

  async function verifyMfa(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError("");
    try {
      const endpoint = mfaStage === "enroll" ? "/api/auth/mfa/enroll/confirm" : "/api/auth/mfa/verify";
      const result = await api<{ user?: CurrentUser }>(endpoint, { method: "POST", body: JSON.stringify({ challengeToken: mfaChallengeToken, code: mfaCode }) });
      finish(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The authenticator code could not be verified."); }
    finally { setWorking(false); }
  }

  if (mfaStage !== "credentials") {
    const enrolling = mfaStage === "enroll";
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="auth-dialog mfa-dialog" role="dialog" aria-modal="true" aria-labelledby="mfa-title" onMouseDown={(event) => event.stopPropagation()}>
          <button className="dialog-close" onClick={onClose} aria-label="Close sign in">×</button>
          <Pill className="access-pill">MULTI-FACTOR SECURITY</Pill>
          <h2 id="mfa-title">{enrolling ? "Protect this staff account." : "Confirm your secure sign-in."}</h2>
          {enrolling ? <><p>Scan this code with Google Authenticator, Microsoft Authenticator, Authy, or another TOTP authenticator. Save the key only in your authenticator; it is shown once.</p><div className="mfa-setup"><img src={mfaQrCode} alt="Authenticator setup QR code" /><div><span>Manual setup key</span><code>{mfaSecret}</code><small>Time-based · 6 digits · 30 seconds</small></div></div></> : <p>Open your authenticator app and enter the current six-digit code to continue.</p>}
          <form className="auth-form mfa-form" onSubmit={verifyMfa}>
            <label><span>Authenticator code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))} required autoFocus /></label>
            {error && <Notice tone="warning">{error}</Notice>}
            <button className="button button-signal" type="submit" disabled={working}>{working ? "Verifying…" : enrolling ? "Enable multi-factor security" : "Verify and sign in"}</button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" onClick={onClose} aria-label="Close sign in">×</button>
        <Pill className="access-pill">{isBloodBankStaff ? "BLOOD BANK STAFF ACCESS" : "SECURE ACCOUNT ACCESS"}</Pill>
        <h2 id="auth-title">{isBloodBankStaff ? "Blood Bank portal." : mode === "signin" ? "Welcome back." : "Create your account."}</h2>
        <p>{isBloodBankStaff ? "Enter the email and temporary password issued by your Super Admin. You will set your own password after multi-factor verification." : mode === "signin" ? "Sign in to continue to your private coordination workspace." : "Requester and donor accounts can be created here. Blood Bank staff accounts are provisioned by an authorized administrator."}</p>
        {!isBloodBankStaff && <div className="auth-mode-switch" role="tablist" aria-label="Personal account access mode"><button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setError(""); }} role="tab" aria-selected={mode === "signin"}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }} role="tab" aria-selected={mode === "register"}>Create account</button></div>}
        <form className="auth-form account-form" onSubmit={submit}>
          {!isBloodBankStaff && mode === "register" && <><label><span>Full name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoComplete="name" /></label><label><span>Phone number</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+97798…" required autoComplete="tel" /></label></>}
          <label><span>Email address</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required autoComplete="email" /></label>
          <label><span>Password</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={!isBloodBankStaff && mode === "register" ? 12 : undefined} required autoComplete={isBloodBankStaff || mode === "signin" ? "current-password" : "new-password"} /></label>
          {!isBloodBankStaff && mode === "register" && <small className="password-guidance full-field">Use 12+ characters including upper-case, lower-case, a number, and a symbol.</small>}
          {!isBloodBankStaff && mode === "register" && <><label><span>Account type</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="requester">Requester</option><option value="donor">Voluntary donor</option></select></label>{form.role === "donor" && <><label><span>Self-reported blood group</span><select value={form.bloodGroup} onChange={(event) => setForm({ ...form, bloodGroup: event.target.value })} required><option value="">Choose</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label><label><span>Rh factor</span><select value={form.rhFactor} onChange={(event) => setForm({ ...form, rhFactor: event.target.value })}><option value="+">Positive (+)</option><option value="-">Negative (−)</option></select></label><label><span>{t(locale, "district")}</span><select value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} required><option value="">{t(locale, "chooseDistrict")}</option>{NEPAL_DISTRICTS.map((district) => <option key={district}>{district}</option>)}</select></label><label><span>Date of birth</span><input type="date" value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} max={new Date().toISOString().slice(0, 10)} required /></label><small className="password-guidance full-field">Your date of birth is kept private and used to derive your age. A blood-centre clinician makes the final donation-eligibility decision.</small><label className="consent-toggle full-field"><input type="checkbox" checked={form.outreachConsent} onChange={(event) => setForm({ ...form, outreachConsent: event.target.checked })} /><span><b>I choose to receive controlled outreach invitations.</b><small>You can change or withdraw this preference later.</small></span></label></>}</>}
        {error && <Notice tone="warning">{error}</Notice>}
          <button className="button button-signal" type="submit" disabled={working}>{working ? "Please wait…" : isBloodBankStaff ? "Open Blood Bank Dashboard" : mode === "signin" ? t(locale, "signIn") : "Create secure account"}</button>
          {isBloodBankStaff ? <small className="password-guidance full-field">No Blood Bank account yet? Ask the platform administrator to issue one for your facility.</small> : mode === "signin" && onOpenBloodBankLogin ? <button className="text-button full-field" type="button" onClick={onOpenBloodBankLogin}>Blood Bank staff? Open the Blood Bank portal →</button> : null}
        </form>
      </section>
    </div>
  );
}

function PasswordChangeDialog({ onChanged }: { onChanged: (user: CurrentUser) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError("");
    try {
      const result = await api<{ user: CurrentUser }>("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmation }) });
      onChanged(result.user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your password could not be changed."); }
    finally { setWorking(false); }
  }
  return <div className="modal-backdrop" role="presentation"><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title"><Pill className="access-pill">FIRST SIGN-IN SECURITY</Pill><h2 id="change-password-title">Choose your own password.</h2><p>Your Super Admin issued a temporary password. Replace it now before accessing any Blood Bank data.</p><form className="auth-form account-form" onSubmit={submit}><label><span>Temporary password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required autoFocus /></label><label><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label><label className="full-field"><span>Confirm new password</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={12} required /></label><small className="password-guidance full-field">Use 12+ characters including upper-case, lower-case, a number, and a symbol. Do not reuse the temporary password.</small>{error && <Notice tone="warning">{error}</Notice>}<button className="button button-signal full-field" type="submit" disabled={working}>{working ? "Changing password…" : "Save new password and continue"}</button></form></section></div>;
}

function Dashboard({ user, locale, onMessage, onReturnHome }: { user: CurrentUser; locale: Locale; onMessage: (message: string) => void; onReturnHome: () => void }) {
  const title = { requester: "Your coordination desk", donor: "Your donor controls", inventory_manager: "Blood Bank availability desk", reviewer: "Blood Bank request desk", facility_admin: "Blood Bank Admin dashboard", platform_admin: "Platform governance desk" }[user.role];
  return (
    <section className="dashboard-shell section-wrap">
      <div className="dashboard-topline"><button className="back-link" onClick={onReturnHome}>← Public search</button><Pill className="role-pill">{roleLabels[user.role]}</Pill></div>
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
  const [documentUploadsEnabled, setDocumentUploadsEnabled] = useState(false);
  const [documentUploadSecurity, setDocumentUploadSecurity] = useState<"malware_scanned" | "basic_validation" | "unavailable">("unavailable");
  const [documentUploadMessage, setDocumentUploadMessage] = useState<string | null>(null);
  const clientToken = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const [form, setForm] = useState({ facilityId: "", patientInitials: "", relationship: "Family member", bloodGroup: "", rhFactor: "+", component: "Packed red cells", quantity: "1", urgency: "Urgent", district: "", neededBy: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) });

  async function load() {
    setLoading(true);
    try {
      const [requestData, facilityData, platformConfig] = await Promise.all([
        api<{ requests: BloodRequest[] }>("/api/requests"),
        api<{ facilities: Array<{ id: number; name: string; district: string }> }>("/api/public/facilities"),
        api<{ documentUploadsEnabled: boolean; documentUploadSecurity: "malware_scanned" | "basic_validation" | "unavailable"; documentUploadMessage: string | null }>("/api/public/config")
      ]);
      setRequests(requestData.requests); setFacilities(facilityData.facilities); setDocumentUploadsEnabled(platformConfig.documentUploadsEnabled); setDocumentUploadSecurity(platformConfig.documentUploadSecurity); setDocumentUploadMessage(platformConfig.documentUploadMessage);
      setForm((current) => current.facilityId ? current : { ...current, facilityId: String(facilityData.facilities[0]?.id ?? "") });
    } catch (error) { onMessage(error instanceof Error ? error.message : "Could not load your requests."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setWorking(true);
    try {
      if (!document) throw new Error("Attach a hospital slip, prescription, or blood-request document before submitting.");
      const body = new FormData();
      body.append("facilityId", form.facilityId); body.append("patientInitials", form.patientInitials); body.append("relationship", form.relationship);
      body.append("bloodGroup", form.bloodGroup); body.append("rhFactor", form.rhFactor); body.append("component", form.component);
      body.append("quantity", form.quantity); body.append("urgency", form.urgency); body.append("district", form.district);
      body.append("neededBy", new Date(form.neededBy).toISOString()); body.append("clientToken", clientToken.current); body.append("document", document);
      const result = await api<{ request: BloodRequest }>("/api/requests", { method: "POST", body });
      onMessage(`Request ${result.request.reference} is waiting for verification-document review before facility coordination begins.`);
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
          <label><span>{t(locale, "district")}</span><select value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} required><option value="">{t(locale, "chooseDistrict")}</option>{NEPAL_DISTRICTS.map((district) => <option key={district}>{district}</option>)}</select></label>
          <label><span>Needed by (NPT)</span><input type="datetime-local" value={form.neededBy} onChange={(event) => setForm({ ...form, neededBy: event.target.value })} required /></label>
          <label className="full-field file-field"><span>Verification document <i>required</i></span><input type="file" accept="application/pdf,image/jpeg,image/png" required disabled={!documentUploadsEnabled} onChange={(event) => setDocument(event.target.files?.[0] ?? null)} /><small>{documentUploadSecurity === "basic_validation" ? "Demo mode: PDF/JPG/PNG type and size are checked, but the file is not malware scanned. It stays private and is visible only to authorized reviewers." : "Attach a hospital slip, prescription, or blood-request document as PDF, JPG, or PNG (maximum 5 MB). It is malware-scanned, private, and visible only to authorized reviewers."}</small></label>
          {!documentUploadsEnabled && <div className="full-field upload-security-note"><b>Secure document submission is temporarily unavailable.</b><span>{documentUploadMessage || "Try again later. No request can be submitted without the required verification document."}</span></div>}
          <div className="form-action full-field"><button className="button button-signal" type="submit" disabled={working || !documentUploadsEnabled}>{working ? "Submitting…" : "Submit document for review →"}</button></div>
        </form>
      </Card>
      <Card className="request-list-card"><div className="card-eyebrow">YOUR REQUESTS</div><h2>Follow the documented handoff.</h2>{loading ? <div className="loader">Loading private requests…</div> : requests.length ? <div className="request-stack">{requests.map((request) => <RequestCard key={request.id} request={request} locale={locale} />)}</div> : <EmptyState title="No private requests yet" body="Submit one when a verified facility needs to coordinate a request." />}</Card>
    </div>
  );
}

function RequestCard({ request, locale, staff = false, privateContact, controls }: { request: BloodRequest; locale: Locale; staff?: boolean; privateContact?: { name: string; phone: string }; controls?: ReactNode }) {
  return (
    <article className="request-card">
      <div className="request-card-top"><div><span className="reference">{request.reference}</span><h3>{request.bloodGroup}<sup>{request.rhFactor}</sup> · {request.component}</h3></div><StatusPill status={request.status} /></div>
      <div className="request-meta"><span>{request.quantity} requested · {request.urgency}</span><span>Needed {formatDate(request.neededBy, locale)}</span></div>
      {privateContact && <div className="private-contact"><span>Private requester contact</span><b>{privateContact.name}</b><a href={`tel:${privateContact.phone}`}>{privateContact.phone}</a></div>}
      <p className="request-message">{request.requesterVisibleMessage || "A facility needs to add the next safe update."}</p>
      {request.documents?.length ? <div className="document-row"><span>Verification documents</span>{request.documents.map((document) => <Pill key={document.id} className="doc-pill">{document.originalName} · {document.scanStatus.replaceAll("_", " ")} · {document.reviewStatus}</Pill>)}</div> : null}
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
  const [screening, setScreening] = useState<DonorScreening | null>(null);
  const [saving, setSaving] = useState(false);
  const [screeningSaving, setScreeningSaving] = useState(false);
  const [healthDataConsent, setHealthDataConsent] = useState(false);
  async function load() {
    try {
      const [profileData, invitationData, screeningData] = await Promise.all([api<{ profile: DonorProfile }>("/api/donor/profile"), api<{ invitations: Invitation[] }>("/api/donor/invitations"), api<{ screening: DonorScreening }>("/api/donor/screening")]);
      setProfile(profileData.profile); setInvitations(invitationData.invitations); setScreening(screeningData.screening); setHealthDataConsent(Boolean(screeningData.screening.consentedAt));
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
  async function saveScreening() {
    if (!screening) return;
    setScreeningSaving(true);
    try {
      const result = await api<{ screening: DonorScreening }>("/api/donor/screening", { method: "PATCH", body: JSON.stringify({ answers: screening.answers, healthDataConsent }) });
      setScreening(result.screening); onMessage("Your confidential pre-screening was submitted. A blood-centre clinician makes the final decision."); await load();
    } catch (error) { onMessage(error instanceof Error ? error.message : "The confidential pre-screening could not be saved."); }
    finally { setScreeningSaving(false); }
  }
  if (!profile || !screening) return <div className="loader">Loading donor controls…</div>;
  return <div className="dashboard-grid donor-grid">
    <Card className="donor-profile-card"><div className="card-eyebrow">YOUR CONSENT & AVAILABILITY</div><h2>Stay in control of when you are contacted.</h2><div className="donor-blood"><span>{profile.selfReportedGroup}<sup>{profile.selfReportedRh}</sup></span><p>Self-reported blood group<br /><small>Facility verification, if needed, happens separately.</small></p></div>
       <div className="donor-age"><span>Derived age</span><b>{profile.age ?? "—"}</b><small>Date of birth remains private.</small></div>
       <Notice>{profile.preScreeningResult}</Notice>
       {profile.donationCooldownActive && profile.cooldownUntil && <Notice tone="warning">Donation cooldown: a confirmed donation was recorded on {formatDate(profile.lastDonationDate!, locale, false)}. You cannot be selected for new outreach before {formatDate(profile.cooldownUntil, locale, false)} under the current {profile.donationCooldownMonths}-month policy. A blood-centre still makes the final clinical decision.</Notice>}
      <div className="form-grid donor-form"><label><span>Availability</span><select value={profile.availability} disabled={!profile.outreachConsent} onChange={(event) => setProfile({ ...profile, availability: event.target.value as DonorProfile["availability"] })}><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="temporarily_deferred">Temporarily deferred</option><option value="opted_out">Pause outreach</option></select></label><label><span>Preferred contact window</span><input value={profile.contactWindow} onChange={(event) => setProfile({ ...profile, contactWindow: event.target.value })} /></label><label><span>Maximum contact invitations / month</span><select value={profile.maxContactsPerMonth} onChange={(event) => setProfile({ ...profile, maxContactsPerMonth: Number(event.target.value) })}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
      <label className="consent-toggle"><input type="checkbox" checked={profile.outreachConsent} onChange={(event) => setProfile({ ...profile, outreachConsent: event.target.checked, availability: event.target.checked ? (profile.availability === "opted_out" ? "available" : profile.availability) : "opted_out" })} /><span><b>I choose to receive controlled emergency outreach.</b><small>This is optional. Opting out stops future campaigns immediately.</small></span></label>
      <div className="form-action"><button className="button button-signal" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save controls"}</button></div>
    </Card>
    <Card className="invitation-card"><div className="card-eyebrow">PRIVATE INVITATIONS</div><h2>A facility can ask—not expose.</h2><p className="card-intro">Invitations do not reveal the patient’s full identity, document, or requester contact details.</p>{invitations.length ? <div className="invitation-stack">{invitations.map((invite) => <article className="invite" key={invite.id}><div><Pill className={`invite-status ${invite.status}`}>{invite.status}</Pill><h3>{invite.bloodGroup}<sup>{invite.rhFactor}</sup> · {invite.component}</h3><p>{invite.facilityName} · expires {formatDate(invite.expiresAt, locale)}</p></div>{invite.status === "pending" && <div className="invite-actions"><button className="button button-ink" onClick={() => void respond(invite.id, "interested")}>I can be contacted</button><button className="button button-outline" onClick={() => void respond(invite.id, "declined")}>Not available</button><button className="text-button danger-text" onClick={() => void respond(invite.id, "stopped")}>Stop outreach</button></div>}</article>)}</div> : <EmptyState title="No active invitations" body="When you opt in and are available, a verified facility may send a limited private invitation." />}</Card>
    <Card className="screening-card"><div className="card-eyebrow">CONFIDENTIAL PRE-SCREENING</div><h2>Share only what a clinician needs to review.</h2><p className="card-intro">This is not medical clearance. A “yes” or “unsure” response keeps the result in review; a blood-centre clinician makes the final donation decision.</p><div className="screening-status"><span>Current status</span><Pill>{screening.eligibilityStatus.replaceAll("_", " ")}</Pill>{screening.submittedAt && <small>Submitted {formatDate(screening.submittedAt, locale)}</small>}</div><div className="screening-question-list">{DONOR_SCREENING_QUESTIONS.map((question) => <label key={question.key}><span>{question.label}</span><select value={screening.answers[question.key] ?? ""} onChange={(event) => setScreening({ ...screening, answers: { ...screening.answers, [question.key]: event.target.value as DonorScreeningAnswer } })} required><option value="">Choose a private answer</option><option value="no">No</option><option value="yes">Yes</option><option value="unsure">Unsure</option><option value="not_applicable">Not applicable</option></select></label>)}</div><label className="consent-toggle screening-consent"><input type="checkbox" checked={healthDataConsent} onChange={(event) => setHealthDataConsent(event.target.checked)} /><span><b>I consent to Raktakosh storing these answers for confidential facility pre-screening.</b><small>Only authorized facility reviewers can access submitted answers when you have accepted their outreach invitation.</small></span></label><div className="form-action"><button className="button button-signal" onClick={() => void saveScreening()} disabled={screeningSaving}>{screeningSaving ? "Saving confidential screening…" : "Submit confidential pre-screening"}</button></div></Card>
  </div>;
}

function FacilityWorkspace({ user, locale, onMessage }: { user: CurrentUser; locale: Locale; onMessage: (message: string) => void }) {
  const [operations, setOperations] = useState<FacilityOperations | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<"overview" | "requests" | "documents" | "donors" | "inventory" | "profile">("overview");
  const [changes, setChanges] = useState<Record<number, { status: string; message: string; note: string }>>({});
  const [donorScreenings, setDonorScreenings] = useState<Record<number, DonorScreening>>({});
  const [reviewChanges, setReviewChanges] = useState<Record<number, { eligibilityStatus: "needs_review" | "provisionally_eligible" | "not_eligible_now"; reviewReason: string }>>({});
  const [donationDates, setDonationDates] = useState<Record<number, string>>({});
  const [documentReviewChanges, setDocumentReviewChanges] = useState<Record<number, { reviewStatus: "accepted" | "rejected"; reviewNote: string }>>({});
  const [screeningLoading, setScreeningLoading] = useState<number | null>(null);
  const [inventoryForm, setInventoryForm] = useState({ bloodGroup: "O", rhFactor: "+", component: "Packed red cells", availableQuantity: "0", reservedQuantity: "0", reason: "routine_count", note: "", publicVisible: true });
  const canEditInventory = user.role === "inventory_manager" || user.role === "facility_admin";
  const canReview = user.role === "reviewer" || user.role === "facility_admin";
  async function load() {
    setLoading(true);
    try {
      const data = await api<{ operations: FacilityOperations }>("/api/facility/operations");
      setOperations(data.operations);
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
  function updateAvailabilityFromRecord(item: InventoryItem) {
    setInventoryForm({ bloodGroup: item.bloodGroup, rhFactor: item.rhFactor, component: item.component, availableQuantity: String(item.availableQuantity), reservedQuantity: String(item.reservedQuantity), reason: "routine_count", note: "", publicVisible: item.publicVisible });
    setActivePanel("inventory");
  }
  async function completeOperationalRequestAction(request: BloodRequest, targetStatus: RequestStatus) {
    try {
      await api(`/api/requests/${request.id}/status`, { method: "POST", body: JSON.stringify({ status: targetStatus }) });
      onMessage(`${request.reference} moved to ${statusLabels[targetStatus]}. Confirm physical stock and clinical steps through your Blood Bank process.`);
      await load();
    } catch (error) { onMessage(error instanceof Error ? error.message : "The request step could not be saved."); }
  }
  async function downloadDocument(documentId: number) {
    try {
      const result = await api<{ url: string; expiresAt: string }>(`/api/request-documents/${documentId}/download`);
      globalThis.open(result.url, "_blank", "noopener,noreferrer");
      onMessage("Secure document link opened. It expires in one minute and this access was recorded.");
    } catch (error) { onMessage(error instanceof Error ? error.message : "The document could not be opened."); }
  }
  async function reviewDocument(documentId: number) {
    const change = documentReviewChanges[documentId] ?? { reviewStatus: "accepted" as const, reviewNote: "" };
    try {
      await api(`/api/request-documents/${documentId}/review`, { method: "POST", body: JSON.stringify(change) });
      onMessage(change.reviewStatus === "accepted" ? "Verification document accepted; the request entered facility coordination review." : "Verification document rejected; the requester was asked for a replacement.");
      await load();
    } catch (error) { onMessage(error instanceof Error ? error.message : "The document review could not be saved."); }
  }
  async function viewDonorScreening(donorUserId: number) {
    if (donorScreenings[donorUserId]) {
      setDonorScreenings((current) => { const next = { ...current }; delete next[donorUserId]; return next; });
      return;
    }
    setScreeningLoading(donorUserId);
    try {
      const result = await api<{ screening: DonorScreening }>(`/api/facility/donors/${donorUserId}/screening`);
      setDonorScreenings((current) => ({ ...current, [donorUserId]: result.screening }));
      setReviewChanges((current) => ({ ...current, [donorUserId]: current[donorUserId] ?? { eligibilityStatus: "provisionally_eligible", reviewReason: "" } }));
    } catch (error) { onMessage(error instanceof Error ? error.message : "The donor screening could not be loaded."); }
    finally { setScreeningLoading(null); }
  }
  async function saveDonorReview(donorUserId: number) {
    const change = reviewChanges[donorUserId]; if (!change) return;
    try {
      const result = await api<{ screening: DonorScreening }>(`/api/facility/donors/${donorUserId}/eligibility`, { method: "PATCH", body: JSON.stringify(change) });
      setDonorScreenings((current) => ({ ...current, [donorUserId]: result.screening }));
      onMessage("Donor pre-screening status updated. This does not replace clinical assessment."); await load();
    } catch (error) { onMessage(error instanceof Error ? error.message : "The donor screening review could not be saved."); }
  }
  async function recordDonation(donorUserId: number) {
    const donatedOn = donationDates[donorUserId] ?? new Date().toISOString().slice(0, 10);
    try {
      const result = await api<{ cooldownUntil: string }>(`/api/facility/donors/${donorUserId}/donations`, { method: "POST", body: JSON.stringify({ donatedOn }) });
      onMessage(`Donation recorded. This donor will not be selected for new outreach before ${formatDate(result.cooldownUntil, locale, false)}.`); await load();
    } catch (error) { onMessage(error instanceof Error ? error.message : "The donation date could not be recorded."); }
  }
  if (loading && !operations) return <div className="loader">Loading blood-centre operations…</div>;
  if (!operations) return null;
  const openRequestCount = operations.requestCounts.filter((item) => !["fulfilled", "unable_to_fulfill", "rejected", "cancelled", "expired"].includes(item.status)).reduce((total, item) => total + item.count, 0);
  const panels: Array<{ id: typeof activePanel; label: string; visible: boolean }> = [
    { id: "overview", label: "Overview", visible: true },
    { id: "requests", label: "Requester queries", visible: operations.privateCaseworkAvailable },
    { id: "documents", label: "Request documents", visible: operations.privateCaseworkAvailable },
    { id: "donors", label: "Donor queries", visible: operations.privateCaseworkAvailable },
    { id: "inventory", label: "Blood availability", visible: true }
    ,{ id: "profile", label: "Blood Bank profile", visible: true }
  ];
  return <div className="facility-workspace">
    <div className="blood-centre-heading"><div><div className="card-eyebrow">VERIFIED BLOOD BANK DASHBOARD</div><h2>{operations.facility.name}</h2><p>{operations.facility.district} · {operations.facility.verificationStatus} Blood Bank access</p></div><span>Private data is logged and visible only to authorized coordination staff.</span></div>
    <div className="facility-stats"><article><small>ACTIVE CASES</small><b>{openRequestCount}</b><span>across documented states</span></article><article className={operations.urgentOpenCount ? "attention-stat" : ""}><small>URGENT / CRITICAL</small><b>{operations.urgentOpenCount}</b><span>open coordination cases</span></article><article><small>AWAITING REVIEW</small><b>{operations.pendingReviewCount}</b><span>document or request review</span></article><article><small>DONOR RESPONSES</small><b>{operations.donorResponseCount}</b><span>consented to contact</span></article><article className={operations.staleCount ? "attention-stat" : ""}><small>STALE INVENTORY</small><b>{operations.staleCount}</b><span>needs an inventory check</span></article></div>
    <div className="facility-tabs" role="tablist" aria-label="Blood-centre operations">{panels.filter((panel) => panel.visible).map((panel) => <button key={panel.id} className={activePanel === panel.id ? "active" : ""} role="tab" aria-selected={activePanel === panel.id} onClick={() => setActivePanel(panel.id)}>{panel.label}</button>)}</div>
    {activePanel === "overview" && <div className="facility-grid overview-grid"><Card><div className="card-eyebrow">OPERATIONAL OVERVIEW</div><h2>Coordinate the next safe step.</h2><p className="card-intro">Use this workspace for verified facility operations. Requester contacts and donor responses are scoped to this facility and audited whenever authorized staff access them.</p><div className="request-counts">{operations.requestCounts.length ? operations.requestCounts.map((item) => <div key={item.status}><StatusPill status={item.status} /><b>{item.count}</b></div>) : <EmptyState title="No active records" body="New coordination cases will appear here when submitted to this facility." />}</div></Card><Card><div className="card-eyebrow">YOUR ACCESS</div><h2>{operations.privateCaseworkAvailable ? "Private casework enabled." : "Inventory-only access."}</h2><p className="card-intro">{operations.privateCaseworkAvailable ? "You can review requests and see contact details only for donors who accepted this facility’s outreach invitation." : "You can manage facility inventory. Private request and donor contact data is reserved for reviewers and facility administrators."}</p><Notice>{operations.todayUpdates} inventory adjustment{operations.todayUpdates === 1 ? "" : "s"} recorded by your account today.</Notice></Card></div>}
    {activePanel === "overview" && canEditInventory && <Card className="quick-availability-card"><div className="card-eyebrow">QUICK AVAILABILITY UPDATE</div><h2>Update your Blood Bank availability.</h2><p className="card-intro">Choose a current blood record, enter the latest count, and save an accountable adjustment. Public search uses this facility-reported availability.</p><div className="inventory-list">{operations.inventory.length ? operations.inventory.slice(0, 6).map((item) => <div className="inventory-row" key={item.id}><div><b>{item.bloodGroup}<sup>{item.rhFactor}</sup></b><span>{item.component}</span></div><div><strong>{item.availableQuantity}</strong><button className="text-button" onClick={() => updateAvailabilityFromRecord(item)}>Update availability</button></div></div>) : <EmptyState title="No availability records" body="Open Blood availability to record the first group and component." />}</div><button className="button button-outline" onClick={() => setActivePanel("inventory")}>Manage all blood availability</button></Card>}
    {activePanel === "overview" && canReview && operations.privateCaseworkAvailable && <Card className="quick-request-actions"><div className="card-eyebrow">REQUEST COORDINATION</div><h2>Record the next verified Blood Bank step.</h2><p className="card-intro">These actions only update the coordination record. They do not create an automatic blood match, clinical approval, or physical reservation.</p>{operations.cases.length ? <div className="request-stack">{operations.cases.slice(0, 6).map((request) => { const action = requestOperationalActions[request.status]; return <div className="inventory-row" key={request.id}><div><b>{request.reference}</b><span>{request.bloodGroup}{request.rhFactor} · {request.component} · {statusLabels[request.status]}</span></div>{action ? <button className="button button-ink" onClick={() => void completeOperationalRequestAction(request, action.status)}>{action.label}</button> : <button className="button button-outline" onClick={() => setActivePanel("requests")}>View query</button>}</div>; })}</div> : <EmptyState title="No open requester queries" body="New requests assigned to this Blood Bank will appear here." />}</Card>}
    {activePanel === "requests" && operations.privateCaseworkAvailable && <Card className="queue-card"><div className="card-eyebrow">PRIVATE REQUEST QUEUE</div><h2>Review only cases assigned to your facility.</h2><p className="card-intro">Requester contact details are private operational data. Use them only for the selected case and do not copy or export them.</p>{operations.cases.length ? <div className="request-stack">{operations.cases.map((request) => <RequestCard key={request.id} request={request} locale={locale} staff privateContact={request.requester} controls={canReview ? <div className="review-controls"><div className="transition-row"><select value={changes[request.id]?.status ?? ""} onChange={(event) => updateChange(request.id, "status", event.target.value)} aria-label={`New status for ${request.reference}`}><option value="">Choose permitted next state</option>{(allowedClientTransitions[request.status] ?? []).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><input value={changes[request.id]?.message ?? ""} onChange={(event) => updateChange(request.id, "message", event.target.value)} placeholder="Requester-safe update (required for outcomes)" /><button className="button button-ink" onClick={() => void updateStatus(request)}>Update</button></div><div className="note-row"><input value={changes[request.id]?.note ?? ""} onChange={(event) => updateChange(request.id, "note", event.target.value)} placeholder="Internal note — never shown to requester" /><button className="button button-outline" onClick={() => void addNote(request)}>Add note</button>{request.status === "inventory_unavailable" && <button className="button button-signal" onClick={() => void startOutreach(request)}>Start donor outreach</button>}</div></div> : null} />)}</div> : <EmptyState title="No facility cases" body="New requests assigned to this verified facility will appear here." />}</Card>}
    {activePanel === "documents" && operations.privateCaseworkAvailable && <Card className="queue-card"><div className="card-eyebrow">PRIVATE REQUEST DOCUMENTS</div><h2>Review verification documents before coordination begins.</h2><Notice>Every opening creates an audit event and uses a short-lived secure link. Documents marked “unscanned” passed only basic file validation.</Notice>{operations.documents.length ? <div className="request-stack">{operations.documents.map((document) => { const change = documentReviewChanges[document.id] ?? { reviewStatus: "accepted" as const, reviewNote: "" }; const pending = document.reviewStatus === "pending"; return <article className="request-card" key={document.id}><div className="request-card-top"><div><span className="reference">{document.requestReference}</span><h3>{document.originalName}</h3></div><Pill className="doc-pill">{document.reviewStatus}</Pill></div><div className="request-meta"><span>{document.patientInitials} · {document.urgency}</span><span>{document.mimeType.replace("application/", "")} · {formatBytes(document.byteSize)}</span></div><p className="request-message">File security: <b>{document.scanStatus === "unscanned" ? "basic validation only — unscanned" : document.scanStatus}</b> · Uploaded {formatDate(document.createdAt, locale)} · Retained until {formatDate(document.retentionUntil, locale, false)}</p><div className="review-controls"><button className="button button-ink" onClick={() => void downloadDocument(document.id)}>Open secure document</button>{canReview && pending && <><label><span>Document decision</span><select value={change.reviewStatus} onChange={(event) => setDocumentReviewChanges((current) => ({ ...current, [document.id]: { reviewStatus: event.target.value as "accepted" | "rejected", reviewNote: current[document.id]?.reviewNote ?? "" } }))}><option value="accepted">Accept document</option><option value="rejected">Request replacement</option></select></label><label><span>Review note {change.reviewStatus === "rejected" ? "(required)" : "(optional)"}</span><input value={change.reviewNote} maxLength={500} onChange={(event) => setDocumentReviewChanges((current) => ({ ...current, [document.id]: { reviewStatus: current[document.id]?.reviewStatus ?? "accepted", reviewNote: event.target.value } }))} /></label><button className="button button-signal" onClick={() => void reviewDocument(document.id)}>Save document review</button></>}</div></article>; })}</div> : <EmptyState title="No request documents" body="Documents for cases assigned to this facility will appear here for review." />}</Card>}
    {activePanel === "donors" && operations.privateCaseworkAvailable && <Card className="donor-response-card"><div className="card-eyebrow">CONSENTED DONOR RESPONSES</div><h2>Contact only donors who opted in.</h2><Notice>These details appear only after a donor accepted this facility’s outreach invitation. Do not use them for unrelated contact or export them.</Notice>{operations.donorResponses.length ? <div className="donor-response-list">{operations.donorResponses.map((response) => { const screening = donorScreenings[response.donorUserId]; const review = reviewChanges[response.donorUserId]; const donatedOn = donationDates[response.donorUserId] ?? new Date().toISOString().slice(0, 10); return <article key={response.recipientId}><div><Pill className="verification verified">Contact accepted</Pill><h3>{response.donorName}</h3><p>{response.bloodGroup}<sup>{response.rhFactor}</sup> · {response.component} · {response.district}</p><small>Age {response.age ?? "not recorded"} · pre-screening {response.eligibilityStatus.replaceAll("_", " ")}</small><small>For {response.requestReference} · responded {formatDate(response.respondedAt, locale)}</small>{screening && <div className="screening-review"><b>Confidential pre-screening</b>{screening.submittedAt ? <><div className="screening-answer-list">{DONOR_SCREENING_QUESTIONS.map((question) => <p key={question.key}><span>{question.label}</span><strong>{screening.answers[question.key]?.replaceAll("_", " ") ?? "Not answered"}</strong></p>)}</div><div className="screening-review-controls"><label><span>Facility review status</span><select value={review?.eligibilityStatus ?? "provisionally_eligible"} onChange={(event) => setReviewChanges((current) => ({ ...current, [response.donorUserId]: { eligibilityStatus: event.target.value as "needs_review" | "provisionally_eligible" | "not_eligible_now", reviewReason: event.target.value } }))}><option value="needs_review">Needs review</option><option value="provisionally_eligible">Provisionally eligible</option><option value="not_eligible_now">Not eligible now</option></select></label><label><span>Review note {review?.eligibilityStatus === "not_eligible_now" ? "(required)" : "(optional)"}</span><input value={review?.reviewReason ?? ""} onChange={(event) => setReviewChanges((current) => ({ ...current, [response.donorUserId]: { eligibilityStatus: current[response.donorUserId]?.eligibilityStatus ?? "provisionally_eligible", reviewReason: current[response.donorUserId]?.reviewReason ?? "" } }))} maxLength={500} /></label><button className="button button-outline" onClick={() => void saveDonorReview(response.donorUserId)}>Save review</button></div></> : <p className="screening-empty">The donor has not submitted the current confidential pre-screening.</p>}</div>}</div><div className="donor-contact-actions"><a className="button button-ink" href={`tel:${response.phone}`}>Call donor</a><span>{response.phone}</span><small>Preferred: {response.contactWindow}</small><button className="text-button" onClick={() => void viewDonorScreening(response.donorUserId)} disabled={screeningLoading === response.donorUserId}>{screeningLoading === response.donorUserId ? "Loading…" : screening ? "Hide screening" : "Review screening"}</button>{canReview && <div className="donation-record-controls"><label><span>Confirmed donation date</span><input type="date" value={donatedOn} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setDonationDates((current) => ({ ...current, [response.donorUserId]: event.target.value }))} /></label><button className="button button-outline" onClick={() => void recordDonation(response.donorUserId)}>Record donation</button></div>}</div></article>; })}</div> : <EmptyState title="No accepted donor responses" body="Donor details appear here only after a donor accepts a controlled outreach invitation." />}</Card>}
    {activePanel === "inventory" && <div className="facility-grid"><Card><div className="card-eyebrow">AVAILABILITY SUMMARY</div><h2>Keep the public signal honest.</h2><div className="inventory-list">{operations.inventory.map((item) => <div className="inventory-row" key={item.id}><div><b>{item.bloodGroup}<sup>{item.rhFactor}</sup></b><span>{item.component}</span></div><div><strong>{item.availableQuantity}</strong><small>reported · {formatDate(item.lastUpdated, locale, false)}</small></div></div>)}</div></Card><aside className="inventory-side">{canEditInventory && <Card className="inventory-editor"><div className="card-eyebrow">LOG AN ADJUSTMENT</div><h2>Record availability with a reason.</h2><form className="form-grid compact-form" onSubmit={saveInventory}><label><span>Group</span><select value={inventoryForm.bloodGroup} onChange={(event) => setInventoryForm({ ...inventoryForm, bloodGroup: event.target.value })}>{groups.map((group) => <option key={group}>{group}</option>)}</select></label><label><span>Rh</span><select value={inventoryForm.rhFactor} onChange={(event) => setInventoryForm({ ...inventoryForm, rhFactor: event.target.value })}><option>+</option><option>-</option></select></label><label className="full-field"><span>Component</span><select value={inventoryForm.component} onChange={(event) => setInventoryForm({ ...inventoryForm, component: event.target.value })}>{components.map((component) => <option key={component}>{component}</option>)}</select></label><label><span>Reported availability</span><input type="number" min="0" value={inventoryForm.availableQuantity} onChange={(event) => setInventoryForm({ ...inventoryForm, availableQuantity: event.target.value })} /></label><label><span>Reserved</span><input type="number" min="0" value={inventoryForm.reservedQuantity} onChange={(event) => setInventoryForm({ ...inventoryForm, reservedQuantity: event.target.value })} /></label><label className="full-field"><span>Adjustment reason</span><select value={inventoryForm.reason} onChange={(event) => setInventoryForm({ ...inventoryForm, reason: event.target.value })}><option value="routine_count">Routine count</option><option value="request_reservation">Request reservation</option><option value="issue_correction">Issue / correction</option><option value="expiry">Expiry</option><option value="reconciliation">Reconciliation</option><option value="other">Other</option></select></label><label className="full-field"><span>Optional note</span><input value={inventoryForm.note} onChange={(event) => setInventoryForm({ ...inventoryForm, note: event.target.value })} /></label><label className="checkbox-line full-field"><input type="checkbox" checked={inventoryForm.publicVisible} onChange={(event) => setInventoryForm({ ...inventoryForm, publicVisible: event.target.checked })} /> Allow the qualified public availability state to be shown</label><button className="button button-signal full-field" type="submit">Record adjustment</button></form></Card>}{!canEditInventory && <Card><div className="card-eyebrow">INVENTORY PERMISSIONS</div><h2>Read-only inventory view.</h2><p className="card-intro">Only inventory managers and facility administrators can record adjustments.</p></Card>}</aside></div>}
    {activePanel === "profile" && <Card className="facility-profile-card"><div className="card-eyebrow">VERIFIED FACILITY PROFILE</div><h2>Operating information for this centre.</h2><p className="card-intro">This is the facility record currently used for private request routing and public availability information.</p><div className="facility-profile-grid"><div><span>Facility type</span><b>{operations.facility.facilityType}</b></div><div><span>Verification</span><b>{operations.facility.verificationStatus}</b></div><div><span>Address</span><b>{operations.facility.address}</b></div><div><span>Public contact</span><a href={`tel:${operations.facility.publicContact.replace(/[^+\d]/g, "")}`}>{operations.facility.publicContact}</a></div><div><span>Operating hours</span><b>{operations.facility.operatingHours}</b></div><div><span>Request intake</span><b>{operations.facility.acceptsRequests ? "Accepting requests" : "Not accepting requests"}</b></div><div><span>Controlled outreach</span><b>{operations.facility.participatesOutreach ? "Participating" : "Not participating"}</b></div></div></Card>}
  </div>;
}

function AdminDashboard({ locale, onMessage }: { locale: Locale; onMessage: (message: string) => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [issuedCredential, setIssuedCredential] = useState<{ facilityName: string; email: string; temporaryPassword: string } | null>(null);
  const [tenantForm, setTenantForm] = useState({ facilityName: "", facilityType: "Blood Bank", district: "", address: "", publicContact: "", operatingHours: "", acceptsRequests: true, participatesOutreach: false, activateNow: true, adminName: "", adminEmail: "", adminPhone: "", temporaryPassword: "" });
  async function load() {
    try { setOverview((await api<{ overview: AdminOverview }>("/api/admin/overview")).overview); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Could not load governance data."); }
  }
  useEffect(() => { void load(); }, []);
  async function changeStaffStatus(id: number, accountStatus: "active" | "suspended") {
    try { await api(`/api/admin/staff/${id}/status`, { method: "PATCH", body: JSON.stringify({ accountStatus }) }); onMessage(`Staff account ${accountStatus}. Active sessions were revoked when applicable.`); await load(); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Staff access could not be updated."); }
  }
  function generateTemporaryPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const values = crypto.getRandomValues(new Uint32Array(18));
    setTenantForm((current) => ({ ...current, temporaryPassword: Array.from(values, (value) => alphabet[value % alphabet.length]).join("") }));
  }
  async function provisionTenant(event: FormEvent) {
    event.preventDefault(); setProvisioning(true);
    try {
      const result = await api<{ tenant: { facilityName: string; adminEmail: string } }>("/api/admin/tenants", { method: "POST", body: JSON.stringify(tenantForm) });
      setIssuedCredential({ facilityName: result.tenant.facilityName, email: result.tenant.adminEmail, temporaryPassword: tenantForm.temporaryPassword });
      setTenantForm({ facilityName: "", facilityType: "Blood Bank", district: "", address: "", publicContact: "", operatingHours: "", acceptsRequests: true, participatesOutreach: false, activateNow: true, adminName: "", adminEmail: "", adminPhone: "", temporaryPassword: "" });
      onMessage("Blood Bank tenant and first admin account created. Share the issued credential securely."); await load();
    } catch (error) { onMessage(error instanceof Error ? error.message : "The Blood Bank tenant could not be created."); }
    finally { setProvisioning(false); }
  }
  if (!overview) return <div className="loader">Loading governance overview…</div>;
  return <div className="admin-grid">
    <Card className="admin-provision"><div className="card-eyebrow">MULTI-TENANT PROVISIONING</div><h2>Add a Blood Bank branch and first admin.</h2><p className="card-intro">This creates one isolated facility tenant and one Blood Bank Admin. The temporary password is never stored in readable form; the branch must replace it after first sign-in.</p>{issuedCredential && <Notice tone="success"><b>Credential issued for {issuedCredential.facilityName}</b><br />Email: <code>{issuedCredential.email}</code><br />Temporary password: <code>{issuedCredential.temporaryPassword}</code><br /><small>Copy and share this securely now. It will not be shown again after you dismiss this notice.</small><br /><button className="text-button" type="button" onClick={() => setIssuedCredential(null)}>Dismiss credential</button></Notice>}<form className="form-grid" onSubmit={provisionTenant}><label className="full-field"><span>Blood Bank / branch name</span><input value={tenantForm.facilityName} onChange={(event) => setTenantForm({ ...tenantForm, facilityName: event.target.value })} placeholder="e.g. Damak Red Cross Society" required /></label><label><span>Facility type</span><input value={tenantForm.facilityType} onChange={(event) => setTenantForm({ ...tenantForm, facilityType: event.target.value })} required /></label><label><span>District</span><select value={tenantForm.district} onChange={(event) => setTenantForm({ ...tenantForm, district: event.target.value })} required><option value="">Choose district</option>{NEPAL_DISTRICTS.map((district) => <option key={district}>{district}</option>)}</select></label><label className="full-field"><span>Address</span><input value={tenantForm.address} onChange={(event) => setTenantForm({ ...tenantForm, address: event.target.value })} placeholder="Street / municipality / district" required /></label><label><span>Public contact number</span><input value={tenantForm.publicContact} onChange={(event) => setTenantForm({ ...tenantForm, publicContact: event.target.value })} placeholder="e.g. +977..." required /></label><label><span>Operating hours</span><input value={tenantForm.operatingHours} onChange={(event) => setTenantForm({ ...tenantForm, operatingHours: event.target.value })} placeholder="e.g. Sun–Fri · 09:00–17:00 NPT" required /></label><label><span>Branch admin name</span><input value={tenantForm.adminName} onChange={(event) => setTenantForm({ ...tenantForm, adminName: event.target.value })} required /></label><label><span>Branch admin email</span><input type="email" value={tenantForm.adminEmail} onChange={(event) => setTenantForm({ ...tenantForm, adminEmail: event.target.value })} required /></label><label><span>Branch admin phone</span><input value={tenantForm.adminPhone} onChange={(event) => setTenantForm({ ...tenantForm, adminPhone: event.target.value })} required /></label><label><span>Temporary password</span><div className="password-field"><input type="text" value={tenantForm.temporaryPassword} onChange={(event) => setTenantForm({ ...tenantForm, temporaryPassword: event.target.value })} minLength={12} required /><button className="button button-outline" type="button" onClick={generateTemporaryPassword}>Generate</button></div></label><small className="password-guidance full-field">Use 12+ characters with upper-case, lower-case, number, and symbol. The branch must change it after first sign-in.</small><label className="checkbox-line full-field"><input type="checkbox" checked={tenantForm.activateNow} onChange={(event) => setTenantForm({ ...tenantForm, activateNow: event.target.checked })} /> Activate this branch for Blood Bank operations now</label><label className="checkbox-line full-field"><input type="checkbox" checked={tenantForm.acceptsRequests} onChange={(event) => setTenantForm({ ...tenantForm, acceptsRequests: event.target.checked })} /> Allow private blood requests to be routed to this branch</label><label className="checkbox-line full-field"><input type="checkbox" checked={tenantForm.participatesOutreach} onChange={(event) => setTenantForm({ ...tenantForm, participatesOutreach: event.target.checked })} /> Allow controlled donor outreach for this branch</label><button className="button button-signal full-field" type="submit" disabled={provisioning}>{provisioning ? "Creating Blood Bank tenant…" : "Create Blood Bank Admin credential"}</button></form></Card>
    <Card className="admin-facilities"><div className="card-eyebrow">FACILITY VERIFICATION</div><h2>Public visibility begins with a verified operating partner.</h2><div className="facility-table"><div className="table-row table-head"><span>Facility</span><span>Status</span><span>Public</span><span>Open requests</span></div>{overview.facilities.map((facility) => <div className="table-row" key={facility.id}><div><b>{facility.name}</b><small>{facility.district}</small></div><Pill className={`verification ${facility.status}`}>{facility.status}</Pill><span>{facility.publicAvailability ? "Enabled" : "Hidden"}</span><strong>{facility.openRequests}</strong></div>)}</div></Card>
    <Card className="admin-policies"><div className="card-eyebrow">PUBLISHED POLICY</div><h2>Visible rules; no hidden medical automation.</h2>{overview.policies.map((policy) => <article className="policy-row" key={policy.id}><div><Pill>{policy.version}</Pill><h3>{policy.name}</h3></div><p>{policy.summary}</p><small>Effective {formatDate(policy.effectiveAt, locale, false)}</small></article>)}</Card>
    <Card className="admin-staff"><div className="card-eyebrow">STAFF ACCESS SECURITY</div><h2>Protect tenant staff access.</h2><div className="staff-table"><div className="staff-row staff-head"><span>Staff member</span><span>Sign-in setup</span><span>State</span><span>Action</span></div>{overview.staff.map((member) => <div className="staff-row" key={member.id}><div><b>{member.name}</b><small>{roleLabels[member.role]} · {member.facilityName || "Platform"}</small></div><div><Pill className={member.passwordChangeRequired ? "verification suspended" : member.mfaEnabled ? "verification verified" : "verification suspended"}>{member.passwordChangeRequired ? "Password change required" : member.mfaEnabled ? "MFA enabled" : "MFA setup required"}</Pill><small>MFA: {member.mfaEnabled ? "enabled" : "not enrolled"}</small></div><Pill className={`verification ${member.accountStatus === "active" ? "verified" : "suspended"}`}>{member.accountStatus}</Pill><button className="text-button danger-text" disabled={member.accountStatus === "suspended"} onClick={() => void changeStaffStatus(member.id, "suspended")}>Suspend</button></div>)}</div></Card>
    <Card className="audit-card"><div className="card-eyebrow">AUDIT FEED</div><h2>High-signal operating history.</h2><ol className="audit-feed">{overview.auditEvents.map((event) => <li key={event.id}><span className="audit-node" /><div><b>{event.action.replaceAll("_", " ")}</b><p>{event.actorName} · {event.entityType} #{event.entityId}</p><small>{formatDate(event.createdAt, locale)}</small></div></li>)}</ol></Card>
  </div>;
}

export default App;
