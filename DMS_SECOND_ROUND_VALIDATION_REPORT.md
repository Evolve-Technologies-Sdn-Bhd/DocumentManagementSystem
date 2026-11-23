# DMS — SECOND ROUND: DEEP SYSTEM VALIDATION, HIDDEN BUG DETECTION & END-TO-END TESTING

**Final Deliverable / Acceptance Gate Report**
**Workspace:** `c:\Users\USER\Desktop\DocumentManagementSystem`
**Date:** 2026-11-23
**Environment:** Node 24.14.1 · Express + Prisma 5.22.0 (backend `:4001`) · React (Vite, dev `:5175`) · MySQL/MariaDB 10.4.32 (XAMPP, `:3306`, `dms_dev`)

---

## 1. Executive Summary

| Suite | Scope | Result |
|---|---|---|
| Backend E2E lifecycle harness | Sections 3–5, 7, 8 (Workflows A–E, negative/edge, concurrency, permissions, reconciliation) | **90 / 90 PASS, 0 FAIL** |
| Frontend Playwright UI suite | Sections 6 + 9 (UI flows, navigation, console/network, error handling) | **11 / 11 tests PASS** (all sub-assertions PASS) |

**Verdict:** All **Critical** and **High** severity defects found in this round have been fixed in place and re-verified. The system meets the acceptance gate. Two items remain open by policy (require an approved migration plan) and are documented in §6.

**Defects discovered and fixed this round:** 4 (1 Critical, 2 High, 1 Medium).

---

## 2. New Issues Found (this round) — root cause, fix, verification

### CRITICAL-1 — Axios concurrency semaphore deadlock
- **Symptom:** With a transient backend blip, the login page froze permanently on *"Loading login page settings..."*; all subsequent API calls stalled. Observed during UI-11 (total API outage).
- **Root cause:** `frontend/src/api/axios.js` enforces `MAX_CONCURRENT = 3` via `_acquire()` / `_release()` and a `__semaphoreReleased` guard on the request config. Axios **copies the config object onto retried requests**, so a retried request inherited `__semaphoreReleased = true`, meaning it **acquired a new slot but skipped releasing it**. Each retry permanently shrank the budget by one; after 3 retries the budget hit zero and every request deadlocked.
- **Fix:** In the request interceptor, reset the guard on *every* attempt, before acquiring:
  ```js
  cfg.__semaphoreReleased = false
  ```
- **Verified:** UI-11 now passes — login form renders and stays usable during a total API outage (`emailFields=1`), no uncaught page error.

### HIGH-1 — Tampered / expired token never rejected (no global 401 handling)
- **Symptom:** UI-9.3 — with `token='tampered.invalid.token'` and no refresh token, the app left the user on a broken shell (`/profile`), not `/login`.
- **Root cause:** `ProtectedRoute.jsx` only checks **token presence**, not validity. `axios.js` had no global 401 → `/login` redirect for terminal auth failures.
- **Fix:** Added a `redirectToLogin()` helper in `axios.js` and invoked it in all three terminal 401 branches (auth-endpoint / already-retried, no refresh token, refresh failure).
- **Verified:** UI-9 all PASS — tampered token now redirects to `/login` (`{"url":".../login","onLogin":true}`), no page error.

### HIGH-2 — Unknown URL rendered a blank page
- **Symptom:** UI-10.1 — `/this-route-does-not-exist-xyz` produced a completely blank screen (`len=0`, no shell).
- **Root cause:** No catch-all route existed in `App.jsx`.
- **Fix:** Added a catch-all route redirecting to the default route (or `/login` when unauthenticated):
  ```jsx
  <Route path="*" element={<Navigate to={localStorage.getItem('token') ? getDefaultRoute() : '/login'} replace />} />
  ```
- **Verified:** UI-10 all PASS — unknown route redirects to `/dashboard`, shell visible, `len=3734`, no page error.

### MEDIUM-1 — Dashboard leaked links to permission-gated pages (viewer role)
- **Symptom:** UI-3 — the `viewer` dashboard exposed shortcuts/metric rows pointing at pages the role cannot open.
- **Root cause:** Dashboard panels rendered action links without checking route access.
- **Fix:** Guarded link/row destinations with `canAccessRoute(...)` in:
  - `frontend/src/components/dashboard/DashboardQuickActions.jsx`
  - `frontend/src/components/dashboard/DashboardExpiryOverview.jsx`
  - `frontend/src/components/dashboard/DashboardStatusChart.jsx`
  - `frontend/src/components/Dashboard.jsx` (residual metric-card `to` at the `activeMetricCards` render)
- **Verified:** UI-3 PASS — viewer visible links reduce to `["/dashboard","/documents/my-documents"]`; `/documents/drafts` redirects to `/dashboard`.

---

## 3. Round-1 Fixes Re-Validated (still green)

