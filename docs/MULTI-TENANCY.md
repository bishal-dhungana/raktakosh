# Multi-tenant Blood Bank management

## Model

Each `facility` is one Blood Bank tenant. Every Blood Bank staff account is linked to exactly one `facility_id`; the platform Super Admin is the only role that can create a new tenant and its first Blood Bank Admin.

## Super Admin workflow

1. Sign in as the platform administrator.
2. Open **Multi-tenant provisioning**.
3. Enter the Blood Bank branch details, administrator identity, and a strong temporary password.
4. Create the tenant. The system creates the facility and a `facility_admin` account together in one transaction.
5. Copy the displayed email and temporary password and share them only through an approved secure channel.

The temporary password is hashed immediately and is never returned by the API or stored in readable form.

## First Blood Bank Admin sign-in

1. The branch opens **Blood Bank portal** and signs in with the issued email and temporary password.
2. The admin completes required TOTP multi-factor enrollment or verification.
3. The system blocks tenant data and all operational actions until the temporary password is replaced.
4. Password replacement rotates the active session and records an audit event.

## Isolation and access boundaries

- A Blood Bank Admin can access only its assigned facility tenant.
- Requester cases, request documents, inventory, and consented donor responses remain scoped by `facility_id`.
- A tenant admin cannot list, read, alter, or export another Blood Bank's records.
- Super Admin actions that create a tenant, change a staff account, or review protected operations are recorded in the audit trail.

## Activation

Super Admin may activate a branch for operations during provisioning. Activating a tenant allows its issued Blood Bank Admin to use the private operational workspace; public inventory remains hidden until that tenant records inventory with public visibility enabled.
