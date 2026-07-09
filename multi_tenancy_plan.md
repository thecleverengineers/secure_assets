# Multi-Organization Data Model and Authorization Plan

## 1) Top-level organization ownership

Use `organizations` as the tenancy boundary (recommended over `accounts`).

```sql
CREATE TABLE organizations (
  id BIGSERIAL PRIMARY KEY,
  external_ref TEXT UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Business-owned tables

Every business-owned row must include `organization_id BIGINT NOT NULL` and a foreign key to `organizations(id)`.

Core tables to migrate:

- `users` (if users are organization-scoped identities)
- `properties`
- `property_units`
- `tenancies`
- `rent_invoices`
- `documents`
- `payments`
- `ai_events`
- Any additional business data table (`maintenance_tickets`, `inspections`, etc.)

Example pattern:

```sql
ALTER TABLE properties
  ADD COLUMN organization_id BIGINT,
  ADD CONSTRAINT properties_organization_fk
    FOREIGN KEY (organization_id) REFERENCES organizations(id);

UPDATE properties p
SET organization_id = <backfill_logic>;

ALTER TABLE properties
  ALTER COLUMN organization_id SET NOT NULL;
```

> Migration note: Add nullable column, backfill, validate, then enforce `NOT NULL` in a final step to avoid long-lock rollouts.

---

## 2) Organization membership mapping and roles

Roles must be per organization via `organization_members`.

```sql
CREATE TABLE organization_members (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  invited_by_user_id BIGINT REFERENCES users(id),
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);
```

### Role model recommendations

- Keep role namespace scoped to organization (`owner`, `admin`, `manager`, `agent`, `accounting`, `viewer`, etc.).
- Optional: add `organization_member_permissions` for granular overrides if role-only access is insufficient.
- Avoid global-only authorization roles for business operations; global roles should be platform-level only (`super_admin`, `support`).

---

## 3) API authorization constraints

All queries and mutations must be constrained by **both**:

1. caller membership in `organization_members`, and
2. target row `organization_id` (plus role scope).

### Required request context

- `auth.user_id`
- `auth.organization_id` (selected org in session/request)
- `auth.role` (resolved from `organization_members` for selected org)

### Query pattern (read)

```sql
SELECT p.*
FROM properties p
JOIN organization_members om
  ON om.organization_id = p.organization_id
 AND om.user_id = :auth_user_id
 AND om.status = 'active'
WHERE p.organization_id = :auth_organization_id
  AND (:auth_role IN ('owner','admin','manager') OR p.owner_id = :auth_user_id);
```

### Query pattern (write)

- `INSERT`: force `organization_id = :auth_organization_id` server-side; never trust client-supplied org id.
- `UPDATE/DELETE`: include `WHERE organization_id = :auth_organization_id` and membership/role check.

### Guardrails

- Fail closed: missing org context => `403`.
- Log authorization decisions with `organization_id` and `role`.
- Add integration tests asserting cross-organization access denial.

---

## 4) Composite index strategy with `organization_id`

Prefix common indexes with `organization_id` to optimize tenant-isolated queries and prevent broad scans.

Recommended examples:

```sql
-- ownership lookups
CREATE INDEX idx_properties_org_owner
  ON properties (organization_id, owner_id);

-- status dashboards
CREATE INDEX idx_rent_invoices_org_status
  ON rent_invoices (organization_id, status);

CREATE INDEX idx_payments_org_status
  ON payments (organization_id, status);

-- unit and tenancy traversal
CREATE INDEX idx_property_units_org_property
  ON property_units (organization_id, property_id);

CREATE INDEX idx_tenancies_org_unit
  ON tenancies (organization_id, property_unit_id);

-- document listing
CREATE INDEX idx_documents_org_entity
  ON documents (organization_id, entity_type, entity_id);

-- AI event audit/search
CREATE INDEX idx_ai_events_org_created
  ON ai_events (organization_id, created_at DESC);
```

### Uniqueness scope

Convert global unique constraints to organization-scoped uniqueness where appropriate.

Examples:

- `(organization_id, external_id)`
- `(organization_id, invoice_number)`
- `(organization_id, property_code)`

---

## 5) Shared actors across organizations

For surveyors, legal partners, contractors, or other shared actors:

### Ownership rules

- Actor identity can remain global (`users` or `partners`), but business records remain organization-owned.
- Access to organization data is granted through membership/association rows scoped by organization.
- Never allow implicit cross-org access from shared identity alone.

### Suggested model

```sql
CREATE TABLE organization_partners (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_type TEXT NOT NULL, -- surveyor, legal_partner, etc.
  access_scope TEXT NOT NULL, -- e.g., property_limited, tenancy_limited, read_only
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, partner_user_id, partner_type)
);
```

### Data handling policy

- Documents generated for Org A belong to Org A (`documents.organization_id = A`) even if authored by a shared surveyor.
- The same partner can have separate role/scope entries in Org A and Org B.
- Billing, audit trails, and AI event logs are always organization-owned and query-filtered by `organization_id`.

---

## 6) Implementation rollout checklist

1. Create `organizations` and `organization_members`.
2. Add nullable `organization_id` to all business-owned tables.
3. Backfill `organization_id` with deterministic scripts.
4. Add FKs and `NOT NULL` constraints.
5. Update application auth context and policy checks.
6. Add composite indexes prefixed with `organization_id`.
7. Convert uniqueness constraints to org-scoped unique indexes where needed.
8. Add tests for org isolation and role enforcement.
9. Add monitoring dashboards for authorization failures and cross-org query attempts.