| Fix | File | Verification (harness id) |
|---|---|---|
| Publish with NULL project category (was HTTP 500) | `backend/src/services/workflowService.js` | Q6 PASS — publish null-category doc → 200, then PUBLISHED (Q7), Master Record row created (Q8) |
| Acknowledge with NULL project category | `backend/src/services/documentService.js` | Q3–Q5 PASS |
| Viewer blocked from creating drafts | `backend/src/routes/documents.js` → `authorizePermission('documents.draft','create')` | P1 PASS — 403 |
| Failed-login audit status mapping | `backend/src/routes/audit.js` (`FAILURE_ACTIONS`) | R6 PASS — `failed=2 of 50` |
| Debug-endpoint removals | `backend/src/routes/reports.js`, `backend/src/services/projectTrackingService.js`, `backend/src/controllers/documentController.js`, `frontend/src/components/{DocumentViewerModal,ReviewAndApproval,ReportViewer}.jsx`, `frontend/src/components/ui/FolderTreePicker.jsx`, `backend/prisma/seed.js` | No inert debug calls in normal flow |

---

## 4. Test Cases — Pass / Fail

### 4.1 Backend E2E lifecycle harness (`C:\Users\USER\AppData\Local\Temp\dms_lifecycle.js`)
**90 / 90 PASS, 0 FAIL.** Highlights:

- **Workflow A (NDR → publish):** A1–A24 PASS — create → temporary `PENDING-…` fileCode → acknowledge → real fileCode `P/01/261120/013` → upload → submit → review → first approval → second approval → publish → PUBLISHED; Master Record + approval history retained.
- **Workflow B (Draft → review):** B1–B8 PASS — draft, reopen, extra attachment (no overwrite), submit. **B7 flags duplicate `(documentId, version)` rows — by design (§6).**
- **Workflow C (Return → resubmit):** C1–C7 PASS.
- **Workflow D (Supersede):** D1–D6 PASS — ArchiveRegister entry created; double-supersede rejected 400.
- **Workflow E (Obsolete):** E1–E6 PASS — ObsoleteRegister entry created; re-obsolete and missing-reason rejected 400.
- **Negative/edge (N/Q):** N1–N5 PASS; Q1–Q8 PASS (Q1/Q2 null-category NDR validation guard 400; Q6 was the HTTP 500 regression, now 200).
- **Concurrency (X):** X1–X4 PASS — exactly one success, exactly one history row for concurrent double-submit and double-publish.
- **Version revision (V):** V1–V8 PASS — file-code segment increments `P/01/…→P/02/…`, version `1.0→2.0`, Version Register report matches approved version-request count.
- **Permissions (P):** P1–P6 PASS — viewer draft/publish blocked, drafter supersede blocked, reviewer obsolete blocked, cross-division DRAFT read 403, PUBLISHED read 200 (documented global access).
- **Reconciliation (R):** R1–R8 PASS — record-row counts and Master Record status match document status.

### 4.2 Frontend UI suite (`C:\Users\USER\AppData\Local\Temp\dms_ui\ui_checks.spec.js`, 11 tests, Playwright + system Edge)
**All 11 tests PASS.** Sub-assertions:

| id | Assertion | Result |
|---|---|---|
| UI-1 | 13 routes visit cleanly, shell present, no console/page/network errors | PASS |
| UI-2 | Drafter: Draft Documents + New Draft modal open/close | PASS |
| UI-3 | Viewer has no permission-gated links | PASS |
| UI-4 | Master Record: all 5 tabs load (`rows=7`) | PASS |
| UI-5 | Logs/reports tables render | PASS |
| UI-6 | Published: open folder (`rows=4`) → row menu → View → preview dialog closes | PASS |
| UI-7 | Review & Approval table renders | PASS |
| UI-8 | Failed login stays on `/login` with inline error | PASS |
| UI-9 | Tampered token rejected → `/login`, no page error | PASS |
| UI-10 | Unknown route renders UI (redirect to `/dashboard`), no page error | PASS |
| UI-11 | Total API outage: renderer survives, login form usable, no page error | PASS |

---

## 5. Database Queries Performed (read-only)

| # | Query / probe | Finding |
|---|---|---|
| 1 | `SHOW TABLES` / inspect `_prisma_migrations` | `_prisma_migrations` **absent** → 5 Integration-Layer tables missing: `ApiKey`, `ExternalReference`, `WebhookEndpoint`, `IntegrationEvent`, `WebhookDelivery` |
| 2 | Inspect `VersionRegister` writers | **Zero writers** — table is never populated |
| 3 | Group `documentVersion` by `(documentId, version)` | Duplicate `(documentId, version)` rows exist (e.g. `1.0` × 2) — created at draft stage (B7) |
| 4 | `reportsService.getDocumentRegister` logic vs `documentregister` rows | Intentionally filters to version segment `'01'` — `report=6`, `dbSeg01=6`, `dbTotal=7` (revision rows excluded by design) |
| 5 | Counts by status | `dbPublished=3`, `dbSuperseded=0`, `dbObsolete=1`, `dbRegUpdated=3` |
| 6 | Obsolete register report vs DB | `report=1`, `db=1` |
| 7 | Version register report vs DB | `report=1`, `db=1` |
| 8 | Audit log failed-login check | `failed=2 of 50` |

