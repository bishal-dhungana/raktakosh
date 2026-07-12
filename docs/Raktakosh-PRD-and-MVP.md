# Raktakosh — Product Requirements Document and MVP Specification

**Document status:** Draft for stakeholder review
**Version:** 1.0
**Prepared from:** The Raktakosh minor-project proposal dated June 26, 2026
**Pilot assumption:** Morang district, Nepal, with a small group of verified hospital or blood-centre partners
**Primary delivery model:** Responsive web application
**Recommended application stack:** Laravel on PHP 8.2+, MySQL 8, HTML/CSS/JavaScript, private object storage, queue worker, and a configurable SMS/email provider

---

## 1. Document purpose

This document turns the submitted Raktakosh proposal into a build-ready product specification. It describes:

- What the product is and is not.
- The people who use it and what they can do.
- Detailed functional, technical, privacy, security, operational, and testing requirements.
- The MVP boundary: the smallest safe, useful version that can be piloted.
- A phased roadmap for the capabilities that should not be attempted in the first release.

This is a software requirements document, not medical, transfusion, legal, or regulatory advice. Before a live deployment, a named clinical safety lead, participating blood services, and a Nepal-qualified legal/privacy reviewer must validate every clinical policy, consent text, retention rule, and operating workflow.

---

## 2. Executive summary

Raktakosh is a web platform that helps verified blood-service facilities coordinate blood availability and emergency blood requests. It brings together:

1. People seeking blood for a patient.
2. Voluntary blood donors who choose to be contacted.
3. Hospitals and blood centres that publish and verify availability.
4. Platform administrators who verify organizations, prevent misuse, and audit activity.

The product solves a practical coordination problem: during an emergency, families often make repeated phone calls, travel between facilities, and post public appeals without knowing whether blood is available. Raktakosh gives them a structured place to:

- Search high-level availability by district and blood component.
- Submit a documented request to a verified facility.
- Receive status updates from the responsible facility.
- Trigger a controlled donor outreach flow only when facility inventory cannot meet a verified request.

Raktakosh must never claim that blood has been clinically matched, medically cleared, reserved, or is ready for transfusion unless an authorized facility user explicitly records that decision. It is a coordination and workflow platform, not a replacement for blood collection, testing, cross-matching, physician assessment, or transfusion procedures.

---

## 3. Product context and proposal traceability

The original proposal describes a centralized three-tier web system using HTML, CSS, JavaScript, PHP 8, and MySQL. It identifies fragmented emergency blood search, limited direct coordination, inconsistent stock visibility, and weak verification as the main problems.

The following table ensures every major proposal idea is represented in this specification.

| Proposal item | PRD interpretation | MVP decision |
|---|---|---|
| Centralized blood management platform | One platform for facilities, donors, requesters, and administrators | Included |
| Donor, receiver, hospital administrator roles | Separate role-based dashboards and permissions | Included |
| District-wise stock filtering | Search verified facilities by district, group, component, and freshness of data | Included |
| Real-time inventory | Near-real-time facility-entered availability with visible last-updated time; no claim of live laboratory integration in MVP | Included with limits |
| Donor eligibility engine | Configurable pre-screening and availability status; final medical eligibility stays with the facility | Included |
| Minimum age and donation interval checks | Configurable policy rules, not hard-coded medical truth | Included |
| Prescription PDF/PNG upload and verification | Private upload, malware scan, authorized manual review, document status | Included |
| Emergency public-network peer ledger | Verified partner-facility directory and controlled donor-outreach fallback; not blockchain | Included in a limited form |
| Private chat | Secure status updates and contact relay first; full direct chat is deferred | Deferred to Phase 2 |
| Home-service routing alerts | Facility-specific service instructions only; no home collection, ambulance, or delivery operations in MVP | Deferred / facility-configured |
| Guest access without login | Public search page with privacy-safe availability summaries | Included |
| Asynchronous updates | Background notification queue, status timeline, and in-app refresh/polling | Included |
| Hospital stock administration | Inventory dashboard, reconciliation metadata, and audit history | Included |

---

## 4. Product vision, problem statement, and value proposition

### 4.1 Product vision

Make emergency blood coordination more visible, accountable, and reliable without exposing private medical data or bypassing clinical blood-service procedures.

### 4.2 Problem statement

Blood seekers in Nepal may need to contact many people and facilities during a time-sensitive emergency. Availability information is fragmented, donor contact details can be exposed publicly, facilities may use manual records, and a request may not have an auditable status. This creates delay, anxiety, duplicate outreach, stale information, and privacy risk.

### 4.3 Value proposition

For a seeker, Raktakosh provides one structured request path and transparent updates.
For a donor, it provides opt-in, privacy-preserving emergency contact.
For a facility, it provides a request queue, inventory visibility, records, and auditability.
For the network, it provides verified coordination rather than uncontrolled public appeals.

### 4.4 Product principles

1. **Clinical authority stays with licensed facilities.** The platform never replaces medical judgment.
2. **Availability is qualified, not promised.** Every availability result carries a facility name, timestamp, and disclaimer.
3. **Privacy by default.** Do not publicly expose patient, donor, phone, prescription, or exact-location data.
4. **Human verification for high-risk actions.** Facility approval is required before a request is confirmed, a document is accepted, or an emergency donor campaign is sent.
5. **Mobile-first and low-bandwidth aware.** Core tasks must work on an entry-level smartphone and unstable connection.
6. **Auditability over convenience.** Every inventory adjustment, status change, and sensitive-document access must be traceable.
7. **Configurable policies, not hidden assumptions.** Eligibility thresholds and operational rules are settings approved by the clinical safety lead.
8. **Graceful failure.** When messaging, search, or an external provider fails, the user receives a clear fallback instruction rather than a false confirmation.

---

## 5. Goals, non-goals, and measurable outcomes

### 5.1 Product goals

1. Allow a user to discover verified blood-service facilities and recent availability summaries by district.
2. Allow a verified requester to create a documented blood request quickly.
3. Give facility staff a controlled queue to review, update, and resolve requests.
4. Maintain a simple, auditable availability record for participating facilities.
5. Allow opted-in donors to receive controlled outreach when a verified request cannot be fulfilled by facility stock.
6. Reduce manual coordination effort and increase transparency without exposing sensitive data.

### 5.2 Non-goals for the MVP

The MVP will not:

- Determine transfusion compatibility or provide medical advice.
- Diagnose a patient, validate a prescription clinically, or declare a donor medically fit.
- Operate a blood laboratory information system.
- Collect, test, transport, deliver, or transfuse blood.
- Guarantee inventory accuracy or fulfillment.
- Display individual donor identities or phone numbers publicly.
- Support cash payments, fundraising, or blood sales.
- Integrate with ambulances, maps for live driver routing, or home blood collection.
- Use AI to accept/reject prescriptions, determine urgency, or make clinical recommendations.
- Launch nationally before a controlled pilot and verified operating model exist.

### 5.3 Proposed pilot success measures

These are initial targets to validate during a pilot; baselines must be recorded before formal commitments are made.

| Metric | Definition | Pilot target |
|---|---|---|
| Search usability | A user can complete a district availability search without staff help | At least 85% in usability testing |
| Request completion time | Median time from starting the form to submitting a valid request | Under 5 minutes on mobile |
| Facility first response | Time from valid request submission to first facility status update | Under 30 minutes during staffed hours |
| Inventory freshness | Share of public inventory rows updated within the facility-defined refresh window | At least 90% |
| Request traceability | Requests with a complete status history and responsible actor | 100% |
| Donor privacy incidents | Unauthorized donor-data disclosures attributable to the platform | 0 |
| Document access audit coverage | Sensitive document opens that are logged | 100% |
| Emergency outreach delivery | Valid notification jobs that receive a provider delivery result | At least 95%, excluding user-device failures |
| Partner adoption | Verified facilities actively updating inventory during pilot | At least 3 pilot facilities |

---

## 6. Assumptions, constraints, and critical decisions

### 6.1 Working assumptions

- The first release is a pilot, not a national public service.
- The pilot begins in Morang because the proposal originates from Urlabari, Morang; this can be changed without redesigning the product.
- Participating hospitals or blood centres appoint named staff who are responsible for inventory and request decisions.
- Facility users can access a smartphone or desktop browser and have an email address or verified phone number.
- The platform can use an SMS provider, email provider, and secure object storage. Providers must be selected before implementation.
- English and Nepali are both required for critical public and request flows. Copy must be reviewed by native speakers.
- All dates are stored in UTC and displayed in Asia/Kathmandu time unless an authorized user selects another supported zone.

### 6.2 Clinical-policy constraint

The proposal mentions age at least 16 and a minimum 120-day donation interval. These must not be coded as permanent clinical rules. The product shall store them as configurable pre-screening policy values with:

- A policy name and version.
- Effective date and expiry/review date.
- Approval by a clinical safety lead.
- An explanation shown to users.
- A clear message that final eligibility is determined by the blood-service facility.

The application may label a donor as “preliminarily available” or “not currently eligible under the selected pre-screening policy.” It must never label a person medically eligible, medically ineligible, compatible, or cleared for donation.

### 6.3 Dependencies that must be resolved before launch

1. At least one approved clinical safety lead.
2. Written partnership or operating agreement with each pilot facility.
3. Current policy for donor pre-screening, request verification, stock refresh, donor outreach, and escalation.
4. Selected SMS/email provider and message-cost budget.
5. Privacy notice, consent text, terms of use, data-retention schedule, and incident-response owner.
6. Secure hosting, backups, domain, TLS certificate, monitoring, and support contact.
7. A runbook for after-hours requests and “no available stock” outcomes.

---

## 7. Stakeholders, roles, and personas

### 7.1 Stakeholders

| Stakeholder | Responsibility |
|---|---|
| Product owner | Owns scope, priorities, pilot success, and stakeholder decisions |
| Clinical safety lead | Approves policy settings, critical workflows, language, and medical boundaries |
| Facility administrator | Manages facility users, stock workflow, local operating hours, and request response |
| Inventory manager | Updates availability and resolves stock discrepancies |
| Request reviewer | Reviews requests and documents, updates status, and coordinates fulfillment |
| Donor coordinator | Manages donor outreach, donor availability, and response follow-up |
| Platform administrator | Verifies facilities, manages global settings, audits misuse, and supports users |
| Privacy/security owner | Reviews access controls, incidents, retention, and technical safeguards |
| Engineering team | Builds, tests, deploys, monitors, and fixes the system |
| QA and accessibility tester | Validates user flows, security controls, mobile usability, and regression coverage |

### 7.2 User personas

**A. Guest seeker:** A family member urgently looking for a nearby facility. They may not know blood terminology or have a strong internet connection. They need a simple search, clear next action, and no forced account before basic discovery.

**B. Registered requester:** A patient representative or authorized staff member who can submit and track a blood request. They need private document upload, reference number, updates, and a way to correct missing information.

**C. Voluntary donor:** A person willing to receive requests. They need control over when and how they are contacted, a low-friction availability update, privacy, and a clear acknowledgement that the facility makes final donation decisions.

**D. Facility inventory manager:** A staff member maintaining public availability. They need fast entry, last-update data, history, and guardrails against accidental errors.

**E. Facility request reviewer:** A staff member checking prescriptions and requests. They need a prioritized queue, document access, status controls, internal notes, and an emergency outreach action.

**F. Platform administrator:** A small trusted team that verifies facilities, manages reports, disables abusive accounts, and audits critical events. They need strict permissions and immutable logs.

### 7.3 User roles and permission matrix

| Capability | Guest | Requester | Donor | Facility inventory manager | Facility request reviewer | Facility administrator | Platform administrator |
|---|---:|---:|---:|---:|---:|---:|---:|
| Search public availability | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| View own profile | No | Yes | Yes | Yes | Yes | Yes | Yes |
| Submit a blood request | No | Yes | Optional if also requester | No | No | No | No |
| Upload/request documents | No | Yes | No | No | Review only | Review only | Exceptional audited access |
| Change own donor availability | No | Optional | Yes | No | No | No | No |
| View donor identity/contact data | No | No | Own only | No | Only when an approved campaign requires it | Facility policy only | Exceptional audited access |
| Update inventory | No | No | No | Yes | Optional read-only | Yes | Yes |
| Review requests | No | Own only | No | Read-only if assigned | Yes | Yes | Yes |
| Start emergency donor outreach | No | No | No | No | Yes, after verification | Yes | Yes |
| Verify facility | No | No | No | No | No | No | Yes |
| Manage facility staff | No | No | No | No | No | Yes | Yes |
| View global audits/reports | No | No | No | Facility scope only | Facility scope only | Facility scope only | Yes |

Permission checks must be enforced by the server. Hiding a button in the browser is not authorization.

---

## 8. MVP definition and release boundaries

### 8.1 MVP outcome

The MVP is successful when a verified facility can publish a privacy-safe availability summary; a requester can submit a documented request; authorized facility staff can review and update it; and, when stock is unavailable, staff can initiate a controlled donor outreach campaign without exposing personal contact details publicly.

### 8.2 Must-have MVP scope

