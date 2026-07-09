# Production Operations Baseline

This document defines day-one production operating standards for the Secure Assets platform.

## 1) SLOs and SLIs

### Common measurement rules
- **Measurement window:** rolling 28 days for SLO compliance, plus daily reporting.
- **Traffic scope:** production-only requests and jobs.
- **Exclusions:** planned maintenance windows (pre-announced), synthetic load tests, and explicitly labeled client-aborted requests.

### Authentication
- **User journey:** login, token refresh, session validation, and MFA verification APIs.
- **SLIs:**
  - **Availability SLI:** successful auth requests / total auth requests (success = non-5xx and valid response semantics).
  - **Latency SLI:** p95 and p99 end-to-end auth API latency.
  - **Correctness/Security SLI:** token issuance/validation error rate and MFA challenge failure due to system error.
- **SLOs:**
  - Availability: **99.95%** monthly.
  - Latency: **p95 < 300 ms**, **p99 < 800 ms**.
  - System-auth failure rate: **< 0.1%** of auth attempts.

### Payments
- **User journey:** payment intent creation, authorization/capture, webhook handling, ledger write.
- **SLIs:**
  - **Availability SLI:** successful payment operations / total payment operations.
  - **Latency SLI:** p95 API latency for synchronous payment endpoints.
  - **Consistency SLI:** mismatch rate between processor state and internal ledger after reconciliation.
- **SLOs:**
  - Availability: **99.95%** monthly for payment APIs.
  - Latency: **p95 < 600 ms** for synchronous endpoints (excluding third-party hard timeouts).
  - Consistency: **< 0.05%** reconciliation mismatches, all resolved within 24h.

### Marketplace Search
- **User journey:** search query execution, filter/sort, result rendering payload.
- **SLIs:**
  - **Availability SLI:** successful search responses / total search requests.
  - **Latency SLI:** p95 and p99 search API latency.
  - **Result quality SLI:** zero-result rate for historically successful intent buckets (guardrail metric).
- **SLOs:**
  - Availability: **99.9%** monthly.
  - Latency: **p95 < 450 ms**, **p99 < 1200 ms**.
  - Zero-result guardrail: no >25% relative regression week-over-week in key intent buckets.

### Document Retrieval
- **User journey:** metadata lookup, access check, object fetch/download URL generation.
- **SLIs:**
  - **Availability SLI:** successful document retrieval requests / total requests.
  - **Latency SLI:** p95/p99 time to first byte for retrieval endpoint.
  - **Integrity SLI:** checksum/hash mismatch rate on retrieval.
- **SLOs:**
  - Availability: **99.95%** monthly.
  - Latency: **p95 < 700 ms**, **p99 < 2000 ms**.
  - Integrity: **0 critical checksum mismatches**; warning threshold <0.01% non-critical retrieval validation failures.

## 2) Data Protection: RPO/RTO and Backup Verification

### PostgreSQL
- **Target RPO:** **<= 5 minutes**.
- **Target RTO:** **<= 30 minutes** for single-region database failure.
- **Backup policy:**
  - Continuous WAL archiving / PITR enabled.
  - Daily full backup snapshot.
  - Backups encrypted at rest and in transit.
- **Verification cadence:**
  - **Daily:** automated backup job success + WAL continuity check.
  - **Weekly:** restore latest backup to staging and run smoke integrity checks.
  - **Monthly:** point-in-time recovery drill (pick random timestamp in prior 7 days).
  - **Quarterly:** game-day restore with incident-style timing validation against RTO.

### Object Storage
- **Target RPO:** **<= 15 minutes** for newly written objects (or provider replication interval, whichever is stricter).
- **Target RTO:** **<= 4 hours** for regional bucket outage scenario.
- **Backup policy:**
  - Versioning enabled on all critical buckets.
  - Cross-region replication for critical objects.
  - Daily inventory + lifecycle policy enforcement.
- **Verification cadence:**
  - **Daily:** replication lag and failed replication event checks.
  - **Weekly:** random object restore/readability sampling with checksum verification.
  - **Monthly:** full recovery drill for a representative critical prefix/application dataset.

## 3) Schema Migration and Release Protocol

### Principles
- Migrations must be **expand/contract** and safe for mixed-version application fleets.
- APIs must remain **backward-compatible** for at least one deploy cycle.