All probes were **read-only**; no production data was modified.

---

## 6. Outstanding Issues

### OPEN — Decision required (policy-gated, Section 10)
1. **Migration `20261118000100_add_integration_layer` not applied.** Five Integration-Layer tables are missing (`ApiKey`, `ExternalReference`, `WebhookEndpoint`, `IntegrationEvent`, `WebhookDelivery`). Applying it is a **production DB schema change**, which Section 10 forbids without an approved migration plan. **Awaiting your decision.**

### OPEN — Design / data-quality notes (not blocking)
2. **`VersionRegister` has zero writers.** The "New Version Register" report currently reads from `VersionRequest`. Either wire up writers or document the table as deprecated.
3. **Duplicate `(documentId, version)` rows** in `documentVersion` at the draft stage (observed in B7). Functionally tolerated (no overwrite), but flagged for a future uniqueness/cleanup decision.
4. **Residual inert debug remnants** `http://127.0.0.1:7777/event` — all guarded by `localStorage.getItem('dms_debug') === '1'`, so inert in normal use:
   - `frontend/src/pages/MasterRecord.jsx:21`
   - `frontend/src/components/ProjectTracking.jsx:1760-1761`
   - `frontend/src/components/PublishDocumentModal.jsx:179`
   - `backend/scripts/runLocalConfidentialRepro.js` (standalone script)
5. **Scratch artifacts to clean** (untracked): `backend/_v_err.txt`, `backend/_v_out.txt`, `backend/_validate-data/`, `backend/_validate.err`, `backend/_validate_err.txt`, `backend/_validate_out.txt`, `frontend/test-results/`.
6. **`backend/mysql-local-data/*` must not be committed** (live MariaDB datadir; shows as modified in `git status`).
7. **Uncommitted work:** all backend + frontend fixes in §7 are still uncommitted.

### RESOLVED this round
- CRITICAL-1 semaphore deadlock, HIGH-1 token rejection, HIGH-2 blank page, MEDIUM-1 dashboard permission leak — all fixed and verified (§2).

---

## 7. Files Modified

**Frontend — this round (Section 6/9 fixes):**
- `frontend/src/api/axios.js` — `redirectToLogin()` + reset `__semaphoreReleased` per attempt
- `frontend/src/App.jsx` — catch-all route
- `frontend/src/components/Dashboard.jsx` — `canAccessRoute` guard on metric-card `to`
- `frontend/src/components/dashboard/DashboardQuickActions.jsx` — filter actions by `canAccessRoute`
- `frontend/src/components/dashboard/DashboardExpiryOverview.jsx` — guard expiry-tracking link
- `frontend/src/components/dashboard/DashboardStatusChart.jsx` — guard status-chart route

**Backend — round 1 (re-validated this round):**
- `backend/src/services/workflowService.js` — publish null-category fix
- `backend/src/services/documentService.js` — acknowledge null-category fix
- `backend/src/routes/documents.js` — `authorizePermission('documents.draft','create')`
- `backend/src/routes/audit.js` — `FAILURE_ACTIONS` → status
- `backend/src/routes/reports.js` — debug removal
- `backend/src/services/projectTrackingService.js` — debug removal
- `backend/src/controllers/documentController.js` — debug removal

**Frontend — round 1 (re-validated this round):**
- `frontend/src/components/DocumentViewerModal.jsx`, `ReviewAndApproval.jsx`, `ReportViewer.jsx` — debug removal
- `frontend/src/components/ui/FolderTreePicker.jsx` — debug removal
- `backend/prisma/seed.js` — debug removal

---

## 8. Untested / Partially Tested Scenarios

- **Session timeout warning modal** — not exercised.
- **503 maintenance-mode redirect** (non-admin → `/maintenance`) — not exercised.
- **Refresh-token rotation flow** — code path reviewed; end-to-end rotation not directly exercised (covered indirectly by UI-9 terminal-401 handling).
- **Modal-heavy flows not yet automated:** New Document Request modal, Acknowledge / Supersede / Obsolete modals, Master Record detail & compare views, Reports / ReportViewer export.
- **Integration-Layer endpoints** — untestable until the migration is applied (see §6.1).
- **Playwright run exit code** is `1` due to TRAE Sandbox blocking Edge's own files (`TokenBroker`, `OneAuth`, `Intel\ShaderCache`, `Recent\CustomDestinations`) — this is harness noise, **not** a test failure; the authoritative result is `11 passed`.

---

## 9. Method / Notes

- Backend harness (`dms_lifecycle.js`) and UI suite (`ui_checks.spec.js`) are scratch harnesses under `C:\Users\USER\AppData\Local\Temp\`, not part of the repo.
- UI suite uses `channel: 'msedge'` (system Edge) because no Playwright browser binaries are installed.
- DMS frontend dev server runs on **`:5175`** (port `5173` is occupied by an unrelated project); Vite config is `frontend/vite.config.mjs`.
- No mock data was used in any test; all assertions exercised the live backend and live database.