1. Public district-level availability search.
2. Phone/email account registration and verification.
3. Requester profile and request creation wizard.
4. Secure PDF/JPG/PNG prescription upload and authorized manual review.
5. Facility onboarding and platform-admin verification.
6. Facility inventory entry, last-updated timestamp, adjustment history, and stale-data flag.
7. Facility request queue, internal notes, request status workflow, and requester updates.
8. Donor registration, consent, self-reported blood group, pre-screening, availability toggle, and opt-in notifications.
9. Controlled emergency donor outreach after facility verification and stock deficit.
10. In-app notifications plus one configurable external channel, preferably SMS or email.
11. Role-based access, audit events, rate limits, backups, and operational dashboards.
12. Mobile-responsive English and Nepali critical flows.

### 8.3 Explicitly deferred after MVP

| Capability | Reason for deferral | Target phase |
|---|---|---|
| Direct donor-requester chat | Privacy, moderation, and clinical-safety complexity | Phase 2 |
| GPS/live map and exact-distance ranking | Requires consent, location accuracy, and mapping-provider controls | Phase 2 |
| Appointment scheduling and donor slots | Needs facility operating workflows | Phase 2 |
| Barcode or QR unit tracking | Requires blood-bank operational integration | Phase 2 |
| Lab/LIS/HMIS integrations | Requires partner APIs, data contracts, and security review | Phase 3 |
| Automated prescription OCR or AI triage | Human verification must remain decisive; quality and risk need validation | Phase 3 |
| Multi-district peer inventory exchange | Requires formal inter-facility agreement and reconciliation rules | Phase 3 |
| Native Android/iOS applications | Responsive web validates demand first | Phase 3 |
| Home collection, delivery, ambulance routing | Operational service, not a software-only feature | Future decision |
| Payments, fundraising, marketplace features | Outside clinical coordination mission | Not planned |

---

## 9. Core operational model

### 9.1 Product entities

- **Organization:** A verified hospital, blood centre, or approved partner institution.
- **Facility:** A physical service location owned by an organization; a future organization may have multiple facilities.
- **Availability record:** A facility-entered count or availability state for a blood group and component at a point in time.
- **Requester:** The account holder submitting a request on behalf of a patient or facility.
- **Blood request:** A tracked demand record requiring facility review; it is not an automatic reservation or medical order.
- **Donor:** A person who has opted in to receive outreach and has a self-reported or facility-verified profile.
- **Emergency campaign:** A limited, auditable outreach event to potentially relevant opted-in donors.
- **Document:** A private file attached to a request or organization-verification process.

### 9.2 Request status lifecycle

The following state machine is mandatory. The server must reject invalid transitions.

~~~text
Draft
  -> Submitted
  -> Needs information
  -> Submitted
  -> Under review
  -> Verified
  -> Inventory located
  -> Reservation pending facility confirmation
  -> Fulfilled

Verified
  -> Inventory unavailable
  -> Donor outreach active
  -> Donor response received
  -> Facility follow-up
  -> Fulfilled / Unable to fulfill / Cancelled / Expired

Submitted / Under review / Needs information / Verified / Inventory located
  -> Rejected
  -> Cancelled
  -> Expired
~~~

Definitions:

- **Draft:** Stored only for the requester; not visible to facilities.
- **Submitted:** Data passed client validation and awaits review.
- **Needs information:** Facility requires missing or corrected information.
- **Under review:** A reviewer has accepted ownership of the queue item.
- **Verified:** A reviewer has manually verified the request is suitable for coordination under local policy. This does not mean medically approved for transfusion.
- **Inventory located:** A facility believes stock may be available; final facility confirmation remains required.
- **Inventory unavailable:** The reviewing facility cannot satisfy it with currently recorded availability.
- **Donor outreach active:** Authorized outreach has been sent to selected donors.
- **Facility follow-up:** A donor response exists and a facility coordinator must handle the next step.
- **Fulfilled:** The facility records that the coordination task is complete.
- **Unable to fulfill:** The facility records that no appropriate solution was found within the request window.
- **Rejected:** Request is invalid, duplicate, fraudulent, unsupported, or does not meet the operating criteria.
- **Cancelled:** Requester or reviewer closes it before fulfillment.
- **Expired:** The needed-by time passes without completion; reopening requires explicit staff action.

### 9.3 Donor availability lifecycle

~~~text
Registered
  -> Phone verified
  -> Consent recorded
  -> Preliminary profile complete
  -> Available / Unavailable / Temporarily deferred / Opted out

Available
  -> Contacted for campaign
  -> Accepted interest / Declined / No response
  -> Facility follow-up
  -> Available / Temporarily deferred / Unavailable
~~~

The system must distinguish:

- Self-reported blood group.
- Facility-verified blood group, if recorded.
- Pre-screening outcome.
- Operational availability.
- Medical eligibility, which is never decided by the system.

### 9.4 Emergency fallback model

The “Emergency Public Network” in the proposal is implemented in the MVP as a controlled fallback:

1. Facility reviewer verifies the request.
2. Facility checks its recorded stock and nearby verified partner availability.
3. If no suitable facility path is found, the reviewer selects “Start donor outreach.”
4. The system calculates a limited candidate set using policy-approved criteria such as district, self-reported/verified group, availability, consent, and prior contact frequency.
5. The system sends a privacy-safe invitation. It does not share the patient’s full identity, prescription, or requester contact data.
6. A donor may respond “I can be contacted,” “Not available,” or “Stop contacting me.”
7. A facility coordinator receives responses and handles the next step outside or within a later appointment workflow.
8. Every campaign, recipient set, message, response, and closure is auditable.

No automated campaign may be sent merely because a requester marks a request “urgent.” Facility verification is mandatory.

---

## 10. Detailed functional requirements

Priority notation:

- **P0:** Required for MVP launch.
- **P1:** Important after MVP or if pilot evidence demands it.
- **P2:** Future enhancement.

### 10.1 Public discovery and availability search

| ID | Requirement | Priority |
|---|---|---|
| FR-PUB-001 | The public landing page shall explain that Raktakosh coordinates availability and requests; it shall not promise blood or provide medical advice. | P0 |
| FR-PUB-002 | A guest shall be able to select district, blood group, Rh factor, component, and optional facility type without creating an account. | P0 |
| FR-PUB-003 | Search results shall show facility name, district, contact channel, operating-hours summary, availability state, and last verified/updated timestamp. | P0 |
| FR-PUB-004 | Public results shall not show unit-level lot details, patient data, donor data, staff names, internal notes, or raw inventory audit history. | P0 |
| FR-PUB-005 | An availability state shall be displayed as “Reported available,” “Limited/confirm with facility,” “Not reported,” or “Stale information,” rather than as a guarantee. | P0 |
| FR-PUB-006 | The public user shall have a visible action to begin a blood request and a clear emergency/facility contact fallback if the platform is unavailable. | P0 |
| FR-PUB-007 | Results shall support English and Nepali on critical public screens. | P0 |
| FR-PUB-008 | The application shall cache non-sensitive district and facility metadata for low-bandwidth viewing. | P1 |
| FR-PUB-009 | The application may show map view and route estimates only after consent and provider review. | P2 |

Acceptance criteria:

- A guest can search without creating an account.
- A stale record cannot appear as fresh; the UI must show the timestamp and stale label.
- Search does not reveal patient or donor information even when zero or one potential donor exists.
- A search query is rate-limited and logged without storing unnecessary search contents as personal data.

### 10.2 Identity, account, and consent management

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-001 | The system shall support requester and donor registration using a verified mobile number; email may be optional for public users and required for facility staff. | P0 |
| FR-AUTH-002 | The system shall require password creation meeting approved complexity requirements, or support passwordless OTP after a security review. | P0 |
| FR-AUTH-003 | The system shall verify the mobile number through an OTP with expiry, retry limits, and abuse controls. | P0 |
| FR-AUTH-004 | Facility staff accounts shall require an administrator invitation and verified email/phone before activation. | P0 |
| FR-AUTH-005 | Facility administrator and platform administrator accounts shall use multi-factor authentication before production launch. | P0 |
| FR-AUTH-006 | The application shall record acceptance of terms, privacy notice, donor contact consent, emergency outreach consent, and their document versions. | P0 |
| FR-AUTH-007 | Users shall be able to revoke optional donor-contact consent. Revocation stops future outreach but does not erase prior audit logs required for security or legal review. | P0 |
| FR-AUTH-008 | A user shall be able to request account deletion or data-access support through a documented workflow. | P1 |
| FR-AUTH-009 | Social sign-in shall not be included until privacy and account-recovery requirements are approved. | P2 |

Required validation:

- Mobile number normalized to E.164-compatible storage format.
- OTP expires after a configured interval.
- OTP attempts, password reset attempts, and login failures are rate-limited by account and IP/device signal.
- A phone number cannot silently activate multiple conflicting accounts without a merge/support workflow.
- Consent text version and timestamp are immutable after capture; later consent creates a new row.

### 10.3 Organization and facility onboarding

| ID | Requirement | Priority |
|---|---|---|
| FR-FAC-001 | A platform administrator shall create or review an organization profile before public availability is published. | P0 |
| FR-FAC-002 | The organization profile shall contain legal/operating name, facility type, district, address, service phone, public contact method, operating hours, and verification status. | P0 |
| FR-FAC-003 | Facility verification documents shall be uploaded privately and reviewed by a platform administrator. | P0 |
| FR-FAC-004 | A facility shall have a verification status of Draft, Submitted, Under review, Verified, Suspended, Rejected, or Expired. | P0 |
| FR-FAC-005 | Only Verified facilities may publish public availability, review requests, or initiate donor outreach. | P0 |
| FR-FAC-006 | Facility administrators shall invite staff and assign scoped roles. | P0 |
| FR-FAC-007 | The system shall maintain a list of districts, service areas, holidays, and operating-hours exceptions. | P0 |
| FR-FAC-008 | A facility may configure whether it accepts requests, publishes availability, receives partner referrals, and participates in donor outreach. | P0 |

### 10.4 Donor profile, pre-screening, and outreach consent

| ID | Requirement | Priority |
|---|---|---|
| FR-DON-001 | A donor shall be able to create a profile with minimum necessary identity and contact data. | P0 |
| FR-DON-002 | The donor form shall collect district, preferred contact channel, self-reported blood group/Rh factor, date of birth or policy-safe age band, last donation date if known, and availability preference. | P0 |
| FR-DON-003 | The donor shall explicitly opt in to receive emergency outreach; opt-in must not be preselected. | P0 |
| FR-DON-004 | The system shall run configurable pre-screening rules and show the result as guidance only. | P0 |
| FR-DON-005 | The donor shall be able to mark themselves Available, Unavailable, or Pause outreach. | P0 |
| FR-DON-006 | The donor shall be able to select preferred contact windows and maximum outreach frequency. | P0 |
| FR-DON-007 | The system shall prevent an outreach campaign from sending to a donor who opted out, is unavailable, has an active policy-defined cooldown, or is suspended. | P0 |
| FR-DON-008 | A facility may add a verified blood group and verification date only with an auditable staff action. | P1 |
| FR-DON-009 | A donor may manage appointment availability once appointment workflows are introduced. | P2 |

Minimum donor data policy:

- Do not request citizenship number, full medical history, or exact home address in the MVP unless the clinical/legal review makes a documented requirement.
- Store self-reported blood group separately from facility-verified blood group.
- Exact location is not needed for district-level MVP matching.
- The donor’s phone number is never shown on a public result or to an unverified requester.

### 10.5 Inventory and availability management

| ID | Requirement | Priority |
|---|---|---|
| FR-INV-001 | A verified facility shall be able to create availability records by ABO group, Rh factor, component, and quantity/status. | P0 |
| FR-INV-002 | Each inventory update shall store facility, editor, time, source, reason, previous value, new value, and optional note. | P0 |
| FR-INV-003 | The system shall distinguish on-hand quantity, reserved quantity, unavailable/quarantined quantity, and publicly reportable availability where the facility chooses to use counts. | P0 |
| FR-INV-004 | The system shall prevent available quantity from becoming negative and shall warn on contradictory values. | P0 |
| FR-INV-005 | Each public record shall show a last-updated timestamp and become stale after a configurable facility/global time window. | P0 |
| FR-INV-006 | Inventory managers shall be able to record an adjustment reason: routine count, request reservation, issue/correction, expiry, reconciliation, or other. | P0 |
| FR-INV-007 | Inventory managers shall be able to bulk update a grid safely, with preview and per-row validation. | P1 |
| FR-INV-008 | The system may integrate barcode/lot data from a blood bank system only after separate design and facility integration approval. | P2 |

MVP inventory rule:

Raktakosh records a coordination-facing availability summary. It is not the authoritative clinical inventory ledger unless a facility has formally integrated and validated it as such. The user interface must state this distinction for facility users and public users.

### 10.6 Blood request creation and document handling