### Protocol
1. **Design review:** classify change as additive, mutative, or destructive; define rollout and fallback.
2. **Expand phase (safe first):**
   - Add nullable columns/tables/indexes.
   - Dual-write where needed.
   - Backfill in idempotent batches with progress metrics.
3. **Compatibility release:**
   - Deploy app version that reads old+new schema and writes in compatible format.
   - Keep feature flags for new code paths.
4. **Contract phase (only after validation):**
   - Remove legacy reads/writes.
   - Enforce new constraints.
   - Drop deprecated columns/tables in a separate deploy.

### Rollback strategy
- **Code rollback first:** any release must be reversible without requiring immediate destructive DB rollback.
- **DB rollback rules:**
  - Never run irreversible/destructive migration in same release as first usage.
  - Keep forward-fix scripts for failed mutative changes.
  - Snapshot + restore plan documented before contract-phase destructive operations.
- **Operational guardrail:** block deployment if migration prechecks or canary metrics fail.

## 4) Observability Baseline

### Structured logging
- JSON logs for all services with required fields:
  - `timestamp`, `level`, `service`, `env`, `version`, `trace_id`, `span_id`, `request_id`, `user_id` (when available), `route`, `status_code`, `latency_ms`, `error_code`.
- PII/secret redaction enforced via logging middleware.
- Log retention:
  - Hot searchable: 14 days.
  - Archive retention: 90 days (or compliance-defined duration).

### Distributed tracing
- Propagate W3C `traceparent` header across all HTTP and async boundaries.
- Emit spans for:
  - API request lifecycle.
  - External provider calls (payment processor, object storage).
  - Queue job execution.
  - DB queries above slow-query threshold.
- Sampling:
  - Baseline 10% production traces.
  - 100% sampling for errors and high-latency requests.

### Metrics and dashboards
- **Golden signals dashboard per domain:**
  - Latency, traffic, errors, saturation.
- **Domain dashboards:**
  - Auth: login success, MFA errors, token refresh latency.
  - Payments: auth/capture success, webhook lag, reconciliation mismatch.
  - Search: query volume, p95 latency, zero-results rate.
  - Document retrieval: retrieval success, TTFB, storage/backend errors.
- **Infrastructure dashboards:**
  - DB CPU/connections/replication lag.
  - Queue depth, job age, DLQ inflow.

### Alert thresholds (initial)
- **Critical (page):**
  - Error rate > 5% for 5 min in auth or payments.
  - SLO burn rate indicates 2% monthly error budget consumed in 1 hour.
  - DB unavailable > 1 min.
- **High (urgent ticket):**
  - p95 latency above SLO threshold for 15 min.
  - Queue oldest job age > 10 min for invoicing/reminders.
  - Document retrieval checksum mismatch detected.
- **Medium (business hours):**
  - Search zero-result guardrail breach.
  - Storage replication lag above 15 min.

## 5) BullMQ Retry and Dead-Letter Policy

Queues in scope: rent invoicing, reminders, and AI tasks.

### Default retry policy
- **Attempt model:** exponential backoff with jitter.
- **Base configuration:**
  - `attempts`: 8 (invoicing), 6 (reminders), 5 (AI tasks).
  - `backoff`: exponential, base delay 30s.
  - Max retry window capped at 24h for business-critical flows.
- **Classification:**
  - Retryable: network timeouts, 429/5xx from dependencies, transient lock/contention failures.
  - Non-retryable: validation errors, malformed payloads, missing required entities after consistency wait.

### Dead-letter queue (DLQ)
- Move job to DLQ when attempts exhausted or non-retryable error occurs.
- DLQ payload must include:
  - original queue name, job id, dedupe key/idempotency key, error class/message, stack, attempt count, timestamps, trace id.
- **DLQ SLO:** 99% of DLQ items triaged within 1 business day.

### Idempotency and safety
- Every job type must define idempotency key derivation.
- Handlers must be side-effect safe on retries (especially payment/invoicing).
- Use per-job timeout and heartbeat/lock extension to avoid duplicate long-running execution.

### Operations and alerting
- Alerts:
  - DLQ inflow > baseline threshold (e.g., >20 jobs/15 min) or any payment/invoice DLQ event.
  - Oldest pending invoicing job > 10 min.
- Runbook actions:
  - Determine error class (retryable/non-retryable).
  - Apply fix or data correction.
  - Replay from DLQ with bounded rate and audit logging.
  - Document post-incident follow-up for recurring failure modes.
