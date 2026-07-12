# Viva Walkthrough and Questions

## Recommended seven-minute walkthrough

### 1. Start with public discovery

1. Open the landing page.
2. Explain that guests can search before creating an account.
3. Search Morang, `O+`, and `Packed red cells`.
4. Point out the facility name, qualified availability state, and last-updated timestamp.

**Key line:** “The system shows a facility-reported availability state, not a clinical guarantee or reservation.”

### 2. Show the requester workspace

1. Select **Explore workspaces**.
2. Open **Requester workspace**.
3. Explain the form captures only the information needed to begin coordination.
4. Submit a request and show the generated reference code and visible timeline.

**Key line:** “Every request is traceable through an explicit state history.”

### 3. Show facility review controls

1. Choose **Switch workspace** and open **Review workspace**.
2. Open the submitted request in the queue.
3. Move it to **Under review**, then **Verified for coordination**.
4. Add an internal note and explain it is not visible to the requester.
5. For the existing inventory-unavailable request, show the controlled outreach action.

**Key line:** “The server validates permitted state transitions, so the browser cannot bypass the review process.”

### 4. Show inventory accountability

1. Switch to **Inventory workspace**.
2. Show current group/component rows and their timestamps.
3. Record an availability adjustment with a reason.
4. Return to public search and explain how freshness affects the public result.

**Key line:** “Every inventory change has an actor, previous value, new value, reason, and timestamp.”

### 5. Show donor privacy and control

1. Switch to **Donor workspace**.
2. Show availability, contact-window, and consent settings.
3. Open a private invitation and select either `I can be contacted` or `Not available`.
4. Explain that the invitation does not show patient documents or personal contact details.

### 6. Close with governance

1. Switch to **Administrator workspace**.
2. Show verified facility status, published policy cards, and audit feed.
3. Explain how auditability supports accountability in a sensitive workflow.

## Likely viva questions and strong answers

### Why did you choose React, Express, and SQLite?

React supports a responsive component-based interface, Express provides a lightweight API layer, and SQLite provides a relational database with foreign keys and no external database setup for an academic implementation.

### How is user access controlled?

The server reads the session cookie, resolves the user role, and checks authorization before serving each protected API route. The frontend improves usability, but the server remains the enforcement point.

### How do you prevent invalid request processing?

The allowed request transitions are defined centrally in the domain layer. For example, donor outreach is rejected unless the request has first been verified and marked inventory unavailable.

### How is donor privacy protected?

Public search returns facility-level availability only. Donor contact details are never shown publicly or to requesters. Outreach invitations are limited to consented donors and use a privacy-minimised message.

### How do you maintain inventory accountability?

Each inventory update stores the previous quantity, new quantity, editor, reason, note, and timestamp. The facility dashboard also identifies stale availability records.

### What happens if a document is uploaded?

The backend restricts file type and size, stores the upload outside the public web folder, records an integrity hash, and links the document to the authorized request. The workflow preserves a validation status for reviewer handling.

### What are the main limitations and future enhancements?

Future work includes verified phone OTP, staff MFA, managed object storage, automated malware scanning, a notification provider, background queues, appointment management, facility integrations, and hosted deployment monitoring.