| ID | Requirement | Priority |
|---|---|---|
| FR-REQ-001 | A verified requester shall be able to create a draft blood request and resume it later. | P0 |
| FR-REQ-002 | The request form shall collect minimum necessary patient/request details, blood group/component request, number of units/bags as prescribed, needed-by time, district/facility preference, and requester contact data. | P0 |
| FR-REQ-003 | The requester shall upload a prescription or supporting document when required by the facility workflow. | P0 |
| FR-REQ-004 | Accepted document formats shall initially be PDF, JPG, JPEG, and PNG; the maximum size and count shall be configurable. | P0 |
| FR-REQ-005 | Uploaded documents shall be stored privately, malware-scanned, integrity-hashed, and accessible only through short-lived authorized links. | P0 |
| FR-REQ-006 | The system shall show the request reference code immediately after successful submission. | P0 |
| FR-REQ-007 | The request form shall check obvious completeness, duplicate-risk signals, and invalid date/time before submission. | P0 |
| FR-REQ-008 | The requester shall see a status timeline, next required action, and facility-safe message; they shall not see internal clinical notes. | P0 |
| FR-REQ-009 | A requester may cancel an unfulfilled request; cancellation reason is optional for requester and mandatory for staff cancellation. | P0 |
| FR-REQ-010 | A requester may add information only while a request is Draft or Needs information, unless a reviewer explicitly reopens it. | P0 |
| FR-REQ-011 | The system shall support a verified staff-created request on behalf of a patient with an audit reason. | P1 |

Request field requirements:

| Field | Required | Notes |
|---|---:|---|
| Request reference | System-generated | Human-readable, non-sequential, e.g. RK-20260712-AB12 |
| Requester full name | Yes | Stored privately |
| Requester phone | Yes | Verified for self-service requesters |
| Relationship to patient | Yes | Self, family, guardian, hospital staff, other |
| Patient name or initials | Policy-controlled | Minimize data; restrict display |
| Patient age band | Policy-controlled | Prefer age band where sufficient |
| Requested ABO/Rh | Yes if known | Do not perform compatibility inference |
| Component | Yes | Whole blood, packed red cells, platelets, plasma, or facility-configured values |
| Quantity requested | Yes | Positive number; unit meaning clearly labeled |
| Needed-by date/time | Yes | Display local timezone |
| Preferred district/facility | Yes | Search constraint, not a guarantee |
| Clinical urgency label | Yes | User-selected; facility confirms operational priority |
| Prescription/supporting document | Conditional | Must state why it is needed |
| Additional note | Optional | Character limit and abuse filtering |

### 10.7 Facility request review and resolution

| ID | Requirement | Priority |
|---|---|---|
| FR-REV-001 | Authorized facility reviewers shall see a queue filtered by status, urgency label, needed-by time, district, blood group/component, and assignment. | P0 |
| FR-REV-002 | A reviewer shall be able to claim or assign a request to avoid duplicate staff handling. | P0 |
| FR-REV-003 | A reviewer shall be able to view authorized documents through a logged, expiring link. | P0 |
| FR-REV-004 | A reviewer shall update the request using only allowed status transitions and provide a structured reason for rejection, need-more-info, cancellation, or unable-to-fulfill. | P0 |
| FR-REV-005 | A reviewer shall record internal notes separately from requester-visible status messages. | P0 |
| FR-REV-006 | A reviewer shall be able to associate the request with a facility availability record without automatically decrementing clinical stock. | P0 |
| FR-REV-007 | A reviewer shall explicitly record whether an inventory lead, partner referral, or donor outreach path was selected. | P0 |
| FR-REV-008 | High-risk actions including request verification, donor campaign launch, and final fulfillment shall create audit events. | P0 |
| FR-REV-009 | A facility may configure staffed hours and after-hours message templates. | P0 |

### 10.8 Controlled donor outreach

| ID | Requirement | Priority |
|---|---|---|
| FR-OUT-001 | Only an authorized reviewer at a Verified facility or a platform administrator shall launch donor outreach. | P0 |
| FR-OUT-002 | Outreach shall require a Verified request and a recorded stock/partner-availability outcome. | P0 |
| FR-OUT-003 | The system shall select only donors who are opted in, available, within policy-approved district/service coverage, and outside the contact cooldown. | P0 |
| FR-OUT-004 | The reviewer shall see only the candidate count before launch unless their role is specifically allowed to see identities. | P0 |
| FR-OUT-005 | The outreach message shall contain a minimal request summary, facility identity, response action, and opt-out instruction; it shall not include patient name or document. | P0 |
| FR-OUT-006 | A donor response shall be recorded as Interested, Not available, Stop outreach, or No response. | P0 |
| FR-OUT-007 | The system shall limit campaign recipient count, expiry, retries, and re-contact frequency using configurable policy settings. | P0 |
| FR-OUT-008 | Campaign recipients shall not be visible to the requester. | P0 |
| FR-OUT-009 | The system shall create a facility follow-up task for each Interested response. | P0 |
| FR-OUT-010 | The system shall not infer donor medical eligibility or auto-book a donation. | P0 |

### 10.9 Notifications and communication

| ID | Requirement | Priority |
|---|---|---|
| FR-NOT-001 | The application shall support in-app notifications for registered users. | P0 |
| FR-NOT-002 | The application shall support one external channel through a provider abstraction; SMS is recommended for pilot reach. | P0 |
| FR-NOT-003 | Notification jobs shall be queued, retried safely, and record provider delivery state where available. | P0 |
| FR-NOT-004 | Users shall be able to control non-essential notification preferences. Critical transactional messages remain subject to the service terms and applicable consent. | P0 |
| FR-NOT-005 | The system shall use approved templates for OTP, request received, information needed, status update, outreach invitation, outreach response, and account security events. | P0 |
| FR-NOT-006 | External notification payloads shall contain the minimum data needed and no prescription/document links. | P0 |
| FR-NOT-007 | Full private chat shall not be part of MVP; facility contact relay and status messages are the safe initial alternative. | P0 |

### 10.10 Administration, support, and reporting

| ID | Requirement | Priority |
|---|---|---|
| FR-ADM-001 | Platform administrators shall manage districts, blood components, policy versions, facility verification, user status, and public content. | P0 |
| FR-ADM-002 | Administrators shall be able to suspend accounts and facilities with a reason, effective time, and audit event. | P0 |
| FR-ADM-003 | Administrators shall have a searchable audit viewer with filters for actor, entity, action, date, facility, and outcome. | P0 |
| FR-ADM-004 | Facility administrators shall see facility-scoped reports for requests, response time, inventory freshness, and donor outreach. | P0 |
| FR-ADM-005 | The application shall export non-sensitive operational reports as CSV with permission checks and export audit logs. | P0 |
| FR-ADM-006 | Administrators shall be able to manage content and emergency contact instructions without code deployment. | P1 |
| FR-ADM-007 | The system shall support anonymized aggregate reporting for pilot evaluation. | P1 |

---

## 11. Business rules and validation rules

### 11.1 General rules

1. Every record has an immutable UUID, creation time, update time, and actor where applicable.
2. All timestamps are stored in UTC; local display uses Asia/Kathmandu for pilot users.
3. A user can be a requester and donor, but the product shall keep role-specific consent and profile data separate.
4. A facility staff member can act only inside their assigned organization/facility scope unless they are a platform administrator.
5. Public inventory is derived from a facility-approved public availability field, not necessarily the full on-hand quantity.
6. The system must not publicly display a facility’s contact phone number if the facility selects contact relay only.
7. Internal notes, reviewer actions, and documents are never included in a public search result or requester-visible response by default.
8. All state changes require optimistic-concurrency protection so an old browser tab cannot overwrite a newer staff decision.

### 11.2 Donor pre-screening rules

The pre-screening engine uses a policy table, not application constants. An approved policy may evaluate:

- Minimum/maximum age or age band.
- Date since last donation.
- Consent active.
- Verified phone number.
- Selected availability status.
- Facility-defined contact cooldown.
- Active temporary deferral flag.

Required behavior:

- Display the exact policy version applied.
- Show a plain-language result and next action.
- Allow the donor to correct a date or mark it unknown.
- Do not collect additional medical data merely to automate a decision.
- Log rule evaluation version and result without exposing it to unauthorized staff.
- Send final decisions to the facility workflow, never to an automated medical conclusion.

### 11.3 Inventory rules

1. A facility must be Verified and active before creating public availability.
2. A component and blood group must exist in a platform-admin-managed reference list.
3. Quantities are non-negative integers unless the facility is using category-only availability.
4. Reserved quantity cannot exceed on-hand quantity.
5. Reportable availability cannot exceed the facility-defined available quantity.
6. Inventory adjustment requires a reason and records before/after values.
7. A stale inventory record is excluded from default “reported available” ranking unless the user explicitly includes stale results.
8. An inventory update does not automatically fulfill a request; a reviewer must record the associated request action.

### 11.4 Request rules

1. A submitted request needs a verified phone and all required workflow fields.
2. The system must generate a non-guessable reference code.
3. Duplicate detection uses requester contact, patient identifier/minimized fields, component/group, needed-by time, and recent submissions; it warns instead of silently discarding.
4. A document cannot be opened before it passes file validation and malware scan.
5. A request may be escalated to donor outreach only after a reviewer verifies it and records the inventory/partner result.
6. Rejected, cancelled, and unable-to-fulfill requests require a standardized reason; free text is optional and limited.
7. The requester can see status but not internal reviewer identity unless a facility chooses to display a public support contact.

### 11.5 Anti-abuse rules

- OTP request throttling by phone, IP, and device signal.
- CAPTCHA or equivalent challenge after suspicious repeated public searches, registration, OTP, or request attempts.
- Request creation rate limit for a user and verified phone.
- File count/size/type validation before storage.
- Malicious-file scan quarantine before reviewer access.
- Audit alert when an admin downloads many documents, exports large datasets, or changes policy settings.
- Suspicious accounts are soft-suspended, preserving evidence while preventing sensitive actions.

---

## 12. User journeys

### Journey A: Guest searches for a facility

1. Guest opens the public landing page.
2. Guest selects district, blood group/Rh, and component.
3. System validates the filters and returns privacy-safe facility availability results.
4. Guest reads the last-updated time and availability disclaimer.
5. Guest either contacts the listed facility or starts a request.
6. If no suitable current record exists, the page explains how to submit a request or use approved emergency contact guidance.

Success condition: the guest understands that the result is a coordination lead, not a guarantee.

### Journey B: Requester submits a documented request

1. Requester searches public availability.
2. Requester chooses “Create request.”
3. Requester creates/verifies an account or signs in.
4. Requester fills the guided form, uploads the required document, and confirms privacy notice.
5. System validates the form, scans the document, and creates a reference code.
6. System sends an acknowledgement and creates a request in the selected facility queue.
7. Requester sees a timeline and status updates.

Success condition: requester receives a reference and knows the next expected action without seeing internal details.

### Journey C: Facility reviews and resolves request with inventory

1. Reviewer opens the request queue and claims a request.
2. Reviewer checks the document and request data.
3. Reviewer marks it Under review and, if appropriate, Verified.
4. Reviewer checks facility availability and optionally partner directory.
5. Reviewer records “Inventory located” or a facility-specific resolution path.
6. Reviewer sends a safe requester-visible status update.
7. Reviewer records Fulfilled only after the facility coordination is complete.

Success condition: every decision is time-stamped, attributed, and visible at the appropriate privacy level.

### Journey D: Facility has no available inventory

1. Reviewer verifies a valid request and records Inventory unavailable.
2. Reviewer confirms that partner-facility options have been checked or are unavailable.
3. Reviewer starts a donor campaign with configured recipient cap and expiry.
4. System sends a minimal invitation to eligible opt-in donors.
5. Interested donor responses create follow-up items for the facility coordinator.
6. Facility follows up using approved process, then updates the request outcome.

Success condition: donor contact data stays protected and no automated system declares the request medically fulfilled.

### Journey E: Donor manages availability

1. Donor registers and verifies phone.
2. Donor enters minimal profile data and gives explicit outreach consent.
3. System runs configurable pre-screening and explains the result.
4. Donor selects Available, Unavailable, or Pause outreach.
5. Donor later receives an outreach invitation, responds, or opts out.

Success condition: donor remains in control of contact preferences and understands the facility makes final eligibility decisions.

---

## 13. Required screens and user interface specification

### 13.1 Public screens

| Screen | Purpose | Required elements |
|---|---|---|
| Landing page | Explain service and allow immediate search | Clear disclaimer, district search, emergency information, language switcher, sign in/register |
| Availability search | Find facility-level availability summaries | Filters, result cards/table, timestamp, stale flag, facility contact/relay action, “create request” |
| Facility public profile | Show verified public facility information | Facility name, verification badge, district, public hours, contact method, service area, availability summary |
| Help and safety page | Explain what platform can/cannot do | Medical disclaimer, emergency alternatives, privacy explanation, accessibility help |

### 13.2 Requester screens

| Screen | Purpose | Required elements |
|---|---|---|
| Registration / sign-in | Create or access account | Phone/email fields, OTP entry, password reset, consent link, rate-limit feedback |
| Request wizard | Submit blood request | Progress stepper, required fields, validation, document uploader, save draft, summary review |
| Request confirmation | Confirm submission | Reference code, expected response window, next steps, safe contact instruction |
| Request detail | Track request | Status timeline, requester-visible messages, document status, cancellation, update-info action where allowed |
| Notification centre | View service messages | Read/unread list, status links, preference link |
| Profile and privacy | Manage personal data | Contact info, consent history, request account help, language preference |

### 13.3 Donor screens

| Screen | Purpose | Required elements |
|---|---|---|
| Donor onboarding | Create donor profile and consent | Blood group status, district, contact consent, policy-safe screening fields, disclaimers |
| Donor dashboard | Manage availability | Current availability, last contact, contact preferences, pre-screening result, update action |
| Outreach invitation | Respond to a campaign | Minimal summary, facility identity, Interested/Not available/Stop outreach buttons, expiry |
| Donor privacy settings | Control contact | Consent toggle, preferred contact windows, frequency preference, account deletion request |

### 13.4 Facility and platform administration screens

| Screen | Purpose | Required elements |
|---|---|---|
| Facility dashboard | Operational overview | Current inventory freshness, request queue counts, pending documents, campaign status, alerts |
| Inventory grid | Manage availability | Component/group rows, quantities/status, last update, stale warnings, bulk update preview, adjustment history |
| Request queue | Triage requests | Filters, SLA indicator, claim/assign, status, urgency label, needed-by time, secure document badge |
| Request review | Review a single request | Required data, document viewer, status actions, internal note, requester-visible message, matching/outreach actions |
| Donor campaign builder | Launch controlled outreach | Eligibility summary, candidate count, message template, cap, expiry, approval confirmation |
| Facility staff | Manage local access | Invite, role, account status, last login, revoke action |
| Facility profile/settings | Manage public profile | Hours, services, public contact choice, participation flags, local templates |
| Platform admin console | Govern the platform | Facility verification, policy settings, users, suspensions, audit log, report exports, incident flags |

### 13.5 UX requirements

1. All primary actions must be usable on a 360-pixel-wide mobile viewport.
2. Forms use one column on mobile, clear labels, no placeholder-only labels, and inline validation.
3. Every status has an icon, text label, and explanation; color is never the only signal.
4. The application must provide keyboard navigation, visible focus, sufficient contrast, and semantic headings.
5. File upload shows allowed types, maximum size, upload progress, scan state, and failure recovery.
6. Time-sensitive content shows absolute date/time with time zone, not only “today” or “tomorrow.”
7. A user who loses connection while filling a request receives a local draft/retry warning where safely possible.

---

## 14. Data model and data governance

### 14.1 Data-design principles

1. Store the minimum data needed to coordinate the service.
2. Separate public facility information from private personal information.
3. Separate self-reported health-adjacent information from facility-verified data.
4. Use UUIDs for externally exposed identifiers; do not expose auto-increment database IDs.
5. Store sensitive documents outside the relational database in private object storage.
6. Keep an audit trail of read, write, export, and permission-changing events.
7. Avoid deleting evidence of a security event automatically; use a documented retention and legal-hold process.
8. Use soft deletion for operational entities where restoration/audit is required, and hard-delete files only under the approved retention workflow.

### 14.2 Data classification

| Classification | Examples | Storage/access rule |
|---|---|---|
| Public | Facility name, district, public hours, public availability state, help text | May be cached and indexed; never contains individual health data |
| Internal operational | Request status, inventory adjustment reason, facility staff assignment, campaign counts | Restricted to authorized facility/platform roles |
| Sensitive personal data | Name, phone, email, date of birth/age band, patient details, donor profile | Encrypt in transit; restrict by role; do not place in analytics events |
| Highly sensitive document/health-adjacent data | Prescription image/PDF, request supporting document, verified identity/facility documents | Private object storage, short-lived signed links, malware scan, access audit |
| Security data | Password hashes, OTP hashes, session metadata, IP risk indicators, audit events | Never show to ordinary users; retain according to security policy |

### 14.3 Core tables

The exact schema may differ by framework, but the following logical tables and fields are required.

#### users

| Field | Type / rule | Purpose |
|---|---|---|
| id | UUID primary key | Internal identity |
| public_reference | Short random string | Support-safe reference if needed |
| full_name | Encrypted/controlled text | Account identity |
| phone_e164 | Unique normalized string | Login, verification, critical contact |
| email | Nullable normalized string | Facility staff contact and recovery |
| password_hash | Secure hash | Never readable |
| phone_verified_at | Timestamp/null | Verification state |
| email_verified_at | Timestamp/null | Staff verification state |
| status | Active, Pending, Suspended, Deleted, Locked | Account governance |
| preferred_language | en, ne, etc. | Localized content |
| last_login_at | Timestamp/null | Security monitoring |
| created_at / updated_at / deleted_at | Timestamps | Lifecycle |

#### roles and user_roles

| Field | Purpose |
|---|---|
| roles.id, name, scope | Defines platform, organization, facility, requester, donor permissions |
| user_roles.user_id | Links user |
| user_roles.role_id | Links assigned role |
| user_roles.organization_id/facility_id | Limits facility staff to correct scope |
| assigned_by / assigned_at / revoked_at | Makes access changes auditable |

#### consents

| Field | Purpose |
|---|---|
| id, user_id | Identifies consent record |
| consent_type | Terms, privacy, donor outreach, optional marketing, data sharing |
| granted | True/false |
| document_version | Exact copy/version accepted |
| source | Web signup, profile update, staff-assisted |
| captured_at, withdrawn_at | Consent timing |
| evidence_metadata | Versioned copy, minimal device/IP hash if approved |

#### organizations

| Field | Purpose |
|---|---|
| id, name, legal_name | Operating identity |
| organization_type | Blood centre, hospital blood unit, hospital, approved partner |
| verification_status | Draft, Submitted, Under review, Verified, Suspended, Rejected, Expired |
| public_contact_mode | Phone, email, contact relay, none |
| verified_at, verified_by | Governance |
| suspension_reason | Abuse/expiry protection |

#### facilities

| Field | Purpose |
|---|---|
| id, organization_id | Ownership |
| name, public_name | Display name |
| district_id, local_address | Service location |
| latitude/longitude | Null in MVP unless location consent/need is approved |
| public_phone, public_email | Optional, policy-governed |
| operating_hours_json | Standard weekly hours |
| operating_exceptions | Holidays, closure |
| accepts_requests | Facility capability flag |
| publishes_availability | Facility capability flag |
| accepts_partner_referrals | Facility capability flag |
| participates_in_donor_outreach | Facility capability flag |
| status | Active, Inactive, Suspended |

#### facility_verification_documents

| Field | Purpose |
|---|---|
| id, facility_id | Relationship |
| document_type | License, authorization, address confirmation, other |
| storage_key, checksum, mime_type, size_bytes | Private file data |
| scan_status | Pending, Clean, Rejected, Failed |
| review_status | Pending, Approved, Rejected |
| reviewed_by, reviewed_at, reviewer_note | Manual verification |

#### blood_groups and components

These are controlled reference tables rather than free text.

| Table | Examples |
|---|---|
| blood_groups | A, B, AB, O; Rh positive, Rh negative, unknown |
| components | Whole blood, packed red cells, platelets, fresh frozen plasma; values configured by clinical lead |
| districts | Country/province/district hierarchy and active flag |

#### donor_profiles

| Field | Purpose |
|---|---|
| id, user_id | One profile per donor account |
| district_id | District-level coverage |
| self_reported_abo, self_reported_rh | User-provided values |
| verified_abo, verified_rh | Optional facility-verified values |
| blood_group_verified_at/by | Verification provenance |
| date_of_birth or age_band | Policy-selected minimal data |
| last_donation_date | Optional; supports pre-screening |
| availability_status | Available, Unavailable, Paused, Temporarily deferred |
| preferred_contact_channel | SMS, email, in-app |
| contact_window | User preference |
| max_outreach_frequency | User preference/policy limit |
| preliminary_screening_status | Informational status |
| screening_policy_version | Reproducibility |
| active_deferral_until | Operational cooldown only; not a medical record |
| profile_completed_at | Onboarding state |

#### donor_screening_events

| Field | Purpose |
|---|---|
| id, donor_profile_id | Relationship |
| policy_version | Rule set used |
| evaluated_at | Timing |
| inputs_snapshot_json | Minimal record of input values needed to explain result |
| result | Preliminary available, needs update, unavailable under policy |
| explanation_code | User-facing approved reason code |
| evaluated_by | System or authorized staff |

#### inventory_snapshots and inventory_items

Use snapshots or versioned records to retain a complete history.

| Field | Purpose |
|---|---|
| inventory_snapshots.id, facility_id | One grouped update event |
| recorded_by, recorded_at | Accountability |
| source | Manual entry, import, reconciliation, integration |
| note | Optional operational note |
| inventory_items.snapshot_id | Links individual blood group/component row |
| blood_group_id, component_id | Controlled values |
| on_hand_quantity | Facility internal count where used |
| reserved_quantity | Coordination reservation count where used |
| unavailable_quantity | Quarantine/other non-reportable count where used |
| public_availability_status | Reported available, limited, unavailable, not reported |
| public_available_quantity | Optional public count, subject to facility policy |
| expires_at / stale_after_at | Freshness controls |
| revision_number | Optimistic concurrency |

#### inventory_adjustments

| Field | Purpose |
|---|---|
| id, facility_id, inventory_item_key | Adjusted record |
| previous values / new values | Before/after audit |
| adjustment_reason | Controlled list |
| request_id | Optional associated request |
| actor_id, occurred_at | Accountability |
| note | Optional explanation |

#### blood_requests

| Field | Purpose |
|---|---|
| id, reference_code | Internal and support-safe identifiers |
| requester_user_id | Owner |
| assigned_facility_id | Chosen/assigned facility |
| preferred_district_id | Geographic request |
| requester_relationship | Patient/self/guardian/etc. |
| patient_display_name | Minimized/encrypted only if necessary |
| patient_age_band | Minimized data |
| requested_blood_group_id, requested_component_id | Need description |
| requested_quantity | Positive integer |
| needed_by_at | Deadline |
| urgency_label | User-selected; not automated clinical triage |
| status | State machine status |
| status_reason_code | Controlled reason |
| requester_visible_message | Safe response text |
| assigned_reviewer_id | Queue ownership |
| source | Self-service, facility-created, support-assisted |
| submitted_at, verified_at, fulfilled_at, closed_at | Process timestamps |
| version | Optimistic concurrency |

#### request_documents

| Field | Purpose |
|---|---|
| id, blood_request_id | Relationship |
| document_type | Prescription, supporting document, correction, other |
| original_filename | Sanitized display name |
| storage_key | Private object key |
| checksum_sha256 | Integrity |
| mime_type, size_bytes | Validation |
| upload_status | Pending, Uploaded, Quarantined, Ready, Rejected |
| scan_status | Pending, Clean, Malicious, Error |
| review_status | Not required, Pending, Accepted, Rejected |
| reviewed_by, reviewed_at, review_note | Manual review |

#### request_status_events and request_notes

| Field | Purpose |
|---|---|
| request_status_events.id, request_id | Status history |
| from_status, to_status | State transition |
| reason_code, requester_visible_message | Explanation |
| actor_id, occurred_at | Accountability |
| request_notes.visibility | Internal or requester-visible |
| request_notes.body | Limited and sanitized text |

#### request_resolution_paths

| Field | Purpose |
|---|---|
| id, request_id | Relationship |
| path_type | Facility inventory, partner referral, donor outreach, unable to fulfill |
| facility_id / partner_facility_id | Source/target where relevant |
| outcome | Selected, attempted, succeeded, failed |
| actor_id, created_at | Audit |

#### donor_campaigns and donor_campaign_recipients

| Field | Purpose |
|---|---|
| donor_campaigns.id, request_id, facility_id | Campaign scope |
| created_by, approved_by | Dual-accountability option |
| status | Draft, Active, Expired, Closed, Cancelled |
| criteria_snapshot_json | Criteria used |
| recipient_limit, recipient_count | Exposure control |
| template_version | Message audit |
| starts_at, expires_at, closed_at | Timing |
| donor_campaign_recipients.campaign_id, donor_profile_id | Recipient link |
| delivery_status | Queued, Sent, Delivered, Failed |
| response | Interested, Not available, Stop outreach, No response |
| responded_at | Timing |
| follow_up_status | Pending, Contacted, Closed |

#### notifications

| Field | Purpose |
|---|---|
| id, user_id | Recipient |
| event_type | OTP, request update, outreach, security, etc. |
| channel | In-app, SMS, email |
| template_version | Content control |
| payload_reference | No raw sensitive content in logs |
| status | Queued, sent, delivered, failed, read |
| provider_message_id | Provider reconciliation |
| attempts, next_attempt_at | Reliable delivery |

#### audit_events

| Field | Purpose |
|---|---|
| id, occurred_at | Event timestamp |
| actor_type, actor_id | User/system actor |
| facility_id / organization_id | Scope |
| action | e.g. document.viewed, request.status_changed |
| entity_type, entity_id | Object acted upon |
| result | Success, denied, failure |
| request_id/correlation_id | Trace request path |
| before_summary, after_summary | Redacted diff |
| source_ip_hash, user_agent_summary | Security evidence |

### 14.4 Logical entity relationship diagram

~~~mermaid
erDiagram
  USERS ||--o{ USER_ROLES : receives
  USERS ||--o{ CONSENTS : grants
  USERS ||--o| DONOR_PROFILES : owns
  ORGANIZATIONS ||--o{ FACILITIES : operates
  FACILITIES ||--o{ INVENTORY_SNAPSHOTS : records
  INVENTORY_SNAPSHOTS ||--o{ INVENTORY_ITEMS : contains
  USERS ||--o{ BLOOD_REQUESTS : submits
  FACILITIES ||--o{ BLOOD_REQUESTS : reviews
  BLOOD_REQUESTS ||--o{ REQUEST_DOCUMENTS : contains
  BLOOD_REQUESTS ||--o{ REQUEST_STATUS_EVENTS : has
  BLOOD_REQUESTS ||--o{ DONOR_CAMPAIGNS : may_trigger
  DONOR_CAMPAIGNS ||--o{ DONOR_CAMPAIGN_RECIPIENTS : sends_to
  DONOR_PROFILES ||--o{ DONOR_CAMPAIGN_RECIPIENTS : receives
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ AUDIT_EVENTS : performs
~~~

### 14.5 Retention and deletion policy requirements

The final retention schedule must be approved before production. The application shall make the following categories configurable and enforceable:

| Data class | Proposed handling for review |
|---|---|
| OTP values | Store hash only; expire in minutes; delete/aggregate promptly after use |
| Failed login and abuse telemetry | Retain only as long as security investigation/monitoring requires |
| Draft requests | Auto-expire after a configurable short period unless user resumes |
| Rejected/cancelled document files | Delete after approved short retention unless incident/legal hold applies |
| Fulfilled-request documents | Retain according to participating facility and legal policy, then securely delete |
| Donor contact preferences | Retain while account is active; preserve consent withdrawal evidence |
| Audit events | Retain under a longer, protected operational/security schedule |
| Backups | Encrypted, access-restricted, lifecycle-managed, and tested for restoration |

Deletion must be a workflow, not a simple database button. It must consider active requests, audit obligations, backup lifecycle, legal holds, and facility policy.

---

## 15. API and integration specification

### 15.1 API principles

1. Use HTTPS only.
2. Use versioned REST endpoints under /api/v1.
3. Use JSON request/response bodies except multipart file uploads.
4. Use server-side authorization on every endpoint.
5. Return a correlation ID with every response for support and audit.
6. Use UUIDs and public reference codes; never expose database sequence IDs.
7. Use idempotency keys for request submission, inventory update, campaign launch, and notification-triggering actions.
8. Paginate all list endpoints and cap maximum page size.
9. Validate payloads on server even if client validation exists.
10. Log metadata, not sensitive documents or passwords.

### 15.2 Standard API response contract

Successful response:

~~~json
{
  "data": {},
  "meta": {
    "correlation_id": "uuid",
    "timestamp": "2026-07-12T10:30:00Z"
  }
}
~~~

Error response:

~~~json
{
  "error": {
    "code": "REQUEST_INVALID",
    "message": "Please correct the highlighted fields.",
    "fields": {
      "needed_by_at": ["A future date and time is required."]
    }
  },
  "meta": {
    "correlation_id": "uuid"
  }
}
~~~

Error messages must not reveal whether an unverified phone number, donor profile, or account exists unless the user is already authenticated and authorized.

### 15.3 Public endpoints

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| GET | /api/v1/public/districts | List active districts | None |
| GET | /api/v1/public/blood-groups | List controlled blood-group values | None |
| GET | /api/v1/public/components | List active component values | None |
| GET | /api/v1/public/availability | Search public availability summaries | None, rate-limited |
| GET | /api/v1/public/facilities/{publicId} | Facility public profile | None |
| GET | /api/v1/public/content/{slug} | Help, privacy summary, emergency content | None |

Example availability query:

~~~text
GET /api/v1/public/availability?district_id=uuid&abo=O&rh=positive&component=packed_red_cells
~~~

The result must include:

- Facility public ID and display name.
- District and facility type.
- Requested group/component.
- Availability state, not a guarantee.
- Last updated timestamp and stale flag.
- Public operating-hours summary.
- Public action mode: call, email, contact relay, submit request.

### 15.4 Authentication and profile endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/v1/auth/register | Start requester/donor registration |
| POST | /api/v1/auth/otp/request | Send verification OTP |
| POST | /api/v1/auth/otp/verify | Verify OTP |
| POST | /api/v1/auth/login | Authenticate |
| POST | /api/v1/auth/logout | End current session |
| POST | /api/v1/auth/password/forgot | Start reset |
| POST | /api/v1/auth/password/reset | Complete reset |
| POST | /api/v1/auth/mfa/verify | Verify staff MFA |
| GET | /api/v1/me | Current user/profile/roles |
| PATCH | /api/v1/me | Update allowed profile fields |
| GET | /api/v1/me/consents | Consent history |
| POST | /api/v1/me/consents | Grant/withdraw consent |
| GET | /api/v1/me/notifications | Notification list |
| PATCH | /api/v1/me/notifications/{id}/read | Mark notification read |

### 15.5 Donor endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/v1/donor/profile | Get own donor profile |
| PUT | /api/v1/donor/profile | Create/update donor profile |
| POST | /api/v1/donor/pre-screen | Evaluate current policy with supplied profile values |
| PATCH | /api/v1/donor/availability | Set Available/Unavailable/Paused |
| PATCH | /api/v1/donor/preferences | Set contact channel/window/frequency |
| GET | /api/v1/donor/outreach | List own campaign invitations |
| POST | /api/v1/donor/outreach/{campaignPublicId}/respond | Interested/not-available/stop-outreach response |

The pre-screen endpoint must return a policy version and user-safe explanation. It must not return “medically eligible.”

### 15.6 Requester endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/v1/requests | Create request draft or submit valid request |
| GET | /api/v1/requests | List own requests |
| GET | /api/v1/requests/{referenceCode} | View own request detail |
| PATCH | /api/v1/requests/{referenceCode} | Update Draft/Needs-information fields |
| POST | /api/v1/requests/{referenceCode}/submit | Submit draft |
| POST | /api/v1/requests/{referenceCode}/documents | Start/document upload |
| DELETE | /api/v1/requests/{referenceCode}/documents/{documentId} | Remove permitted draft document |
| POST | /api/v1/requests/{referenceCode}/cancel | Cancel request |

For browser uploads, the backend may create a short-lived upload authorization; the final document record must not become reviewer-visible until the object is uploaded, validated, and scanned.

### 15.7 Facility operational endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/v1/facility/dashboard | Facility scoped dashboard |
| GET | /api/v1/facility/inventory | Current inventory/availability grid |
| POST | /api/v1/facility/inventory/snapshots | Create inventory snapshot/update |
| GET | /api/v1/facility/inventory/history | View authorized history |
| GET | /api/v1/facility/requests | Queue/filter requests |
| GET | /api/v1/facility/requests/{requestId} | Review request detail |
| POST | /api/v1/facility/requests/{requestId}/claim | Claim queue item |
| POST | /api/v1/facility/requests/{requestId}/assign | Assign reviewer |
| POST | /api/v1/facility/requests/{requestId}/transition | Perform validated status change |
| POST | /api/v1/facility/requests/{requestId}/notes | Add internal or approved visible note |
| POST | /api/v1/facility/requests/{requestId}/resolution-path | Record inventory/partner/outreach path |
| POST | /api/v1/facility/requests/{requestId}/campaigns | Create donor outreach campaign |
| GET | /api/v1/facility/campaigns | List facility campaigns |
| GET | /api/v1/facility/campaigns/{id} | Campaign details and authorized recipient data |
| POST | /api/v1/facility/campaigns/{id}/close | Close/cancel campaign |
| GET | /api/v1/facility/staff | List staff |
| POST | /api/v1/facility/staff/invitations | Invite staff |
| PATCH | /api/v1/facility/staff/{userId}/role | Change scoped role |

### 15.8 Platform administration endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/v1/admin/facilities | Search verification queue |
| POST | /api/v1/admin/facilities | Create facility/organization |
| POST | /api/v1/admin/facilities/{id}/verify | Approve/reject/suspend facility |
| GET | /api/v1/admin/users | Search users under strict audit |
| POST | /api/v1/admin/users/{id}/suspend | Suspend account |
| GET | /api/v1/admin/policies | List policy versions |
| POST | /api/v1/admin/policies | Draft new policy |
| POST | /api/v1/admin/policies/{id}/publish | Publish approved policy |
| GET | /api/v1/admin/audit-events | Search audit log |
| POST | /api/v1/admin/reports/exports | Request audited export |
| GET | /api/v1/admin/system-health | Restricted operational health |

### 15.9 External integrations

The integration layer must use interfaces/adapters so providers can be changed without rewriting product logic.

| Integration | MVP use | Required controls |
|---|---|---|
| SMS provider | OTP and critical transactional notices | Template approval, delivery status, opt-out text, failure retry, cost limits |
| Email provider | Facility invitations, optional notices | Domain authentication, delivery monitoring, no sensitive attachment links |
| Private object storage | Prescriptions and verification documents | Encryption, private buckets, signed URLs, lifecycle rules, access logs |
| Malware scanner | Uploaded files | Quarantine before access, scan status, failure path |
| Queue/worker | Notifications, scanning, exports, scheduled stale checks | Retry policy, idempotency, dead-letter monitoring |
| Monitoring/error tracking | Reliability/security operations | PII scrubbing, alert ownership, retention controls |
| Maps/geocoding | Not MVP-critical | Defer until policy and provider review |
| Blood bank/LIS/HMIS APIs | Future | Formal contracts, consent, data mapping, security review |

### 15.10 Webhooks and asynchronous jobs

Required background jobs:

- Send OTP.
- Expire OTP.
- Scan uploaded document.
- Send request acknowledgement.
- Send facility/requester status notification.
- Mark availability stale.
- Start/expire/close donor campaign.
- Send campaign notifications.
- Reconcile notification-provider delivery reports.
- Produce scheduled facility reports.
- Delete/retain data according to approved lifecycle policy.
- Generate audit alerts for suspicious actions.

Every job requires an idempotency key, retry policy, failure alert, and correlation ID.

---

## 16. Recommended technical architecture

### 16.1 Architecture decision

The proposal’s HTML/CSS/JavaScript, PHP 8, and MySQL direction is appropriate for an educational MVP. For maintainability and security, use a supported PHP 8.2+ release with Laravel rather than unstructured raw PHP files. Laravel provides routing, request validation, authentication, queues, migrations, authorization policies, and test tooling while preserving the proposal’s PHP/MySQL stack.

### 16.2 Logical architecture

~~~mermaid
flowchart TB
  G[Guest / Requester / Donor browser]
  F[Facility staff browser]
  A[Platform admin browser]
  W[Responsive web UI<br/>Blade + HTML/CSS/JavaScript]
  API[Laravel application API<br/>Authentication, workflows, authorization]
  DB[(MySQL 8<br/>Operational data)]
  OBJ[(Private object storage<br/>Documents)]
  Q[Queue worker / scheduler]
  N[SMS and email adapters]
  M[Monitoring, audit alerts, backups]
  AV[Malware scanning service]

  G --> W
  F --> W
  A --> W
  W --> API
  API --> DB
  API --> OBJ
  API --> Q
  Q --> N
  Q --> AV
  API --> M
  DB --> M
  OBJ --> M
~~~

### 16.3 Component responsibilities

| Component | Responsibility |
|---|---|
| Responsive web UI | Mobile-first forms, dashboards, language strings, browser-side accessibility, non-sensitive draft handling |
| Laravel application | Authorization, workflows, request validation, API, audit logging, policy enforcement, signed upload/download URLs |
| MySQL | Transactional system of record for users, facilities, requests, availability, status history, consent, campaigns, audit metadata |
| Object storage | Private document bytes only; no public bucket or predictable URLs |
| Queue worker | Slow/retryable tasks: notifications, scans, exports, stale flags, campaigns |
| SMS/email adapters | Provider-specific sending/delivery receipt handling behind a common interface |
| Malware scanner | Scans newly uploaded documents before download/review |
| Monitoring and logging | Health checks, error tracking, performance, queue depth, security alerts, backup checks |

### 16.4 Application modules

1. Public directory module.
2. Authentication and identity module.
3. Consent and privacy module.
4. Facility onboarding and verification module.
5. Inventory/availability module.
6. Blood request module.
7. Secure document module.
8. Donor profile and outreach module.
9. Notification module.
10. Reporting and audit module.
11. Policy configuration module.
12. Support/incident administration module.

### 16.5 Recommended deployment topology

For a pilot:

| Layer | Recommended deployment |
|---|---|
| Web/application | Linux virtual machine or managed container platform behind Nginx and TLS |
| PHP runtime | PHP-FPM with separate web and queue worker processes |
| Database | Managed MySQL or protected MySQL instance with backups and restricted network access |
| Cache/queue | Redis or managed equivalent |
| Files | Private S3-compatible object storage |
| DNS/TLS | Managed DNS, automatic certificate renewal, HSTS after validation |
| Monitoring | Uptime check, application error tracking, database/queue metrics, alert routing |
| Backups | Automated encrypted database snapshots and object-storage version/lifecycle policy |

Never host the production database, document storage, and admin tools openly on the public internet without network controls.

### 16.6 Suggested repository structure

~~~text
raktakosh/
  app/
    Actions/
    Domain/
      Availability/
      Donors/
      Facilities/
      Requests/
      Outreach/
    Http/
      Controllers/
      Requests/
      Resources/
    Jobs/
    Models/
    Policies/
    Services/
  config/
  database/
    factories/
    migrations/
    seeders/
  lang/
    en/
    ne/
  resources/
    css/
    js/
    views/
  routes/
    api.php
    web.php
  storage/
  tests/
    Feature/
    Unit/
    Security/
  docs/
  infra/
    docker/
    deployment/
  .env.example
~~~

### 16.7 Environment configuration

Use an .env file only for non-committed environment values. Required categories:

| Variable category | Examples |
|---|---|
| Application | APP_ENV, APP_KEY, APP_URL, APP_TIMEZONE |
| Database | DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD |
| Queue/cache | REDIS_HOST, QUEUE_CONNECTION |
| Storage | STORAGE_BUCKET, STORAGE_REGION, STORAGE_ACCESS_KEY, STORAGE_SECRET |
| Messaging | SMS_PROVIDER, SMS_API_KEY, EMAIL_MAILER, MAIL_USERNAME, MAIL_PASSWORD |
| Security | SESSION_SECURE_COOKIE, TRUSTED_PROXY, MFA_ENCRYPTION_KEY |
| Monitoring | ERROR_TRACKING_DSN, LOG_CHANNEL, ALERT_WEBHOOK |
| Feature controls | DONOR_OUTREACH_ENABLED, PUBLIC_COUNTS_ENABLED, MAINTENANCE_MODE |

Secrets must never appear in source code, browser bundles, screenshots, PDF documentation, or git history.

---

## 17. Security, privacy, and safety requirements

### 17.1 Security baseline

| Area | Requirement |
|---|---|
| Transport | TLS for all traffic; redirect HTTP to HTTPS; secure cookies |
| Authentication | Secure password hashing, OTP controls, session rotation, password reset expiry, staff MFA |
| Authorization | Server-side role and resource-scope checks for every sensitive action |
| Input handling | Strict validation, output encoding, parameterized queries/ORM, upload allowlist |
| File security | Private storage, antivirus/malware scan, random keys, signed expiring access URLs |
| Secrets | Environment/secret manager only, rotation plan, least privilege |
| Logging | PII-scrubbed application logs; separate, protected audit logs |
| Rate limiting | Login, OTP, public search, request submission, uploads, exports, outreach launches |
| Sessions | HttpOnly, Secure, SameSite cookies; revoke on password/reset/suspension events |
| Dependencies | Lockfiles, vulnerability scanning, supported PHP/framework versions, patch process |
| Backups | Encrypted backups, access restrictions, restoration test at least quarterly during pilot |
| Admin access | MFA, least privilege, device/session monitoring, no shared admin accounts |

### 17.2 Sensitive-document controls

1. Files are accepted only from an allowlist of MIME type and verified signature, not filename alone.
2. Files have an approved maximum count and size.
3. Uploaded files enter quarantine.
4. Malware scan must return Clean before a reviewer can open the file.
5. Preview/download uses a short-lived signed URL after an authorization check.
6. Every document view, download, reject, or delete is an audit event.
7. Documents are never emailed as attachments by the system.
8. Browser/browser-cache controls should prevent sensitive document caching where technically supported.
9. The UI must not expose raw storage keys.

### 17.3 Privacy controls

- Data-minimization review for every field.
- Role-scoped access to patient/requester/donor data.
- Donor phone numbers and identities never appear in public availability results.
- Requester cannot view the donor campaign recipient list.
- Donor cannot view patient prescription or detailed identity.
- Analytics events use pseudonymous IDs and exclude raw phone, names, document paths, and patient notes.
- Exports are role-limited, purpose-limited, and audited.
- Consent is explicit, versioned, and revocable for optional outreach.
- Account and data-access requests have an owner, SLA, and documented verification process.

### 17.4 Medical-safety controls

1. Show a persistent disclaimer: Raktakosh coordinates information and does not replace facility/clinician judgment.
2. Do not compute or state transfusion compatibility.
3. Do not label a donor medically eligible, safe, approved, or matched.
4. Do not approve a prescription automatically.
5. Do not make user-selected urgency automatically trigger mass outreach.
6. Do not display inventory as guaranteed; show timestamp and source facility.
7. Require human facility verification before a donor campaign.
8. Provide a non-platform emergency fallback message if no facility responds or the platform is offline.
9. Design all policy thresholds as versioned configuration approved by the clinical safety lead.

### 17.5 Audit-event catalogue

At minimum, log:

- User registration, OTP sent/verified, login success/failure, password reset, MFA challenge.
- Consent granted/withdrawn.
- Facility created, document uploaded/reviewed, verification status changed.
- Staff invited, role changed, access revoked.
- Inventory created/changed/deleted/restored and public visibility changed.
- Request created/submitted/claimed/assigned/status changed/cancelled.
- Document uploaded/scanned/viewed/downloaded/reviewed/deleted.
- Donor profile changed, availability changed, outreach consent changed.
- Campaign created/launched/recipient selected/message sent/response received/closed.
- Export requested/completed/downloaded.
- Policy created/published/retired.
- Administrator suspension/unsuspension and configuration changes.
- Authorization denials and suspicious rate-limit events.

### 17.6 Incident-response requirements

The organization must define:

1. Who receives security and clinical-safety alerts.
2. How to suspend a compromised account or facility immediately.
3. How to disable public availability and donor outreach in an emergency.
4. How to preserve audit evidence.
5. How to assess document exposure or wrong-recipient notification.
6. How affected users/facilities are informed under the approved policy.
7. How to restore from backup and validate data integrity.
8. How post-incident corrective actions are tracked.

---

## 18. Non-functional requirements

### 18.1 Performance and reliability

| Area | MVP requirement |
|---|---|
| Public page performance | Target p95 initial meaningful page load under 3 seconds on a representative 4G/mobile test profile |
| API responsiveness | Target p95 read requests under 500 ms excluding external provider latency; writes under 1 second excluding document upload/scan |
| File upload | Progress visible; retry/resume strategy documented; clear failure state |
| Notification processing | Queue state observable; critical notifications retried with backoff |
| Availability freshness | Stale flag applied automatically by scheduled job |
| Database integrity | Transactional updates and foreign keys for core workflows |
| Concurrency | Version checks prevent silent overwrite of request/inventory edits |
| Backup recovery | Restoration procedure tested before pilot and on a scheduled basis |
| Graceful degradation | If SMS fails, retain in-app notification and show facility contact fallback; never falsely claim delivery |

### 18.2 Accessibility

The application shall target WCAG 2.2 AA principles for critical flows:

- Keyboard operation and visible focus.
- Semantic labels/headings.
- Adequate text/background contrast.
- Error text that identifies the problem and correction.
- Screen-reader-friendly form fields and status updates.
- Minimum touch target size.
- No time limit on form completion without a warning/extension.
- Content understandable in both supported languages.

### 18.3 Compatibility

- Current Chrome, Edge, Firefox, and Safari mobile/desktop versions.
- Android Chrome and iOS Safari on current supported OS versions.
- No core feature requires a desktop-only interaction, hover, or high-bandwidth video.
- Progressive enhancement for JavaScript: public safety/contact instructions remain readable if a script fails.

### 18.4 Localization

- Store user-facing copy in language resource files, not scattered hard-coded strings.
- Support English and Nepali for MVP-critical screens.
- Store dates/times in UTC, display Asia/Kathmandu by default.
- Use unambiguous date/time formats and display calendar date with time zone.
- Translate clinical/operational words only after review by local domain stakeholders.

### 18.5 Observability

Minimum dashboards and alerts:

- Uptime and response time.
- Application errors by endpoint/release.
- Login/OTP failure rates.
- Queue length, failed jobs, and notification delivery failure rate.
- Document scan failures.
- Inventory stale-record count by facility.
- Request counts by status and facility response time.
- Campaign launches and opt-out rate.
- Database connection/storage/backup health.
- Security events: admin role changes, export volume, repeated access denials.

---

## 19. MVP epics, user stories, and acceptance criteria

This backlog is intentionally organized around safe end-to-end capability, not isolated pages. A sprint should only take stories whose dependencies and acceptance criteria are clear.

### Epic E1: Foundation, design system, and environment

**Goal:** Create a secure, deployable base that supports future modules.

| Story ID | User story | Priority | Acceptance criteria |
|---|---|---:|---|
| E1-01 | As an engineer, I need separate development, staging, and production configurations so changes can be tested safely. | P0 | Environment-specific configuration exists; production secrets are not committed; staging uses isolated database/storage. |
| E1-02 | As an engineer, I need database migrations and seed data so reference values are repeatable. | P0 | Fresh environment can be provisioned from migrations; districts, groups, components, roles, and policy seed data are controlled. |
| E1-03 | As a user, I need a mobile-first common layout so all pages remain usable on a phone. | P0 | Header, language switcher, navigation, toast/error patterns, form components, and responsive breakpoints are implemented. |
| E1-04 | As an operator, I need health checks and error monitoring so outages are detectable. | P0 | Health endpoint, uptime monitor, structured logs, error tracker, and alert recipient are configured. |
| E1-05 | As a security owner, I need baseline headers and secure session defaults. | P0 | TLS, CSRF protection, secure cookies, content-security policy baseline, rate limits, and no debug mode in production. |

### Epic E2: Public discovery

**Goal:** A guest can find relevant verified facility availability without exposing private data.

| Story ID | User story | Priority | Acceptance criteria |
|---|---|---:|---|
| E2-01 | As a guest, I can select district, blood group, Rh factor, and component. | P0 | Filters validate against controlled values and work on mobile. |
| E2-02 | As a guest, I can see facility availability summaries with freshness. | P0 | Result shows state, timestamp, stale flag, facility identity, and contact action; no personal data appears. |
| E2-03 | As a guest, I understand that availability is not guaranteed. | P0 | Disclaimer appears near results and in help content; usability test participants can explain it. |
| E2-04 | As a guest, I can start a request from a search outcome. | P0 | Selected district/group/component prefill the request form without bypassing verification. |
| E2-05 | As a guest, I can read the core flow in Nepali or English. | P0 | Critical search and help copy is localized and language persists for the session. |

### Epic E3: Authentication, consent, and access control

**Goal:** Accounts are verified, access is scoped, and consent is evidence-based.

| Story ID | User story | Priority | Acceptance criteria |
|---|---|---:|---|
| E3-01 | As a requester/donor, I can register with a phone and verify it. | P0 | OTP expires, retries are limited, successful verification creates a logged state. |
| E3-02 | As a user, I can sign in, reset access, and sign out safely. | P0 | Login/session/reset workflows pass security and rate-limit tests. |
| E3-03 | As a donor, I can explicitly grant or withdraw outreach consent. | P0 | No preselected consent; every change writes a versioned consent event. |
| E3-04 | As a facility administrator, I can invite staff rather than sharing passwords. | P0 | Invitation expires, role scope is selected, acceptance verifies contact channel. |
| E3-05 | As a platform administrator, I must use MFA. | P0 | Admin cannot access console after password-only login. |
| E3-06 | As a user, I cannot access another user’s request, donor profile, or document by modifying a URL. | P0 | Authorization tests cover direct-object-reference attempts. |

### Epic E4: Facility onboarding and administration

**Goal:** Only verified organizations operate critical workflows.

| Story ID | User story | Priority | Acceptance criteria |
|---|---|---:|---|
| E4-01 | As a platform admin, I can create/review a facility profile. | P0 | Required data and verification status are captured; verification documents remain private. |
| E4-02 | As a platform admin, I can verify, reject, suspend, or expire a facility. | P0 | Status change needs reason and generates audit event; non-verified facility cannot publish/operate. |
| E4-03 | As a facility admin, I can manage public contact information and hours. | P0 | Public profile changes are validated and tracked. |
| E4-04 | As a facility admin, I can assign staff scopes. | P0 | Inventory manager cannot launch campaigns unless separately assigned reviewer permission. |

### Epic E5: Inventory and availability

**Goal:** Facility staff can maintain reliable, qualified availability records.

| Story ID | User story | Priority | Acceptance criteria |
|---|---|---:|---|
| E5-01 | As an inventory manager, I can enter availability by blood group and component. | P0 | Input rejects invalid values and records editor/time/source. |
| E5-02 | As an inventory manager, I can see prior changes and correction reasons. | P0 | History lists before/after values and actor; records cannot be silently overwritten. |
| E5-03 | As a public user, I see stale data clearly. | P0 | Scheduled job applies stale state; public ranking degrades stale records. |
| E5-04 | As a facility admin, I can choose whether counts or only availability states are public. | P0 | Public response respects facility setting and does not leak internal fields. |
| E5-05 | As an inventory manager, I can update several rows efficiently. | P1 | Bulk grid preview, validation, and atomic/partial-error behavior is documented. |

### Epic E6: Request and document workflow

**Goal:** A verified requester submits a safe, complete request and receives transparent updates.

| Story ID | User story | Priority | Acceptance criteria |
|---|---|---:|---|
| E6-01 | As a requester, I can save and resume a request draft. | P0 | Draft is private; incomplete draft does not enter facility queue. |
| E6-02 | As a requester, I can submit a required document safely. | P0 | Allowed types/size enforced; scan/quarantine state visible; file does not become public. |
| E6-03 | As a requester, I receive a unique reference and acknowledgement. | P0 | Successful submit is idempotent and sends one acknowledgement per accepted submission. |
| E6-04 | As a reviewer, I can claim, review, and update requests. | P0 | Only authorized roles access queue/documents; invalid state transition is rejected. |
| E6-05 | As a requester, I can see my request timeline and next action. | P0 | Internal notes and staff-only details do not appear. |
| E6-06 | As a reviewer, I can request more information or reject with structured reasons. | P0 | Requester receives approved visible copy; audit retains full action. |
| E6-07 | As a requester, I can cancel a request before fulfillment. | P0 | Cancellation is permission-checked, status logged, and notifications sent. |

### Epic E7: Donor profile and emergency outreach

**Goal:** Donor coordination is opt-in, limited, and facility-controlled.

| Story ID | User story | Priority | Acceptance criteria |
|---|---|---:|---|
| E7-01 | As a donor, I can create a minimal profile and set availability. | P0 | Profile clearly distinguishes self-reported data and policy-based guidance. |
| E7-02 | As a donor, I can see/change contact preferences and opt out. | P0 | Opt-out takes effect before next campaign recipient selection. |
| E7-03 | As a reviewer, I can create a campaign only for a verified, unresolved request. | P0 | Server rejects campaign launch without eligible request state and facility permission. |
| E7-04 | As a reviewer, I see candidate count and policy before launch. | P0 | Campaign criteria, limit, expiry, and template are recorded. |
| E7-05 | As a donor, I can respond interested/not available/stop outreach. | P0 | Response is idempotent, creates notification/task for facility, and respects privacy. |
| E7-06 | As a reviewer, I can close campaign and record result. | P0 | No new sends after close/expiry; audit captures closure. |

### Epic E8: Notifications, reporting, and audit

**Goal:** Stakeholders receive reliable updates and operators can investigate events.

| Story ID | User story | Priority | Acceptance criteria |
|---|---|---:|---|
| E8-01 | As a user, I receive in-app updates for material events. | P0 | Notifications have consistent templates and do not leak sensitive data. |
| E8-02 | As a user, I receive a critical external notification where I consented. | P0 | Provider status recorded; failure does not produce false delivery claim. |
| E8-03 | As a facility admin, I can see operational reports. | P0 | Facility scope only; metrics exclude unnecessary PII. |
| E8-04 | As a platform admin, I can search audit events. | P0 | Search supports entity/actor/date/action filters and cannot be altered by ordinary users. |
| E8-05 | As an admin, I can request an audited CSV export. | P0 | Export contains only authorized scope; request/download actions logged. |

---

## 20. MVP backlog prioritization

### 20.1 MoSCoW scope

| Category | Included work |
|---|---|
| Must have | Public availability search, verified accounts, facility verification, inventory, request/document workflow, donor opt-in and outreach, notifications, admin/audit, responsive bilingual critical flows |
| Should have | Bulk inventory update, CSV reports, local draft recovery, configurable public-count setting, support content management |
| Could have | Facility contact relay instead of publicly listed phone, basic dashboard charts, appointment-interest capture |
| Will not have in MVP | Direct chat, maps/live GPS, native app, lab integration, barcodes, AI/OCR, payments, delivery/ambulance routing |

### 20.2 Implementation estimates

Estimates are relative planning estimates for a small team. They are not calendar promises; integrations, clinical review, facility onboarding, and test feedback can change delivery time.

| Epic | Relative effort | Key dependencies |
|---|---:|---|
| E1 Foundation | Medium | Hosting, domain, design decisions |
| E2 Public discovery | Medium | District/facility reference data |
| E3 Authentication/consent | Large | SMS provider, legal copy, MFA strategy |
| E4 Facility onboarding | Medium | Verification workflow and documents |
| E5 Inventory | Large | Facility inventory process and policy |
| E6 Requests/documents | Large | Document storage/scanning, required fields, reviewer workflow |
| E7 Donor/outreach | Large | Clinical policy, SMS templates, consent decisions |
| E8 Notifications/audit/reporting | Large | Provider integration, audit design, reporting decisions |
| Hardening/UAT | Large | Pilot facility availability, test scenarios |

### 20.3 Recommended MVP sequence

Do not build all modules in parallel from day one. Build and validate the safest dependency path:

1. Foundation, roles, access control, reference data, facility verification.
2. Public facility directory and inventory entry.
3. Request wizard, private document pipeline, facility queue.
4. Status workflow, notification, audit logging.
5. Donor profile, consent, pre-screening configuration.
6. Controlled outreach campaign.
7. Reporting, performance, security testing, UAT, pilot operations.

---

## 21. Delivery plan and milestones

### 21.1 Suggested 14-week pilot plan

| Week | Deliverable | Exit criteria |
|---|---|---|
| 1 | Product kickoff and operating-model workshop | Pilot facilities identified; clinical safety lead named; scope and glossary approved |
| 2 | UX flows, fields, consent/legal drafts, technical setup | Wireframes reviewed; environment and CI baseline ready |
| 3 | Foundation/authentication/roles | Users can register/verify; admin/facility scopes tested |
| 4 | Facility onboarding and public directory | Verified facility can be created; public profile is privacy-safe |
| 5 | Inventory module | Staff can update availability; stale logic and history work |
| 6 | Request wizard and secure upload | Requester can submit; document scan pipeline works in staging |
| 7 | Facility request queue and state machine | Review, internal notes, visible updates, audit work end-to-end |
| 8 | Notifications | In-app plus chosen external channel passes delivery/failure tests |
| 9 | Donor onboarding, consent, pre-screen policy | Donor can control profile/availability; policy version visible |
| 10 | Emergency outreach | Reviewer launches controlled campaign; donor responses create follow-up |
| 11 | Reports, support tools, admin audit | Facility and platform dashboards work with seed/pilot data |
| 12 | Security, accessibility, performance, recovery testing | Critical defects fixed; backup restore verified |
| 13 | Pilot UAT and facility training | UAT sign-off or documented exceptions; runbooks rehearsed |
| 14 | Limited pilot launch and hypercare | Monitoring active; support roster and daily review in place |

### 21.2 Team model

Minimum recommended pilot team:

| Role | Suggested allocation | Core work |
|---|---:|---|
| Product owner / business analyst | Part-time, continuous | Scope, backlog, stakeholder decisions, acceptance |
| Clinical safety lead | Part-time, decisive | Policy, content, safety gates, UAT |
| UX/UI designer | Part-time early, on call later | Flows, prototypes, accessibility, bilingual copy |
| Full-stack PHP/Laravel engineer | Full-time | Core application, APIs, database, integrations |
| Frontend engineer or full-stack support | Part-time/full-time | Responsive UI, state, localization, usability |
| QA engineer | Part-time then full-time near pilot | Test plan, regression, UAT support |
| DevOps/security support | Part-time | Hosting, backups, monitoring, hardening |
| Facility champions | Part-time | Inventory workflow, request review, training, feedback |

A single student developer can build a demonstration. A live pilot handling sensitive data should not proceed without an accountable clinical partner, security review, and support owner.

### 21.3 Definition of Ready for a story

A backlog story is ready only when:

- User and business outcome are clear.
- Role and permission are known.
- Required fields and validation are listed.
- Success, error, empty, loading, and mobile states are considered.
- Data classification and audit requirement are identified.
- API/integration dependency is known.
- Acceptance criteria are testable.
- Clinical/policy approval exists when the story affects eligibility, request processing, or outreach.

### 21.4 Definition of Done for a story

A story is done only when:

- Code is reviewed and merged through CI.
- Automated tests appropriate to risk pass.
- Authorization tests cover the resource.
- Validation and error states are implemented.
- Audit events exist for sensitive writes/reads.
- English/Nepali strings are present for user-facing critical paths.
- Accessibility checks pass for the affected screen.
- Documentation/runbook is updated where the behavior changes operations.
- Product owner accepts the story in staging.

---

## 22. Detailed test strategy

### 22.1 Test layers

| Layer | Purpose | Examples |
|---|---|---|
| Unit tests | Validate isolated business rules | Policy evaluation, status transitions, stale calculation, candidate filtering |
| Feature/API tests | Validate controllers, authorization, validation, transactions | Request submit, document permission, campaign launch rejection |
| Integration tests | Validate external boundaries | SMS provider adapter, object storage signed URLs, malware scan callback |
| End-to-end tests | Validate real user journeys | Guest search to request submission, reviewer resolution, donor response |
| Security tests | Find access and input vulnerabilities | IDOR, XSS, CSRF, file upload bypass, rate-limit checks |
| Accessibility tests | Ensure inclusive interaction | Keyboard, screen reader labels, contrast, errors, mobile touch targets |
| Performance tests | Verify pilot load and slow network behavior | Availability search, request queue, upload, campaign jobs |
| UAT | Validate operational reality | Facility inventory reconciliation, request review, consent wording, after-hours behavior |
| Disaster recovery test | Verify restore and critical failure paths | Database restore, queue outage, SMS outage, document scan outage |

### 22.2 Critical acceptance test matrix

| Test ID | Scenario | Expected result |
|---|---|---|
| T-001 | Guest searches a district | Only public verified facility data appears with timestamps/disclaimer |
| T-002 | Guest changes query parameters manually | Invalid values rejected; no internal data exposed |
| T-003 | Requester submits a valid request twice due to weak network | Idempotency prevents duplicate request/notification |
| T-004 | Requester uploads executable renamed as PDF | Upload rejected or quarantined; no reviewer access |
| T-005 | Requester uploads valid PDF | File is private, scanned, linked to request, and audit-ready |
| T-006 | Unauthorized user guesses a request reference | Access denied without revealing existence |
| T-007 | Inventory manager updates availability | Change stored with reason/actor/timestamp; public result respects setting |
| T-008 | Inventory record becomes old | It displays as stale and is not ranked as fresh availability |
| T-009 | Reviewer tries to start outreach for Submitted request | Server rejects action; request needs required verified state |
| T-010 | Reviewer launches valid campaign | Only consented/available/non-cooldown donors are selected and message is minimal |
| T-011 | Donor selects Stop outreach | Future campaigns exclude donor immediately; consent change logged |
| T-012 | Facility admin tries to access another facility queue | Access denied and security event can be investigated |
| T-013 | Platform admin exports data | Export is scope-checked, generated asynchronously, logged, and expires |
| T-014 | SMS provider fails | Status marks failed/retry; in-app notification/fallback remains; no false “sent” confirmation |
| T-015 | Administrator account signs in without MFA | Admin console access is blocked |
| T-016 | Backup is restored in staging | Recovery time and data integrity meet documented pilot objective |
| T-017 | User completes request form on narrow mobile viewport | No hidden required fields; form usable with keyboard/touch |
| T-018 | Nepali locale active | Critical screens and error copy display selected language consistently |

### 22.3 Security test checklist

- Broken object-level authorization on every request, document, inventory, campaign, export, facility, and user endpoint.
- Role escalation by modified client payload, route, cookie, or hidden form control.
- SQL injection, XSS, CSRF, open redirect, insecure file upload, SSRF via file URL, mass assignment, and path traversal.
- Session fixation, session invalidation after password change, OTP replay, OTP brute force, account enumeration.
- Rate-limit and CAPTCHA behavior under repeated attempts.
- Secret leakage in logs, source maps, frontend bundles, error pages, and CI output.
- Document access after permission revocation or signed URL expiration.
- Audit-log integrity and restricted access.
- Dependency vulnerability scan and supported-version review.

### 22.4 UAT scenarios with pilot facilities

1. Inventory manager updates a normal morning inventory record.
2. Facility changes an incorrect count and explains correction.
3. Family member searches and submits a request on mobile.
4. Reviewer asks for more information.
5. Requester uploads a corrected document.
6. Reviewer verifies request and finds facility availability.
7. Facility cannot satisfy request and triggers donor outreach.
8. Donor receives an invitation, declines, and later pauses outreach.
9. Donor shows interest and coordinator closes the loop.
10. Facility handles an after-hours request.
11. Platform admin suspends a facility accidentally configured as public.
12. SMS service is unavailable during a request status update.
13. Staff member leaves facility and access is revoked.
14. A requester asks what data the platform stores.

---

## 23. Analytics and KPI specification

### 23.1 Event taxonomy

Events should use pseudonymous user/facility IDs and avoid sensitive values. Examples:

| Event | Properties allowed |
|---|---|
| public_search_performed | district ID, group/component filter, result count bucket, locale, anonymous session ID |
| request_draft_saved | request ID, step number, locale |
| request_submitted | request ID, facility ID, district ID, component, urgency label, source |
| request_status_changed | request ID, prior/new state, facility ID, actor role, time-to-transition |
| inventory_updated | facility ID, record count, source, stale-to-fresh transition |
| donor_profile_completed | donor ID, district ID, availability state |
| donor_outreach_launched | campaign ID, facility ID, candidate count bucket, expiry duration |
| donor_outreach_responded | campaign ID, response type, response latency |
| notification_delivery_result | channel, template, result code, retry count |
| document_scan_completed | document type, result, processing latency |

Do not send phone numbers, names, raw documents, detailed patient data, or full request notes to an analytics platform.

### 23.2 Operational dashboard metrics

| Metric | Calculation | Owner | Review cadence |
|---|---|---|---|
| Public availability freshness | Fresh records / active public records | Facility admin | Daily |
| Request first response time | First reviewer action minus submitted time | Facility admin | Daily/weekly |
| Request resolution time | Closed time minus submitted time | Product/facility | Weekly |
| Request outcome distribution | Fulfilled/unable/rejected/cancelled/expired | Product/clinical lead | Weekly |
| Outreach activation rate | Campaigns / verified inventory-unavailable requests | Clinical lead | Weekly |
| Donor response rate | Unique responses / delivered invitations | Donor coordinator | Weekly |
| Opt-out rate | Stop-outreach responses / delivered invitations | Product/privacy owner | Weekly |
| Notification failure rate | Failed deliveries / attempted deliveries | Engineering | Daily |
| Security anomaly count | High-severity audit alerts | Security owner | Daily |
| Facility adoption | Active updating facilities / verified facilities | Product owner | Weekly |

### 23.3 Guardrail metrics

These metrics are more important than growth metrics:

- Number of stale public availability records.
- Requests that sit without a facility response past operating SLA.
- Donor contacts sent beyond configured frequency.
- Document views outside assigned facility.
- Account-sharing signals for facility/admin users.
- Percentage of requests with a complete audit history.
- Support incidents involving false availability, private-data exposure, or incorrect notification.

---

## 24. Operating procedures and support runbooks

### 24.1 Daily facility operations

1. Inventory manager reviews previous availability and updates current record before public operating hours.
2. Facility dashboard flags stale data and open requests.
3. Request reviewer claims incoming requests during staffed period.
4. Reviewer updates each request with a status or reason before end of shift.
5. Donor coordinator resolves interested responses and closes expired campaigns.
6. Facility administrator reviews exceptions, failed notifications, and user-access changes.

### 24.2 After-hours procedure

Each facility must configure one approved approach:

- Do not accept new requests outside hours; show local emergency contact guidance.
- Accept requests but set expected response timing clearly.
- Route to a staffed on-call reviewer under facility policy.

The system must not silently place an after-hours request in a queue while showing “immediate help is on the way.”

### 24.3 Stale inventory procedure

1. System marks record stale automatically.
2. Facility receives a reminder notification.
3. Public UI downgrades/removes fresh availability claim.
4. If staleness exceeds facility policy, the platform may automatically hide public availability while retaining internal history.
5. Facility updates/reconciles and record returns to fresh state.

### 24.4 Wrong data or misdirected request procedure

1. Staff records correction through the approved status/adjustment workflow; no silent overwrite.
2. If a requester has been notified incorrectly, reviewer sends a corrected requester-visible update.
3. If sensitive data may have been exposed, staff escalates to privacy/security owner immediately.
4. Audit evidence is preserved.
5. Product owner records root cause and preventive action.

### 24.5 Messaging-provider outage procedure

1. Monitoring reports provider failure rate.
2. Queue retries within approved limits.
3. In-app notifications remain available.
4. Facility dashboard shows communication failure state.
5. Critical user message includes safe fallback contact instructions when possible.
6. No worker marks a message delivered without provider confirmation/approved status.

### 24.6 Account compromise procedure

1. Suspend affected account/session(s).
2. Force password reset and revoke active tokens.
3. Review audit logs and document access.
4. Notify facility/security owner according to incident plan.
5. Restore only after identity verification and root-cause review.

---

## 25. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Stale/incorrect inventory | Patient/family may waste time | Timestamp, stale state, facility ownership, periodic reconciliation, no guarantee language |
| Incorrect clinical policy | Unsafe donor outreach or confusion | Versioned settings, clinical safety approval, no hard-coded thresholds, no automated medical decision |
| Unauthorized access to documents | Serious privacy harm | RBAC, private storage, scan, signed URLs, audit, MFA for admins |
| Fake requester or malicious use | Spam/harassment/resource waste | Phone verification, document review, rate limits, duplicate checks, facility verification |
| Donor harassment/excessive contacts | Donor trust loss | Opt-in, preference window, cooldown, recipient caps, stop-outreach action, audit |
| Weak facility adoption | Data becomes stale/unhelpful | Pilot with committed champions, simple grid, freshness dashboard, training |
| SMS delivery/cost issues | Missed updates | Provider abstraction, in-app fallback, budget alarms, delivery monitoring |
| Low connectivity | Users fail to submit request | Mobile-first pages, draft/retry, compressed assets, clear fallback contacts |
| Scope creep | Delays/unsafe unfinished product | Strict MVP boundary, deferred roadmap, change-control review |
| Lack of after-hours support | False expectation | Facility hours, clear response SLA, emergency fallback content |
| Shared staff credentials | Lost accountability | Individual accounts, staff invitation, MFA, offboarding procedure |
| Data retention uncertainty | Compliance/privacy risk | Approved schedule before launch, configurable lifecycle jobs, legal/privacy review |
| Student project deployment without governance | Live-service failure | Use demo data until clinical, security, and operations approvals exist |

---

## 26. MVP launch checklist

### 26.1 Product and content

- [ ] Scope reviewed against this PRD and P0/P1 boundary confirmed.
- [ ] English and Nepali critical content reviewed.
- [ ] Public disclaimer, privacy notice, terms, consent text, and emergency guidance approved.
- [ ] Facility operating hours and public contact modes configured.
- [ ] Policy versions for pre-screening, staleness, outreach caps, and status reasons published.
- [ ] Help/support contact and escalation instructions verified.

### 26.2 Clinical and operational readiness

- [ ] Clinical safety lead approves pilot workflow and policy settings.
- [ ] Every pilot facility is verified and has a named administrator, inventory manager, and request reviewer.
- [ ] Facility staff training completed with sign-off.
- [ ] Daily, after-hours, stale-inventory, wrong-data, and outage runbooks rehearsed.
- [ ] Donor outreach template and coordinator follow-up workflow approved.
- [ ] No user-facing message claims guaranteed inventory or medical compatibility.

### 26.3 Security and privacy readiness

- [ ] TLS, secure cookies, MFA, authorization tests, rate limits, and audit logs are enabled.
- [ ] Production secrets are stored securely and not in repository history.
- [ ] Private document storage, scan pipeline, signed URL expiry, and access logs tested.
- [ ] Backup creation and restoration test completed.
- [ ] Security review of all P0 endpoints completed.
- [ ] Export permissions and data-access workflow approved.
- [ ] Incident contacts and escalation channels tested.

### 26.4 Technical readiness

- [ ] Staging environment matches production configuration where practical.
- [ ] Monitoring, error tracking, health checks, alerts, and queue failure dashboards are live.
- [ ] Database migrations, seeders, and rollback plan tested.
- [ ] Notification provider sandbox/production behavior verified.
- [ ] Accessibility and mobile tests pass.
- [ ] Performance testing reflects pilot traffic and slow network conditions.
- [ ] Maintenance mode and emergency feature flags tested.

### 26.5 Pilot readiness

- [ ] Pilot geography, facilities, user cohort, and support window are documented.
- [ ] UAT scenarios completed and defects triaged.
- [ ] Success metrics baseline captured.
- [ ] Daily hypercare review schedule is set for the first two weeks.
- [ ] Feedback collection route is in place for requesters, donors, and facility staff.

---

## 27. Phase 2 and Phase 3 roadmap

### Phase 2: Improve coordination after a successful pilot

- Secure facility contact relay or moderated requester-facility chat.
- Donor appointment-interest and facility scheduling.
- Map view and consented proximity ranking.
- Bulk inventory upload and stronger reconciliation workflows.
- Multi-facility organization management.
- More complete bilingual coverage and accessibility refinements.
- Deeper analytics dashboard and scheduled reports.
- Partner referral workflow with acknowledgement status.
- Support ticketing and structured issue reporting.

### Phase 3: Integrate verified operational systems

- Blood bank/LIS/HMIS integration after data-contract approval.
- Barcode/QR scanning and unit-level traceability only if operating partners require it.
- Multi-district partner network and controlled inter-facility exchange.
- Native mobile app only if web analytics justify it.
- Carefully constrained document OCR to prefill non-clinical fields, always with human review.
- Advanced capacity planning and anonymized reporting after data governance approval.

### Features that require a separate product decision

- Home blood collection.
- Ambulance/drone/transport coordination.
- Payment/marketplace/fundraising.
- Public direct donor-recipient messaging.
- National-scale national-identity integration.
- Any AI that influences clinical urgency, donor eligibility, compatibility, or request acceptance.

---

## 28. Open questions requiring stakeholder decisions

| ID | Question | Decision owner | Needed before |
|---|---|---|---|
| OQ-01 | Which exact facility types may join the pilot? | Product owner + clinical lead | Facility onboarding |
| OQ-02 | What current policy approves age, interval, deferral, and donor-contact rules? | Clinical safety lead | Donor pre-screening |
| OQ-03 | Is age band sufficient, or is full date of birth operationally necessary? | Clinical + privacy lead | Donor/request forms |
| OQ-04 | What documents are mandatory for which request types? | Clinical lead + facility admins | Request workflow |
| OQ-05 | Are public numeric quantities acceptable, or only availability states? | Facility admins + clinical lead | Public search |
| OQ-06 | What is the official after-hours escalation path at each facility? | Facility admin | Public launch |
| OQ-07 | Which external channel has budget, reliability, and consent approval: SMS, email, Viber, WhatsApp, or another? | Product/operations | Notifications |
| OQ-08 | Who verifies a facility and how often is verification renewed? | Platform governance owner | Facility launch |
| OQ-09 | How long must request documents, audit logs, and consent evidence be retained? | Privacy/legal owner | Production launch |
| OQ-10 | Does any partner have an inventory system that may be integrated later? | Facility admin + technical lead | Phase 3 planning |
| OQ-11 | What support hours and response SLA can be honestly offered? | Product owner + facilities | Public messaging |
| OQ-12 | What is the approval process for translation changes? | Clinical/content owner | Localization launch |

---

## 29. Traceability checklist against the original proposal

| Original proposal concept | Where implemented in this PRD |
|---|---|
| Centralized blood inventory and donor matching system | Sections 2, 8, 9, 10 |
| Donor, seeker/receiver, hospital admin ecosystem | Sections 7, 10, 13 |
| HTML/CSS/JavaScript, PHP 8, MySQL stack | Section 16 |
| Automated integrity/eligibility checks | Sections 6.2, 10.4, 11.2 |
| Age and interval rule | Section 6.2, treated as configurable pre-screening |
| District-wise proximity/stock filtering | Sections 8, 10.1, 13.1 |
| Emergency public network peer ledger | Sections 9.4, 10.8 |
| Prescription PDF/PNG verification | Sections 10.6, 14, 17 |
| Manual ledger replacement | Sections 10.5, 14, 24 |
| Asynchronous validation/notifications | Sections 10.9, 15.10 |
| Home-service routing alerts | Sections 3 and 8; deferred pending real operational model |
| Public landing page/no forced login to browse | Sections 8 and 10.1 |
| Three-tier system architecture | Section 16 |
| Order processing, notification, prescription, eligibility modules | Sections 15 and 16 |
| Database entities for users, donors, hospitals, stock, orders, prescriptions, notifications | Section 14 |
| Pending-to-confirmed request sequence | Sections 9.2 and 10.7, expanded into safe auditable state machine |

---

## 30. Recommended next actions

1. Review the MVP scope and cross out any feature that cannot be operated safely by the pilot facilities.
2. Hold a 90-minute workshop with a clinical safety lead and one representative from each pilot facility to resolve the open questions.
3. Convert the P0 epics into issue-tracker tickets using the acceptance criteria in Section 19.
4. Produce low-fidelity wireframes for the 15 screens in Section 13 before coding.
5. Build the P0 end-to-end vertical slice first: facility verification, inventory update, public search, request submission, facility review, safe status update.
6. Add donor outreach only after the core request/inventory workflow passes UAT and policies are approved.
7. Use synthetic/demo data until all production readiness checklist items are complete.

---

## 31. Reference and validation notes

Before implementation or public launch, validate this document against:

1. The latest national and participating-facility blood-service policies.
2. Current Nepal privacy, health-data, electronic-record, and consumer/communications obligations.
3. The blood donor selection and transfusion-safety guidance adopted by the participating facilities.
4. Current security practices for password storage, application access control, file upload, and incident response.
5. Accessibility review with actual Nepali-language users and low-bandwidth devices.

The original proposal’s cited organizations and resources, including Hamro Life Bank and Nepal Red Cross Society, are valuable context. They should be treated as stakeholder/benchmark sources, not as permission to copy data, workflows, or branding without written agreement.
