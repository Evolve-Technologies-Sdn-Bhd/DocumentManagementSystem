# GLOBAL DMS PRODUCT REVIEW, INDUSTRY BENCHMARKING & SYSTEM IMPROVEMENT PROPOSAL

**System reviewed:** Document Management System (DMS) — `c:\Users\USER\Desktop\DocumentManagementSystem`
**Assessment date:** 2026-11-20
**Assessment type:** Discovery, benchmarking and recommendation only
**Status:** **NO CHANGES HAVE BEEN MADE.** No source code, database schema, records, API endpoints, business logic, UI, navigation, permissions, workflows or configuration files were modified. This document is submitted for review and approval.

---

## 0. EXECUTIVE SUMMARY

This DMS is a **substantially built, genuinely functional enterprise document-control platform**, not a prototype. It already implements a controlled-document lifecycle (draft → review → first approval → second approval → publish → supersede/obsolete → archive), document numbering with a code registry, versioning, folders with ACLs, project tracking with per-project document requirements, expiry tracking with renewal reminders, a Master Record register set, CRM registers, a calendar, an RFID/EPC tag registry, a Smart Documents template designer, a full audit-trail module, a role/permission model, an integration layer (API keys, external references, transactional-outbox webhooks), and optional AI assistance.

The assessment identified **five categories of issue**, in descending severity:

1. **Authorization is not enforced on a large part of the administrative API surface.** The user-management, role-management, backup/recovery, and most system-configuration endpoints are protected by *authentication only* — any logged-in user can create/delete users, reset passwords, alter role permissions, read and modify security policy and SMTP settings, and create/restore/delete system backups. This was confirmed by direct reading of the route files, not inferred.
2. **Data integrity risks in the document lifecycle.** Multi-step lifecycle transitions (publish, supersede, obsolete, archive) write to several tables without a database transaction, and seven modules each instantiate their own `PrismaClient`, which defeats cross-module transaction coordination and multiplies connection pools. Document lifecycle state is also duplicated across four "register" tables that can silently diverge.
3. **The workflow engine is fixed, not configurable.** A `Workflow`/`WorkflowStep` configuration model exists and can be edited in the UI, but the runtime engine in `workflowService.js` hard-codes the stage sequence. There is no parallel approval, no conditional routing, no delegation, and no escalation. The configuration screens are effectively orphaned.
4. **Records management is partial.** There is expiry tracking (document *validity* dates) and register tables, but **no retention schedule model, no legal hold, no disposition approval workflow, and no tamper-evident audit storage** — the four capabilities that distinguish a DMS from a Records Management System (RMS).
5. **UX operates in per-module silos.** There is no central task inbox and no global search. A reviewer or approver must visit each module to discover work. Tables, tabs and input fields are implemented inconsistently across modules, and compiled-in backup copies of components remain in the source tree.

The platform's **architecture is fundamentally sound** and does not require a rewrite. Backend layering (controllers → services → Prisma), the response envelope, permission middleware, the integration outbox pattern, and the frontend design-system primitives (`ui/Modal`, `ui/Table`, `PageHeader`, `Pagination`) are all reusable foundations. The recommended programme of work is therefore **hardening and completion**, not replacement.

**Recommendation count:** 46 (8 Critical, 11 High, 18 Medium, 9 Future) — full detail in Part 8, summary table in Part 10.

---

# PART 1 — UNDERSTANDING THE ENTIRE EXISTING DMS

## 1.1 Product purpose and stack

The system is an enterprise document-lifecycle platform for **controlled documents** — drafting, review and approval, publishing, versioning, superseding, retention and expiry — with integrated project tracking, CRM registers, a calendar and an RFID/EPC tag registry.

| Layer | Technology (verified) |
|---|---|
| Backend | Node.js, Express 4, Prisma 5.22, MySQL 8 (`utf8mb4`), JWT, bcryptjs, multer, nodemailer, speakeasy (2FA), exceljs, docx/docxtemplater/pizzip, mammoth, qrcode, archiver |
| Frontend | React 18, Vite 5, React Router 6, Tailwind CSS 3, MUI 7 + Emotion, Chart.js, docx-preview, mammoth, jsPDF |
| AI (optional) | OpenAI or Google Gemini, provider-selectable; degrades to HTTP 501 stubs |
| Rendering | Chromium (`puppeteer-core`) and/or LibreOffice for DOCX→PDF |
| Process manager | PM2 (`backend/ecosystem.config.cjs`) |
| Container | Docker Compose (MySQL + backend + nginx frontend + Caddy TLS) |

## 1.2 Backend architecture

`backend/src/` is cleanly layered and this layering is worth preserving:

- **`app.js`** — Express assembly: CORS, memory guard, static upload/branding serving, raw-body capture for HMAC verification, route mounting (26 mount points), error handler.
- **`index.js`** — bootstrap plus **six** background schedulers: maintenance expiry, retention cleanup, expiry reminders, review/approval reminders, calendar reminders, webhook dispatcher.
- **`config/`** — `app.js` (configuration constants), `database.js` (the **shared** Prisma client singleton).
- **`controllers/`** (30 files) — HTTP layer.
- **`routes/`** (28 files) — route definitions and permission middleware bindings.
- **`services/`** (56 files) — business logic.
- **`middleware/`** — `auth.js`, `errorHandler.js`, `integrationAuth.js`, `upload.js`.
- **`utils/`** — response formatter, JWT, errors, logging, document numbering, page numbering, EPC encoder, HMAC.

Every response passes through `utils/responseFormatter.js` producing `{ success, data, message }` — a consistent and commendable convention.

## 1.3 Frontend architecture

- **`App.jsx`** defines the full route table (public routes: `/`, `/login`, `/maintenance`, `/diagnostic`, `/documents/:id`, `/share/:token`; protected routes for every module; plus legacy redirect aliases such as `/drafts` → `/documents/drafts`).
- **`components/layout/`** + `Sidebar.jsx` + `Topbar.jsx` + `RightPanel.jsx` form the shell.
- **`components/ui/`** (24 files) is a genuine design-system layer: `Modal` (portal-based, 7 sizes), `Table` (sortable, sticky columns), `Button`, `TextInput`, `TextArea`, `SelectField`, `PageHeader`, `PageContainer`, `Pagination`, `EmptyState`/`EmptyPanelState`, `SearchableSingleSelect`, `MultiSelectSearchDropdown`, `ColumnSettingsButton`, `DataTableToolbar`, `SkeletonBlock`, `InlineSpinner`, `GlobalLoadingOverlay`, `FolderTreePicker`.
- **Permission mirroring:** `utils/permissions.js` defines the same module keys as the backend, and `ProtectedRoute.jsx` / `PermissionGate.jsx` gate routes and actions.
- **`components/dashboard/`** implements a dual-mode dashboard (admin vs. regular user).

## 1.4 Information architecture (as built)

Sidebar groups, in order, with their permission keys:

| Group | Item | Route | Permission |
|---|---|---|---|
| Dashboard | Overview | `/dashboard` | `dashboard.view` |
| Dashboard | Calendar | `/calendar` | `calendar.view` |
| Workspace | New Document Request | `/new-document-request` | `newDocumentRequest.view` |
| Workspace | My Documents Status | `/my-documents` | `myDocumentsStatus.view` |
| Workspace | Draft Documents | `/documents/drafts` | `documents.draft.view` |
| Projects | Project Dashboard / Project Tracking | `/project-dashboard`, `/project-tracking` | `projectTracking.view` |
| Document Control | Review & Approval | `/documents/review-approval` | `documents.review.view` |
| Document Control | Published Documents | `/documents/published` | `documents.published.view` |
| Document Control | Expiry Tracking | `/expiry-tracking` | `expiryTracking.view` |
| Document Control | Superseded & Obsolete | `/documents/archived` | `documents.superseded.view` |
| Records | Master Record | `/master-record` | `masterRecord.view` |
| Records | EPC Registry | `/rfid-epc-registry` | feature flag + `documents.rfidRegistry.view` |
| CRM | Tender Book Register | `/tender-book` | `crm.tenderBook.view` |
| CRM | FB Enquiry Register | `/fb-enquiries` | `crm.fbEnquiry.view` |
| Reporting | Logs & Report | `/logs` | `logsReport.view` |
| Settings | Configuration | `/config` | `configuration.*` |
| Settings | Profile Settings | `/profile` | always accessible when authenticated |

## 1.5 Document lifecycle as implemented

Two parallel status axes are maintained on `Document`:

- **`DocStatus`** — `DRAFT, PENDING_REVIEW, IN_REVIEW, PENDING_FIRST_APPROVAL, IN_FIRST_APPROVAL, PENDING_SECOND_APPROVAL, IN_SECOND_APPROVAL, READY_TO_PUBLISH, PENDING_ACKNOWLEDGMENT, ACKNOWLEDGED, APPROVED, PUBLISHED, REJECTED, RETURNED, SUPERSEDED, OBSOLETE, ARCHIVED` (plus legacy `PENDING_APPROVAL`, `IN_APPROVAL`).
- **`WorkflowStage`** — `DRAFT, REVIEW, FIRST_APPROVAL, SECOND_APPROVAL, READY_TO_PUBLISH, ACKNOWLEDGMENT, PUBLISHED, SUPERSEDED, OBSOLETE` (plus legacy `APPROVAL`).

Transitions are enforced in `services/workflowService.js` and use a **compare-and-set pattern** (`updateMany` with the expected stage in the `WHERE` clause, throwing `ConflictError` when `count === 0`). This is a genuinely good concurrency-safety choice and should be preserved and extended.

Lifecycle operations present: `submitForReview`, `reviewDocument`, `firstApproval`, `secondApproval`, `publishDocument` (requires a folder), `acknowledgeDocument`, `markAsSuperseded` (requires a superseding published document), `markAsObsolete` (requires a reason), `archiveObsoleteDocument` (requires a target folder). Supersede/obsolete additionally has its own request workflow (`supersedeRequestService.js`).

## 1.6 How information moves through the system

```
NDR (New Document Request)
  └─▶ Draft (folder + owner + assignments)
        └─▶ Review ──▶ 1st Approval ──▶ 2nd Approval ──▶ Ready to Publish
              │                                                    │
              └── Return / Reject ──▶ Draft (manual restart)       ▼
                                                              Published ──▶ Share link / Public preview
                                                                  │  │
                            Version Request (NVR) ────────────────┘  │
                                                                     ├─▶ Superseded (+ ArchiveRegister)
                                                                     └─▶ Obsolete (+ ObsoleteRegister) ──▶ Archived
Registers: DocumentRegister / VersionRegister / ObsoleteRegister / ArchiveRegister / CodeRegistry
Audit:     AuditLog (written by auditLogService on every significant action)
Events:    IntegrationEvent (outbox) ──▶ WebhookDelivery (HMAC-signed)
```

## 1.7 Dependencies, duplication and incompleteness

| Category | Finding |
|---|---|
| **Duplication** | Four register tables duplicate `Document.status` and `DocumentVersion` data and must be kept in sync by `masterRecordSyncService.js`. A `cleanupOrphans.js` script exists precisely because drift happens. |
| **Duplication** | Seven modules construct their own `PrismaClient` instead of importing the shared singleton in `config/database.js`. |
| **Duplication** | Compiled backup components remain in the tree (`TenderEntryModal.backup_20261106_120112.jsx`, `FbEnquiryEntryModal.backup_20261106_120112.jsx`). |
| **Orphaned feature** | `Workflow`/`WorkflowStep` configuration is fully modelled and editable but the runtime engine does not consume it. |
| **Incompleteness** | No retention schedule, no legal hold, no disposition workflow, no soft delete (`deletedAt`), no rate limiting, no security headers, no central task inbox, no global search, no OCR, no document comparison, no e-signature. |
| **Unsupported process** | Returned documents cannot be resubmitted (submit-for-review only accepts `DRAFT`). |

---

# PART 2 — GLOBAL INDUSTRY BENCHMARKING

Benchmarks were researched from official vendor documentation and authoritative standards bodies. Evidence is marked: **[V]** verified in vendor/standard source, **[BP]** industry best practice, **[I]** analyst inference. Sources are listed in Part 10.6.

## 2.1 Platform capability summaries

### Microsoft SharePoint / SharePoint Premium (Syntex) + Purview **[V]**
Versioning records date/time/user per version, creates a new version on save, supports restore, and defaults to 500 versions per library. Retention labels can declare an item a **record** or **regulatory record**: for a locked record, *Edit contents* and *Delete* are blocked; for a regulatory record even *Edit properties* and *Remove label* are blocked and the label **cannot be removed by anyone, including a Global Admin**. Retention can only be extended, never shortened. Purview provides a **file plan** (bulk import/export of retention labels with reference ID, business function, category, authority type, citation), **event-based retention**, **disposition review** and **proof of deletion**. Syntex adds trainable classifiers/extractors and LLM "autofill columns"; Copilot summarises files.
- Sources: [versioning basics](https://learn.microsoft.com/en-us/microsoft-365/community/versioning-basics-best-practices), [records management](https://learn.microsoft.com/en-us/purview/records-management), [file plan](https://learn.microsoft.com/en-us/purview/file-plan-manager), [event-driven retention](https://learn.microsoft.com/en-us/purview/event-driven-retention), [autofill columns](https://learn.microsoft.com/en-us/microsoft-365/documentprocessing/autofill-overview)

### OpenText Content Management / Records Management **[V]**
Manages information "from creation or capture through archiving and disposition". Records governance includes default classification on upload, inheritance from folder or business-workspace template, classification by creator role/document type, classification through workflow, designation from search results, and automatic background classification. Provides legal holds, under-disposition control, visual record indicators, role-based dashboards and "hundreds of actions" of audit. Claims DoD 5015.02-STD v3, UK TNA 2002, VERS, ISO 15489 (with internal policies), SEC 17a-4 and FDA 21 CFR Part 11 support.
- Sources: [OpenText RM product overview (PDF)](https://www.opentext.com/assets/documents/en-US/pdf/opentext-po-records-management-en.pdf), [Content Manager retention/disposal](https://www.microfocus.com/documentation/content-manager/23.4/ContentManager_en/Content/trim_basic_steps_to_archiving.html)

### M-Files **[V]**
Metadata-driven: objects are organised by *what* they are, not *where* they live. Permissions can be set for a whole class, a single document, **or a single version**, and can be driven by user, role, group **or metadata property**. Enforces "one authoritative copy with a link". Configurable workflow engine with task assignment, deadlines, reminders, escalation, e-signature and per-stage audit trail; supports per-department branches (HR onboarding, contract approvals, engineering change orders). **M-Files Aino** is a permission-aware AI layer over a knowledge graph that applies and explains metadata, summarises and answers questions with citations.
- Sources: [M-Files document control](https://www.mfiles.com/supplemental/document-control/), [M-Files workflow](https://www.mfiles.com/supplemental/document-management-workflow/), [Aino user guide](https://userguide.m-files.com/user-guide/latest/eng/using_m-files_aino.html)

### DocuWare **[V] / ⚠️**
Automatic version management per in-cabinet processing plus manual check-out/check-in with rollback to previous versions; digital signature support. **Web-based Workflow Designer** with file/version model: a migrated process only becomes active once **published**; running instances continue on the previously published version; Designer rights control edit/publish/retract. Intelligent Indexing uses ML to extract and index data without predefined templates. Available cloud or on-prem with the same functional scope. *Retention-schedule mechanics and legal hold could not be verified from official documentation in this review — flagged for further verification.*
- Sources: [DocuWare full features (PDF)](https://cdn2.hubspot.net/hubfs/1380482/DocuWare/Docuware%20Ebooks/Docuware%20Full%20Features.pdf), [web-based Workflow Designer](https://knowledgecenter.docuware.com/docs/news-713-webbased-workflow-designer), [workflow rights KBA](https://dwsupport.microsoftcrmportals.com/en-US/knowledgebase/article/KBA-36664)

### Laserfiche **[V]**
**Retention Schedule** governs storage duration; records enter the retention period after a **cutoff**; schedules are created in the Administration Console and applied to **record series, record folders or individual records**, require the Records Management privilege, and define retention duration, interim transfer order/duration/location/instructions, final disposition, and the triggering event for an alternate schedule. On disposition, content is removed but **metadata, RM state and field values are retained** as proof of correct retention. DoD 5015.2-STD v3 certified (historical certification — see caveat below). Process Automation templates include "Approve or Deny" with deadline branches, "Repeat Routing for Approval", and "Direct Approval".
- Sources: [Retention Schedule](https://go.laserfiche.com/support/webhelp/laserfiche/9.2/en-us/userguide/content/RecordsManagement/Retention_Schedule.htm), [DoD certification](https://www.laserfiche.com/resources/blog/laserfiche-9-certified-dod-5015-2-std-version-3/), [Approve or Deny template](https://doc.laserfiche.com/laserfiche.documentation/12/userguide/en-us/content/process-approve-or-deny-template.htm)

### Hyland OnBase / Content Innovation Cloud **[V] / ⚠️**
Process automation that "rout(es) documents and manage(s) exceptions using configurable workflows, customizable forms and built-in rules"; case management; collaboration with version control and notifications; interactive dashboards and audit trails; lifecycle automation for "secure retention and destruction". Intelligent Document Processing classifies documents with generative AI and **routes unclassifiable or multi-class documents to manual exception review**. Integration via API with external credit/ERP suites.
- Sources: [onbase.com](https://onbase.com), [Hyland IDP overview (PDF)](https://www.hyland.com/-/media/Project/Hyland/HylandV2DotCom/pdfs/intelligent-medrecords-overview.pdf), [Banco de Antigua case study](https://www.hyland.com/en/customers/banco-antigua)

### Box (Governance / Shield / AI) **[V]**
Retention policies: content under retention **cannot be permanently deleted**, even from Trash, until retention expires. Policies are modifiable or **non-modifiable** ("designed to meet regulatory requirements such as FINRA") — once applied to non-modifiable content, retention cannot be removed or shortened. **Legal Hold** can be placed on files, folders or **custodians**, with an optional content-creation date range that becomes permanent once active, and a Legal Holds report for verification. **Box Shield** provides classification labels (often aligned to the CISA Traffic Light Protocol), access policies "based on how content is classified", automated classification and malware detection. Shares the domain with Microsoft Purview DLP for blocking sensitive-data actions.
- Sources: [Governance settings](https://support.box.com/hc/en-us/articles/1500007168782-Governance-Settings), [editing a retention policy](https://support.box.com/hc/en-us/articles/7765068509843-Editing-a-Retention-Policy), [legal hold policy](https://support.box.com/hc/en-us/articles/360044193893-Creating-and-Editing-a-Legal-Hold-Policy), [Box Shield classification](https://support.box.com/hc/en-us/articles/24780035486867-Getting-Started-With-Box-Shield-Classification-and-Access-Policies), [Purview DLP](https://learn.microsoft.com/en-us/purview/dlp-learn-about-dlp)

## 2.2 Standards frameworks

| Standard | What it requires (abridged) | Relevance to this DMS |
|---|---|---|
| **ISO 15489-1:2016** **[V]** | Concepts and principles for creation, capture and management of records; records = content + metadata describing context, structure and management through time; risk-based decisions; policies, responsibilities, monitoring, training; records controls. Adopted in Malaysia as **MS 2223**. | Framework anchor for metadata, audit and lifecycle. |
| **ISO 16175-1/2/3** (ICA-Req) **[V]** | Part 2 gives functional requirements for digital records management systems; Part 3 covers records created in business systems (fixed record, record metadata, encryption/timestamping). | Requirements checklist for any future retention/legal-hold build. |
| **ISO 19475:2021** **[V]** | Minimum requirements to maintain **authenticity, integrity and readability** of documents in an EDMS; models receiving, processing, delivering. | Directly relevant to numbering, immutability and audit. |
| **ISO 30300 / 30301 / 30302** **[V]** | Records management **management-system** framework; 30301 is certifiable; strategy, policy, accountability, continual improvement. | Governance roadmap, not a feature set. |
| **ISO 27001:2022 Annex A** **[V]** | A.5.12 classification of information, A.5.13 labelling, A.5.15 access control (least privilege), A.5.16 identity management, A.5.9–5.11 asset inventory/acceptable use/return. | Maps directly to classification labels, access policies and identity lifecycle. |
| **DoD 5015.02-STD** **[V]** | v3 (April 2007) design criteria for RM applications; NARA endorsed v3 for all Federal agencies. **Caveat: the DoD product-test programme was later cancelled — treat historical certifications as historical evidence and evaluate against DoDI 5015.02 / DoDM 8180.01.** | Reference capability list. |
| **MoReq2010** **[V]** | Minimum functionality for a compliant records system; European de facto standard, used as an RFP and audit basis. | RFP-grade requirement list. |
| **ISO 9001:2015 clause 7.5** **[V]** | 7.5.2 creating/updating documented information requires identification, format and **review and approval for suitability**; 7.5.3 control requires availability, protection, distribution, storage, legibility, change control, **retention and disposition**, control of external documents, prevention of unintended alteration. | This is the clause the current lifecycle already targets. |
| **NARA 36 CFR 1234 / 44 U.S.C.** **[V]** | Creation, maintenance, use and disposition requirements for electronic records; records must be scheduled. | Reference for retention scheduling. |
| **ARMA GARP** **[V]** | Accountability, Integrity, Protection, Compliance, Availability, Retention, Disposition, Transparency (a 2025 revision consolidated to seven principles — verify against ARMA). | Governance self-assessment. |
| **Malaysia — National Archives Act 2003 (Act 629)** **[V]** | Public records concluded for >5 years, electronically produced records, and non-current permanent-value records must be transferred; **electronically produced records are to be transferred immediately when no longer active**. ANM's DDMS procedure derives from **MS 2223 (≈ISO 15489)** and MS ISO 16175. | Applies if the DMS is used by or for public-sector bodies. |
| **Malaysia — PDPA 2010 (Act 709)** **[V]** | Seven principles including **Security** (s.9) and **Retention** (s.10: personal data must not be kept longer than necessary and must be destroyed or permanently deleted when no longer required). | Directly relevant to any retention/disposition build and to personal data in users, CRM and project records. |

**Compliance position statement (deliberate):** *the presence of lifecycle, versioning and audit features does **not** make this system ISO 15489, ISO 16175 or ISO 19475 compliant.* Those standards require records controls, retention/disposition, documented policy, assigned responsibilities and monitoring — several of which are absent (see Part 4). Any compliance claim must follow a formal gap assessment against the chosen standard.

## 2.3 What industry leaders have in common

Across all seven platforms **[BP]**:
1. Version-per-change with the ability to view, compare and restore history.
2. Classification **labels/metadata** as the primary organising and access-control mechanism — not folders.
3. A **configurable** workflow engine with deadlines, reminders and (in M-Files, Laserfiche, Hyland, SharePoint/Power Automate) **branching and escalation**.
4. Retention **schedules** with cutoff events, plus **legal hold** that overrides disposal.
5. Disposition as a **reviewed, evidenced process** (disposition review, proof of deletion, retained metadata).
6. Search over **metadata + full text**, with OCR/ML indexing for scans.
7. Per-action audit trails, ideally tamper-evident, retained for a defined period.
8. Increasingly, **permission-aware AI** for classification, extraction, summarisation and Q&A.

---

# PART 3 — COMPARING THE EXISTING DMS AGAINST GLOBAL PRACTICE

| Area | Existing DMS | Global Benchmark | Gap / Opportunity | Recommendation |
|---|---|---|---|---|
| **Document lifecycle** | Full draft→review→2×approval→publish→supersede/obsolete→archive; compare-and-set transition guards | SharePoint/M-Files/DocuWare equivalent, plus restore and version-level lock | Returned documents cannot be resubmitted; no side-by-side revision comparison | DMS-012, DMS-028 |
| **Workflow engine** | Hard-coded sequential stages; no parallel, conditional, delegation or escalation | DocuWare Designer (publish/version), M-Files branches+escalation, Laserfiche repeat-routing | `Workflow`/`WorkflowStep` configuration is orphaned; workflows cannot vary by document type or division | DMS-010, DMS-011 |
| **Document numbering** | Configurable segments, per `projectCategoryId`+`documentTypeId`, atomic via `CodeRegistry` unique `[projectCategoryId, codeKey, runningNumber]` | SharePoint unique-ID/metadata; M-Files class-based naming | Genuinely strong. Opportunity: company-level prefixes and per-division sequences | DMS-010 (dependency) |
| **Versioning** | Major/minor increments, version rows retained, register mirrored | M-Files per-version permissions; SharePoint restore/compare | No permission on a specific version; no comparison | DMS-028, DMS-044 |
| **Records management** | Expiry profiles, watchers, renewal history, register tables | Retention schedules + legal hold + reviewed disposition (Laserfiche, Box, OpenText, Purview) | **No retention schedule, no legal hold, no disposition workflow** | DMS-013 |
| **Audit trail** | Per-action audit with per-category toggles and retention days | OpenText "hundreds of actions"; Purview record-activity logging; tamper-evidence | Logs are mutable, non-hash-chained, and some sensitive actions are unlogged | DMS-006 |
| **Access control** | RBAC + folder ACL + division scope + per-document confidential list + share links | M-Files metadata/property-based permissions; Box classification-driven access policies | No ABAC/classification-driven policy; confidential access not tied to labels | DMS-044, DMS-019 |
| **API authorization** | Route-level permission middleware exists but is applied inconsistently | Uniform policy enforcement | **Admin endpoints authenticate but do not authorize** | DMS-001 |
| **Search** | Per-module client-side filtering only | Global metadata + full-text search, facets, saved searches, OCR | No global search, no full-text index, no OCR | DMS-015, DMS-027 |
| **Task visibility** | Dashboard counters + notification panel; discovery is per-module | Consolidated task inbox/to-do list (OnBase, M-Files, Laserfiche) | No single place for "what must I do next" | DMS-014 |
| **Notifications** | In-app + email, four scheduler-driven reminder jobs, user preferences | Deadline-based reminders, escalation chains, digest cadence | No escalation; schedulers are in-process and non-durable | DMS-011, DMS-032 |
| **Controlled distribution / read-and-understood** | Acknowledgement stage exists in the lifecycle | Purview record actions; distribution/accreditation tracking | No distribution list, no per-recipient read-receipt tracking, no withdrawal notice | DMS-016 |
| **Signatures** | None | M-Files e-signature (21 CFR Part 11); DocuWare digital signature | Absent | DMS-018 |
| **Sharing** | Tokenised, hashed, expiring, revocable share links; public preview | Box/SharePoint link controls incl. password and download restriction | No password, no download restriction, no watermarking | DMS-019 |
| **Deletion / recovery** | Hard delete; permanent purge for privileged roles | Soft delete / recycle bin with restore | No soft delete; no recovery of deleted documents | DMS-020 |
| **Data model** | 86 models, 33 enums, 61 migrations; register tables duplicate status | Normalised record + retention entities | Divergence risk between `Document.status` and four registers | DMS-008, DMS-022 |
| **Multi-tenancy** | Divisions + project categories; **no company/organisation table** | Tenant isolation where multi-client hosting is required | Cross-company leakage is preventable only by correct permission checks | DMS-001, DMS-046 |
| **UI consistency** | Shared `ui/` primitives exist but are not universally adopted | Consistent design system | Divergent tabs, hardcoded colours, in-place backup files | DMS-024, DMS-025 |
| **Observability** | Console logging, memory guard, `/healthz` `/readyz` | Structured logs, metrics, tracing, alerting | No structured logging, metrics or error tracking | DMS-034 |
| **Backup/DR** | Manual backup create/list/download/restore/delete; **no authorization** and no schedule | Automated, off-site, tested restore | Manual only, unprotected endpoints, no DR runbook | DMS-001, DMS-033 |
| **AI** | Provider-selectable assistant wired to `AI_ENABLED`; no document intelligence | M-Files Aino, Syntex models, Hyland IDP, Copilot | No classification, extraction, summarisation or semantic search | DMS-040, DMS-041 |

---

# PART 4 — COMPLETE MODULE-BY-MODULE IMPROVEMENT REVIEW

For each module: **Business logic · Data architecture · Functionality · UX · Security/Governance · Scalability.**

### 4.1 Dashboard
- **Business logic:** Sound. Two modes (admin view with global queue/published/superseded metrics; personal view with My Drafts, Needs Action, Waiting, Published). "Needs Action" aggregates assigned + returned + pending acknowledgement — a good idea and the seed of a task inbox.
- **Data architecture:** Aggregates from `/reports/dashboard`, `/reports/dashboard-stats`, `/expiry-tracking/dashboard`, `/documents/my-status`, `/documents/review-approval` in separate calls — five round-trips on load.
- **Functionality:** Complete for its current scope. Missing: overdue-approval indicator, personal retention/acknowledgement queue, saved dashboard layouts.
- **UX:** Metric cards, expiry progress bars, doughnut chart, mini-calendar, quick actions, activity table with column settings. Strong. Weakness: "Needs Action" is a **number, not a link into a filtered list**.
- **Security/Governance:** Dashboard data is computed server-side with division scoping — appropriate.
- **Scalability:** Five sequential aggregations per load will degrade as the document table grows; needs caching or a single aggregate endpoint.

### 4.2 New Document Request (NDR)
- **Business logic:** Intake and routing into drafting. Consistent with practice.
- **Data architecture:** Document request rows plus `CodeRegistry` registration. Note the project-memory constraint that NDR list filtering must use the **new** `fileCode` from an NVR, not the original version's code — a symptom of the NDR/NVR duality.
- **Functionality:** Create / acknowledge / reject / delete; template picker; pagination. NVR/NDR alignment was recently corrected.
- **UX:** Form plus table; pagination now slices both the table and the mobile card view (a known past bug).
- **Security/Governance:** Correctly gated by `newDocumentRequest` permissions at the route level (`view`, `create`, `acknowledge`) — **this is the pattern the rest of the API should follow**.
- **Scalability:** Adequate. The NDR↔NVR duality would benefit from unification (see DMS-022).

### 4.3 Draft Documents
- **Business logic:** Draft creation, re-upload, submit-for-review. Returned documents cannot be resubmitted — `submitForReview` only accepts `DRAFT` (`workflowService.js`).
- **Data architecture:** `Document` + `DocumentVersion` + file storage under `uploads/documents/[year]/[month]/[category]/[fileCode]/`. Versions encrypted with AES-256-GCM (async, `setImmediate`).
- **Functionality:** Missing: co-authoring/check-out, draft autosave, draft comparison.
- **UX:** Upload modal, document preview modal. Recent fix closes the draft modal when the preview modal closes.
- **Security/Governance:** `POST /:id/submit-for-review` and `DELETE /drafts/:id` have **no permission middleware** (`documents.js:23-24`).
- **Scalability:** File storage is local-disk; a shared volume is assumed by the deployment fallback logic.

### 4.4 Review & Approval
- **Business logic:** Sequential, hard-coded. `DocumentAssignment` rows (types REVIEW, FIRST_APPROVAL, SECOND_APPROVAL, ACKNOWLEDGMENT) with `expiresAt` and `lastReminderSentAt`. Reminders run hourly via `reviewApprovalReminderService`.
- **Data architecture:** `ApprovalHistory` provides a per-action trail. Good.
- **Functionality gaps:** No parallel approval, no conditional routing by document type/division, no delegation, no escalation, no bulk approval, no due-date-driven SLA view.
- **UX:** Stage filter, role-based action visibility, four dedicated modals. Deep-linking via `docId` query parameter exists. Missing: any indication of *who is next* and *when it is due*.
- **Security/Governance:** The `WHEN`-clause guard prevents double-approval races. But first/second-approval assignment validation is split between the reminder service and the workflow service — a single policy location would reduce drift.
- **Scalability:** Fine for tens of approvers; the hourly sweep is O(pending assignments).

### 4.5 Published Documents
- **Business logic:** Folder-tree navigation, drag-and-drop organisation, bulk import, sharing, expiry configuration, archiving.
- **Data architecture:** Folder → `FolderDivision` → division scoping; `DocumentConfidentialAccess` for restricted items.
- **Functionality:** Bulk import is gated by `documents.published.create`; `bulk-move` is **not gated**. No bulk download, no bulk metadata edit, no bulk archive.
- **UX:** Folder tree plus table. Strong. Weakness: no "recently published" default view, no column-set presets shared with other modules.
- **Security/Governance:** `GET /:id/download`, `GET /:id/preview` and share-link management carry no permission middleware. Download restriction and watermarking are absent.
- **Scalability:** Folder trees with deep recursion will need caching as volume grows.

### 4.6 My Documents Status
- **Business logic:** Owner-centric tracker with a stage stepper — a strong UX idea.
- **Data architecture:** Reads across `Document`, `DocumentVersion`, `ApprovalHistory`, `DocumentAssignment`.
- **Functionality:** Read-only. Could surface "action required by you" items, which would make it the natural home of a task inbox.
- **UX:** Progress stepper and stage-count bar are best-in-class within the app and should be reused elsewhere.
- **Security/Governance:** Owner-scoped — appropriate.
- **Scalability:** Fine.

### 4.7 Superseded & Obsolete
- **Business logic:** Sub-request workflow (review → approve) restricted to admin/document-controller; on approval the document is superseded/obsoleted and a register row is created (7-year default retention date on archive register).
- **Data architecture:** `SupersedeObsoleteRequest` + `ArchiveRegister`/`ObsoleteRegister`. Project memory records a real defect already fixed: `markAsSuperseded` had to be scoped by **both** `fileCode` and `projectCategoryId` to prevent cross-category updates — evidence that these register writes are fragile.
- **Functionality:** Review/approve/archive actions present. Missing: scheduled review, withdrawal notice to holders.
- **UX:** Filters by action type and status; dedicated modals per step.
- **Security/Governance:** Approver restriction implemented in the service. The register writes are **not transactional** with the `Document` update.
- **Scalability:** Fine.

### 4.8 Master Record
- **Business logic:** Five tabs (New Documents, New Versions, Obsolete, Old Versions, Consolidated) over the register tables. This is the closest thing to a formal records register.
- **Data architecture:** Register tables duplicate `Document`. Recent fix added null guards and `approvedAt || updatedAt || createdAt` fallbacks to cure a 01/01/1970 display bug — again a symptom of denormalised data.
- **Functionality:** CSV download. Missing: retention scheduling from the register, disposition actions, legal hold.
- **UX:** Tab set with dense tables; date-safety now handled.
- **Security/Governance:** Register integrity depends on `masterRecordSyncService` being invoked; not every lifecycle path demonstrably calls it.
- **Scalability:** Denormalised registers are fast to read but expensive to keep consistent.

### 4.9 Expiry Tracking
- **Business logic:** Expiry profiles, watchers, four reminder levels, renewal history — the most complete governance module in the system.
- **Data architecture:** `DocumentExpiryProfile` (1:1 with document), `DocumentExpiryWatcher`, `DocumentExpiryReminderRecipient`, `DocumentExpiryRenewalHistory`. Indexed on `expiryStatus`, `renewalStatus`, `expiryDate`.
- **Functionality:** Reminder configuration, renewal workflow, PDF (jsPDF) and CSV export, "apply settings to existing profiles".
- **UX:** Stat cards, edit modal with four reminder levels. Good.
- **Security/Governance:** Reminders respect recipients configured per level. No escalation if a renewal stalls.
- **Scalability:** Daily sweep is O(expiring profiles) — acceptable and indexed.

### 4.10 Calendar
- **Business logic:** Month/week/day/agenda views, custom events, reminders with delivery types, viewer sharing; synthetic events generated from documents/deadlines/projects.
- **Data architecture:** `CalendarEvent`, `CalendarCustomEvent`, `CalendarEventReminder`, `UserCalendarPreference`, plus `_enum_calendareventsource`.
- **Functionality:** Complete for its scope.
- **UX:** The richest UI surface in the app; mini-calendar on the dashboard.
- **Security/Governance:** Scope selector (All / My / System). Division scoping of shared events should be verified.
- **Scalability:** Event generation needs care as document volume rises.

### 4.11 Project Tracking
- **Business logic:** The most configurable domain model — projects, categories, iterations, stage definitions, per-category per-stage document requirements, requirement overrides, PIC assignment, change requests.
- **Data architecture:** 11 models including `ProjectCategoryDocumentRequirement`, `ProjectSetupDocumentRequirementDefault/Override` (each with its own confidential-access sibling), `ProjectIterationDocumentItem`, `ProjectRequiredDocumentPicAssignment`. This is comprehensive but is where normalisation pressure is highest.
- **Functionality:** Project dashboard, required-document checklist, PIC assignment, linked drafts.
- **UX:** Check-list driven; strong alignment with real project work.
- **Security/Governance:** Requirement-level confidential access exists — good. **Cross-company movement and record access are restricted to Admin and Document Controller** per project memory.
- **Scalability:** The default/override matrix will grow combinatorially with categories × stages × document types.

### 4.12 CRM (Tender Book, FB Enquiry)
- **Business logic:** Registers with assignees and follow-up logs, year-based sequence.
- **Data architecture:** `CrmTenderEntry`, `CrmTenderAssignee`, `CrmTenderFollowUpLog`, `CrmTenderSequence`, and the FB-enquiry equivalents.
- **Functionality:** Import (`CrmImportModal`), export, follow-up logging.
- **UX:** Connector to the CRM UX is well covered; **backup copies of two entry modals remain in the tree**.
- **Security/Governance:** Tender data can include personal data → PDPA 2010 retention and security principles apply.
- **Scalability:** Fine.

### 4.13 RFID / EPC Registry
- **Business logic:** SGTIN-96 EPC tag identity per document version, with encoding and a tracking status (`REGISTER`, `CHECK_IN`, `CHECK_OUT`, `ARCHIVE`).
- **Data architecture:** `DocumentEpcRegistryRecord` with unique `documentVersionId` and unique `epcHex` — correct.
- **Functionality:** Feature-flagged (off by default) with a dedicated encoder route and a companion React Native "RFID SDK APK" project in the repository root.
- **UX:** Date range and file code filters, export.
- **Security/Governance:** Gated by `documents.rfidRegistry.view` plus a server-side feature flag — correct pattern.
- **Scalability:** Fine.

### 4.14 Smart Documents
- **Business logic:** Template designer, style profiles, dynamic form fields, placeholders, generated content and PDF export.
- **Data architecture:** Nine models (`SmartTemplate`, `SmartTemplateSection`, `SmartTemplateVersion`, `SmartFormField`, `SmartFieldMapping`, `SmartDocumentContent`, `SmartDocumentFieldChange`, `SmartDocumentStyleProfile`).
- **Functionality:** Server- and client-side feature-flagged; degrades cleanly.
- **UX:** `FormBuilder`, `RichTextEditor`, `ChecklistEditor`, `FormFieldRenderer`, `SmartTemplateDesigner`.
- **Security/Governance:** Feature-flag gating is correct.
- **Scalability:** Content stored as structured JSON — good for growth.

### 4.15 Logs & Reports
- **Business logic:** Four tabs (Activity Logs, User Activity, System Reports, Analytics) with error boundaries per tab.
- **Data architecture:** `AuditLog`, `GeneratedReport`. Audit settings include retention days, per-category toggles and alert toggles.
- **Functionality:** Filtering by date range, module, action, user, free text; CSV export of user activity; analytics with 7-day timeline, module usage, status breakdown, top users.
- **UX:** Error-boundary-wrapped tabs; pill-style tabs differ from the rest of the app.
- **Security/Governance:** Correctly gated by `logsReport.*` permissions. **Audit logs are mutable; there is no hash chain, write-once constraint or immutability guarantee.**
- **Scalability:** Audit search must query `description` (not a non-existent `details` column — a previously fixed defect).

### 4.16 Configuration
- **Business logic:** Seven tabs — General System Settings, Master Data, Roles & Permissions, Templates & Workflows, Audit Settings, Backup & Recovery, Database Cleanup.
- **Data architecture:** `Configuration` key-value store plus `Template`/`TemplateRequest`, `DocumentType`, `Department`, numbering/upload/version-control/RFID/smart-document/retention/expiry/notification/landing/login/branding/theme/security settings.
- **Functionality:** Breadth is excellent. **However: the workflow tab edits data the engine ignores; there is no custom-metadata field designer.**
- **UX:** Tab styling is inconsistent with the rest of the app; settings screens are long single-scroll forms.
- **Security/Governance:** **Nearly every configuration endpoint is behind authentication only.** Security settings (password policy, lockout, 2FA) and SMTP/email settings are readable and writable by any authenticated user. Backup endpoints likewise.
- **Scalability:** Key-value configuration is fine; it needs cache invalidation discipline.

### 4.17 Profile Settings, Maintenance, Public Portal
- **Profile Settings:** Four tabs (profile, security, notifications, preferences) including theme mode; accessible without a module permission by design.
- **Maintenance Mode:** Manual or scheduled, public status endpoint, checked in `authenticate`, and the only configuration area correctly protected by `requireSystemAdmin`.
- **Public Portal:** Branded landing page, public share links, document download links, branding file serving with a hardened basename regex, public statistics and contact form.

---

# PART 5 — NEW FEATURES AND IMPROVEMENT OPPORTUNITIES

Each item states what it does, the business problem, how the benchmark implements it, whether the DMS already partially supports it, and the recommendation to introduce (or not).

| # | Feature | Business problem solved | Benchmark implementation | Partial support today | Verdict |
|---|---|---|---|---|---|
| 1 | **Unified document search** | Users cannot find a document unless they know which module it lives in | Syntex advanced metadata search; M-Files metadata search | Per-module client-side filtering only | **Introduce** (DMS-015) |
| 2 | **Centralised task inbox** | Reviewers/approvers must hunt across modules for work | OnBase case tasks, M-Files to-do, Laserfiche to-do pane | Dashboard "Needs Action" counter | **Introduce** (DMS-014) |
| 3 | **Lifecycle dashboard per role** | No single view of stage-level backlog | OpenText role-based RM dashboards | Admin/user dashboard modes exist | **Extend** (DMS-014) |
| 4 | **Automated workflow routing** | Workflow is identical for every document type | DocuWare Designer; M-Files branching | `Workflow` model exists but unused | **Introduce** (DMS-010) |
| 5 | **Approval escalation** | Overdue approvals stall indefinitely | M-Files escalation; Laserfiche deadline branches | Reminders only | **Introduce** (DMS-011) |
| 6 | **Review reminders** | — | M-Files reminders | **Already implemented** (`reviewApprovalReminderService`) | **Retain** |
| 7 | **Expiry monitoring** | — | M-Files expiration reminders | **Already implemented** with 4 levels | **Retain** |
| 8 | **Periodic document review** | Expiry ≠ scheduled review; policies must be re-approved on a cadence | ISO 9001 §7.5.2 review; Purview review actions | Expiry only | **Introduce** (DMS-017) |
| 9 | **Distribution & acknowledgement tracking (read-and-understood)** | No proof that a controlled document was received/understood | Accreditation/acknowledgement sets in ECM suites | Acknowledgement **stage** exists in the lifecycle | **Extend** (DMS-016) |
| 10 | **Document comparison between revisions** | Reviewers read full documents to find changes | SharePoint/Word compare; M-Files version compare | None | **Introduce** (DMS-028) |
| 11 | **Document relationship mapping** | Supersedes/references/companion documents are invisible | M-Files relationships; OpenText business workspaces | `supersededById` only | **Introduce** (DMS-029) |
| 12 | **Full-text indexing** | Content within documents is not searchable | All benchmark platforms | None (filename/metadata filters only) | **Introduce** (DMS-015) |
| 13 | **OCR** | Scanned documents are unsearchable | DocuWare Intelligent Indexing; Syntex | None | **Introduce** (DMS-027) |
| 14 | **Document templates** | — | Laserfiche templates; Syntex content centre | **Already implemented** (`Template`, `SmartTemplate`) | **Retain / extend** |
| 15 | **Bulk operations** | Repetitive one-at-a-time edits | All platforms | Bulk import, bulk folder move only | **Extend** (DMS-025) |
| 16 | **Electronic signatures** | Wet-signature process; auditability | M-Files (21 CFR Part 11); DocuWare | None | **Introduce** (DMS-018) |
| 17 | **Retention management** | Cannot prove records are kept for the required period | Laserfiche schedules; Box non-modifiable policies | Fixed 7-year date on archive register only | **Introduce** (DMS-013) |
| 18 | **Legal hold** | Disposal cannot be suspended for litigation/investigation | Box legal hold; OpenText legal holds | **None** | **Introduce** (DMS-013) |
| 19 | **External document submission** | Suppliers/clients must email documents in | DocuWare Forms; Laserfiche Forms | Public share links only (outbound) | **Introduce** (DMS-045) |
| 20 | **Document import & migration** | Onboarding a backlog requires manual upload | Bulk import + metadata mapping in all platforms | `BulkImportModal`, `bulkImportPublished`, `CrmImportModal` | **Extend** (DMS-021) |
| 21 | **Microsoft 365 integration** | Users work in Office/Teams; documents live apart | M-Files M365 integration; SharePoint native | None | **Introduce** (DMS-042) |
| 22 | **API & third-party integration** | ERP/WMS/PMS need document events | All platforms expose APIs | **Already implemented** (API v1, API keys, HMAC webhooks, external references, outbox) — a genuine strength | **Retain** |
| 23 | **AI-assisted retrieval** | Users cannot ask questions of the document base | M-Files Aino; Copilot; OpenText Content Aviator | Generic assistant only | **Introduce** (DMS-041) |
| 24 | **AI-assisted metadata extraction** | Manual indexing is slow and error-prone | Syntex models; Hyland IDP; DocuWare Intelligent Indexing | None | **Introduce** (DMS-040) |
| 25 | **Advanced analytics** | Management lacks trend/throughput data | OpenText/Hyland dashboards | Analytics tab exists (7-day) | **Extend** (DMS-043) |

**Explicit non-recommendation:** do *not* introduce features solely for feature-parity. Every item above is mapped to a real process gap identified in Part 4 or to a documented regulatory requirement (Part 2.2), and each is individually approvable. Items 1, 2, 5, 8, 9, 17, 18 and 25 address gaps that amount to **business risk** rather than polish.

---

# PART 6 — REDESIGN OPPORTUNITIES AND USER JOURNEY

## 6.1 Journeys by role

| User | Enters via | Needs | Assigned tasks | Actions | Tracking | Confusion risk |
|---|---|---|---|---|---|---|
| **Ordinary Employee** | Dashboard / notification panel | Find and read a controlled document | Acknowledgements | View, acknowledge, download (if permitted) | Notification panel, My Documents Status | **Has to guess which module holds the document** — no global search |
| **Document Owner / Creator** | New Document Request → Draft Documents | Raise NDR, upload draft, respond to returns | Fix and resubmit returned drafts | Create, upload, submit, comment | My Documents Status stepper | **Returned documents cannot be resubmitted**; must be re-created |
| **Reviewer** | Review & Approval | See exactly what to review and by when | Review assignments | Approve, return, comment | Assignment list + email reminders | No due dates or "next actor" display; no inbox |
| **Approver (1st / 2nd)** | Review & Approval | Confidence in what changed since previous version | First/second approvals | Approve, return | ApprovalHistory | **No version comparison**; no escalation if they are absent |
| **Document Controller** | Master Record / Published / Superseded & Obsolete | Govern the register, controls, retention | Supersede/obsolete/archive approvals | Publish, archive, purge, share | Master Record tabs, CSV export | Register drift; **no retention/legal-hold control** |
| **Administrator** | Configuration | Configure and secure the platform | Configuration changes | Everything | Audit logs, analytics | **Cannot vary workflows by document type**; configuration defence is weak |

## 6.2 Redesign opportunities (only where a real gain exists)

1. **Introduce a single "My Tasks" surface** reusing the existing `DocumentAssignment`, acknowledgement and expiry-reminder data. The dashboard already computes the counters; the missing piece is the destination list (DMS-014).
2. **Make dashboard counters actionable** — each metric card should link to the filtered list behind it.
3. **Promote the My Documents Status stepper** into a shared component used in Review & Approval and Draft Documents so users see the same lifecycle visual everywhere (DMS-024).
4. **Add a global search box to the Topbar** with scoped, server-side results (DMS-015).
5. **Show "who acts next and by when"** on every document header, derived from `DocumentAssignment.expiresAt` (DMS-011).
6. **Unify the tab component** — the app currently uses three different tab implementations (Configuration bottom-border, Logs & Reports pill, Profile Settings top-border) (DMS-024).
7. **Standardise empty/loading/error states** — `EmptyState`/`SkeletonBlock` exist but are not used on every table (DMS-024).
8. **Remove residual backup components** from `frontend/src/components/` — they inflate the build and confuse contributors (DMS-024).
9. **Retain the current sidebar structure.** Grouping (Dashboard / Workspace / Projects / Document Control / Records / CRM / Reporting / Settings) is logical and matches the mental model of a document controller. It should **not** be reorganised purely for visual novelty.
10. **Onboarding:** `GettingStartedModal` and `GuidedTour` (data-tour-id driven) exist — extend the tour to cover the new task inbox and search once they exist (DMS-024).

---

# PART 7 — TECHNICAL AND ARCHITECTURAL IMPROVEMENTS

## 7.1 Actual defects (verified in code)

| # | Defect | Evidence | Impact |
|---|---|---|---|
| D-1 | **Admin endpoints authenticate but do not authorize** | `routes/users.js:8-29` and `routes/roles.js:8-26` use only `authenticate`; `routes/system.js:152-164` (backup) and `:170-251` (config, incl. security settings) use only `authenticate` | Any authenticated user can administer users, roles, security policy, SMTP and backups |
| D-2 | **Seven separate `PrismaClient` instances** | `services/auditLogService.js:2`, `services/cleanupService.js:2`, `services/versionRequestService.js:2`, `services/supersedeRequestService.js:2`, `controllers/aiController.js:12`, `controllers/usersController.js:8`, `controllers/rolesController.js:6` | Connection-pool multiplication; no cross-module transactions; inconsistent client state |
| D-3 | **Non-transactional multi-write lifecycle operations** | `workflowService.js` publish/acknowledge/supersede/obsolete/archive each perform several writes | Partial state after a crash → documents published without a register row, or superseded without an archive record |
| D-4 | **Hardcoded encryption-key fallback** | `encryptionService.js` falls back to a constant when `ENCRYPTION_KEY` is unset | Silent, catastrophic weakening of document encryption in a misconfigured deployment |
| D-5 | **Hardcoded default user password** | `controllers/usersController.js:9` (`Password123!` fallback) | New users and password resets use a publicly known secret |
| D-6 | **Workflow configuration is orphaned** | `WorkflowStep` is read/written only by `workflowConfigService.js` and `cleanupService.js`; the runtime engine in `workflowService.js` hard-codes the sequence | Administrators can configure workflows that have no effect |
| D-7 | **Register data can diverge from `Document.status`** | Four mirrored register tables plus `scripts/cleanupOrphans.js` | Master Record may show a status the document does not have |
| D-8 | **Mutable, non-evidentiary audit log** | No hash chain, no append-only constraint, no immutability; `POST /api/audit/cleanup` deletes logs | Audit trail cannot be relied on as evidence |
| D-9 | **Returned documents cannot be resubmitted** | `submitForReview` accepts only `DRAFT` | Users must re-create documents after a return |
| D-10 | **Frontend permission mirroring is incomplete** | Routes without a module guard in `App.jsx`; `folderController` write paths unprotected server-side | UI may expose actions the API also fails to protect |

## 7.2 Potential future risks

- **No company/tenant entity.** `Division` and `ProjectCategory` provide scoping, but there is no tenant FK on documents. Any permission defect therefore risks cross-company exposure, and hosting multiple companies in one instance is not safely isolable.
- **In-process schedulers.** Six `setInterval`/`setTimeout` jobs are started in `index.js`. Under PM2 cluster mode or multiple replicas, jobs would run once per process — duplicate reminders and duplicate webhook deliveries. `ecosystem.config.cjs` currently limits this (single fork instance), which makes it a *latent* rather than present defect.
- **Local-disk file storage.** `UPLOAD_DIR` on local disk plus multi-directory fallback resolution in `app.js` indicates historical path drift; this hampers horizontal scaling and backup completeness.
- **Denormalised register growth.** Registers duplicate documents; cost of keeping them consistent grows with volume.
- **No rate limiting or security headers.** Login, password reset and the public v1 API are unthrottled; no CSP/X-Frame-Options/HSTS.
- **Client-side-only search.** As the corpus grows, client filtering becomes unusable.

## 7.3 Optional architecture improvements

- Adopt structured logging (pino/winston) with request correlation IDs; keep `console` as the transport in development only.
- Introduce a durable job queue (BullMQ) for reminders, webhook delivery and retention runs, replacing in-process timers.
- Introduce a search index (MySQL FULLTEXT as a first step; OpenSearch if OCR/semantic search is required).
- Add an object-storage abstraction behind `fileStorageService` so local disk and S3-compatible storage are interchangeable.
- Add optimistic-locking version columns where compare-and-set is currently implemented manually.

## 7.4 Requires substantial restructuring (honest assessment)

- **Retention + legal hold + disposition** requires new entities (`RetentionSchedule`, `LegalHold`, `DispositionRecord`) and new workflow states; it is additive rather than a rewrite, but it is the largest single change proposed.
- **Configurable workflow engine** requires a new execution model (workflow instance + step instance tables) and migration of existing in-flight documents. Recommended only if business units genuinely need divergent flows.
- **Multi-tenant isolation** would require a `Company`/`Tenant` entity and a scoping column with backfill on most tables. **Not recommended now** — it should be a deliberate commercial decision, not a defensive fix.

**A full rewrite is not justified.** The layering, permission middleware, response envelope, integration outbox and design-system primitives are sound and should be carried forward.

---

# PART 8 — PRIORITIZED RECOMMENDATION REPORT

## A. CRITICAL IMPROVEMENTS

### Recommendation ID: DMS-001
**Module / Area:** Security & API Authorization (all modules)
**Current Implementation:** Every route group is mounted in `app.js` (lines 271–293). *Authentication* is applied consistently via `router.use(authenticate)` or per-route `authenticate`. *Authorization* is applied inconsistently: `routes/documents.js` correctly uses `authorizePermission(...)` for NDR, drafts, version requests and bulk import (lines 13–41); `routes/users.js` (lines 8–29) and `routes/roles.js` (lines 8–26) apply **only** `authenticate`; `routes/system.js` applies only `authenticate` to backups (152–164), document types (170–174), departments (183–187), numbering/upload/version-control/RFID/smart-document/retention/expiry/notification/landing/login/branding/theme settings (194–238), and **security settings** (243–251); only maintenance settings use `requireSystemAdmin` (239–240) and only cleanup uses `authorize('admin')` (264–276). `routes/folders.js` protects only `DELETE /:id/purge` (line 16). `routes/documents.js` leaves `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/upload`, `GET /:id/download`, `GET /:id/preview`, `POST /:id/comments`, share-link management (71–73), `POST /bulk-move` (42) and `POST /:id/submit-for-review` (24) without permission middleware. The `authenticate` middleware merges role permissions into `req.user.permissions` (auth.js:84–135) but performs **no** gate of its own.
**Industry Benchmark:** Every platform applies a uniform policy layer — Box classification-driven **access policies** [V], M-Files permissions on class/document/version [V], Laserfiche's Records Management privilege [V], DocuWare **function profiles** [V], ISO 27001 A.5.15 least-privilege access control [V]. The rule is that the *server* is the enforcement point; the UI is a convenience.
**Identified Gap:** Any authenticated user can enumerate and modify users and roles, reset any user's password to the default, read and change the password policy/lockout/2FA configuration and SMTP credentials, and create, download, restore or delete system backups. Division scoping mitigates *document* exposure but not administrative exposure.
**Proposed Improvement:** Apply `authorizePermission(...)` consistently to every sensitive route, mirroring the keys already defined in `frontend/src/utils/permissions.js`: `configuration.users.*`, `configuration.roles.*`, `configuration.settings.*`, `configuration.backup.*`, `configuration.cleanup.*`, `configuration.auditSettings.*`, `configuration.masterData.*`. Gate backup create/restore/delete with `requireSystemAdmin`. Gate security-settings read/write with a new `configuration.settings.security` action. Add document-level checks (`documents.*.create|edit|delete|download`) to the currently open document routes. Add a fallback: deny by default when a route declares no permission key. Add an automated test that enumerates mounted routes and fails when a non-public route lacks an authorization requirement.
**Expected User Journey:** Unchanged for legitimate users. An employee who today could reach `/api/users` now receives HTTP 403; administrators see exactly the same screens as before.
**Business Benefits:** Removes the single highest-severity risk in the system; prerequisite for any security review, ISO 27001 alignment or client due diligence.
**Technical Impact:** `backend/src/routes/users.js`, `roles.js`, `folders.js`, `system.js`, `documents.js`; new permission keys in `frontend/src/utils/permissions.js`; new route-coverage test.
**Priority:** **Critical** · **Implementation Complexity:** Medium
**Dependencies:** DMS-021 (permission mirroring) should be delivered together.
**Risk of Not Implementing:** Privilege escalation by any authenticated account; unauthorised backup exfiltration and restore; unauthenticated policy weakening; failed security audits.

### Recommendation ID: DMS-002
**Module / Area:** File Storage / Cryptography
**Current Implementation:** `services/encryptionService.js` encrypts document versions with AES-256-GCM and derives its key from `ENCRYPTION_KEY`, **falling back to a constant** when the variable is absent.
**Industry Benchmark:** ISO 19475 authenticity/integrity requirements [V]; ISO 27001 A.5.15 [V]; every platform treats key management as non-negotiable.
**Identified Gap:** A misconfigured deployment silently encrypts with a publicly known key while appearing to protect data. Project memory also warns that changing `ENCRYPTION_KEY` breaks decryption (it is used for more than file encryption) — so the failure mode is both silent *and* dangerous to change later.
**Proposed Improvement:** Remove the fallback; refuse to start (or refuse to enable encrypted storage) when `ENCRYPTION_KEY` is missing or shorter than the required length. Log a clear startup error. Document a rotation procedure with re-encryption tooling before any key change, and record the key version alongside each encrypted artefact so future rotation is possible.
**Expected User Journey:** No change for users; operators receive an explicit startup failure instead of silent weakness.
**Business Benefits:** Real protection of confidential documents; removes an audit blocker.
**Technical Impact:** `services/encryptionService.js`, `config/app.js`, `backend/.env.example`, startup validation in `index.js`.
**Priority:** **Critical** · **Implementation Complexity:** Low
**Dependencies:** DMS-033 (backup/key documentation).
**Risk of Not Implementing:** Confidential documents effectively unencrypted in any environment missing the variable.

### Recommendation ID: DMS-003
**Module / Area:** User Administration
**Current Implementation:** `controllers/usersController.js:9` defines a hardcoded default password fallback (`Password123!`) used when creating users and when resetting a password.
**Industry Benchmark:** ISO 27001 A.5.16 identity management and A.5.17 authentication information [V]; ISO 27001 A.5.12/5.13 for credential handling.
**Identified Gap:** A well-known default secret can be issued indefinitely, and there is no forced password change on first login.
**Proposed Improvement:** Remove the hardcoded fallback. Require generation of a cryptographically random temporary credential or, preferably, an invitation flow that has the user set their own password. Enforce a mandatory password change on first login and on administrator-initiated reset.
**Expected User Journey:** New users receive an invitation link rather than a shared default password — a familiar and more secure pattern.
**Business Benefits:** Eliminates a P1 audit finding and a straightforward account-takeover vector.
**Technical Impact:** `controllers/usersController.js`, `services/authService.js` (force-change flag), `frontend/src/components/AddUserModal.jsx`.
**Priority:** **Critical** · **Implementation Complexity:** Low–Medium
**Dependencies:** None.
**Risk of Not Implementing:** Trivial compromise of newly created accounts.

### Recommendation ID: DMS-004
**Module / Area:** Document Lifecycle / Data Integrity
**Current Implementation:** `services/workflowService.js` performs multi-write operations: `publishDocument` (stage transition + version flag + register sync + notification), `markAsSuperseded` (document update + `ApprovalHistory` + `DocumentRegister` + `ArchiveRegister` + notification), `markAsObsolete`, `archiveObsoleteDocument`. None is wrapped in a transaction. The compare-and-set guard (`updateMany` with expected stage) prevents double-processing but not partial writes.
**Industry Benchmark:** Records systems treat publication/disposal as atomic records events with full traceability — OpenText, Laserfiche and Purview all log a single auditable event per transition [V].
**Identified Gap:** A crash, timeout or database error mid-transition can leave a document published with no register row (breaking Master Record and ISO 19475 integrity), or superseded with no archive record (breaking retention).
**Proposed Improvement:** Wrap each lifecycle operation and its audit/register/notification writes in `prisma.$transaction()`, including the stage guard inside the transaction. Make register synchronisation part of the same transaction rather than a separate service call. Add integration tests that inject a failure between writes and assert rollback.
**Expected User Journey:** No visible change; users can rely on the Master Record matching the document.
**Business Benefits:** Guarantees register/document consistency — a precondition for any retention or compliance claim.
**Technical Impact:** `services/workflowService.js`, `services/masterRecordSyncService.js`, `services/supersedeRequestService.js`, `services/versionRequestService.js` (transaction callers must share the same client — see DMS-005).
**Priority:** **Critical** · **Implementation Complexity:** Medium
**Dependencies:** **DMS-005 must be implemented first** (a shared client is required for a single transaction to span services).
**Risk of Not Implementing:** Silent, accumulating divergence between `Document.status` and the register set; incorrect retention decisions; failed audits.

### Recommendation ID: DMS-005
**Module / Area:** Data Access Layer
**Current Implementation:** Seven modules instantiate their own client — `services/auditLogService.js:2`, `services/cleanupService.js:2`, `services/versionRequestService.js:2`, `services/supersedeRequestService.js:2`, `controllers/aiController.js:12`, `controllers/usersController.js:8`, `controllers/rolesController.js:6` — while `config/database.js` exports the intended shared singleton used by the rest of the codebase.
**Industry Benchmark:** Standard ORM practice; all benchmark platforms require transactional integrity across the record and its audit trail.
**Identified Gap:** Multiple connection pools multiply MySQL connections (a capacity risk on modest hosting), prevent cross-module transactions, and mean a transaction started in one service cannot envelop work performed by another.
**Proposed Improvement:** Replace all `new PrismaClient()` occurrences with the shared client from `config/database.js`. Add an ESLint rule (`no-restricted-syntax`) to prevent reintroduction. Consider `prisma.$extends` for transaction-aware helpers.
**Expected User Journey:** No change.
**Business Benefits:** Enables DMS-004; reduces database connections; improves startup and shutdown behaviour.
**Technical Impact:** The seven files listed above; `backend/.eslintrc` configuration.
**Priority:** **Critical** (enabler) · **Implementation Complexity:** Low
**Dependencies:** None. **Blocks DMS-004.**
**Risk of Not Implementing:** Transactional integrity improvements cannot be completed; connection exhaustion under load.

### Recommendation ID: DMS-006
**Module / Area:** Audit & Governance
**Current Implementation:** `services/auditLogService.js` writes `AuditLog` rows with `userId, action, entity, entityId, description, metadata, ipAddress, userAgent` and exposes `logAuth`, `logDocument`, `logUser`, `logWorkflow`, `logSystem`. Per-category toggles and retention days are configurable (`auditSettingsService.js`, `routes/audit.js`). Logs are ordinary rows; `POST /api/audit/cleanup` deletes them. Project memory notes a real prior defect: `logSystem` argument order `(userId, action, entity, req, meta)` must be respected or metadata is lost.
**Industry Benchmark:** OpenText records hundreds of auditable actions with role-based visibility [V]; Purview logs record activities and preserves disposal proof [V]; ISO 15489 requires records systems to maintain reliable, authentic audit trails [V]; ISO 19475 requires integrity of managed documents [V].
**Identified Gap:** The audit trail is not tamper-evident, so it cannot serve as evidence; and there is a real risk of *missing* entries on sensitive actions (any endpoint lacking an explicit `logSystem` call, plus every path where a route has no authorization at all).
**Proposed Improvement:** (a) Make audit writes part of the same transaction as the action they record (depends on DMS-004/005). (b) Add tamper-evidence: a per-row hash chained to the previous row's hash, with a periodic chain-verification job. (c) Mark the audit table append-only at the application layer and restrict the cleanup endpoint to `requireSystemAdmin` with an explicit retention policy. (d) Audit-read access itself must be logged. (e) Commission a coverage test asserting that each mutating route emits at least one audit entry.
**Expected User Journey:** Investigators can trust the trail; no change for ordinary users.
**Business Benefits:** Evidentiary audit trail; supports ISO 15489/16175 positioning and any future legal or regulatory proceeding.
**Technical Impact:** `services/auditLogService.js`, a new migration adding `prevHash`/`rowHash`, `routes/audit.js`, `services/configService.js` (scheduler for chain verification).
**Priority:** **Critical** · **Implementation Complexity:** Medium
**Dependencies:** DMS-004, DMS-005, DMS-001.
**Risk of Not Implementing:** Audit evidence is inadmissible; silent gaps undermine every compliance statement.

### Recommendation ID: DMS-007
**Module / Area:** Platform Security Hardening
**Current Implementation:** No rate limiting middleware on any endpoint (including `/api/auth/login`, `forgot-password`, `verify-2fa` and `/api/v1`). No security headers (no CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy). `JWT_REFRESH_SECRET` falls back to `JWT_SECRET + '_refresh'`. Production error responses truncate messages to 80 characters but still surface Prisma error codes (P2002/P2021/P2022). CORS unconditionally allows any origin containing `localhost`/`127.0.0.1`.
**Industry Benchmark:** ISO 27001 A.8 (technological controls) and A.5.15 [V]; all commercial platforms ship these controls by default.
**Identified Gap:** Credential-stuffing and brute-force are unthrottled (account lockout is per-user only, with no IP component); password-reset codes are 6 digits with 5 attempts and no IP throttle; browser-based attacks are unmigrated.
**Proposed Improvement:** Add `express-rate-limit` (with a distributed store) to authentication, password-reset, public v1 and file-upload routes; add `helmet` with a CSP appropriate to the Vite SPA; require an explicit `JWT_REFRESH_SECRET` (no derived fallback) and document rotation; map Prisma error codes to generic user messages while logging the detail server-side with a correlation ID; make the localhost CORS allowance conditional on a development flag.
**Expected User Journey:** No visible change; attackers are throttled.
**Business Benefits:** Removes a class of automated attack; satisfies baseline security questionnaires.
**Technical Impact:** `backend/src/app.js`, `routes/auth.js`, `config/app.js`, `middleware/errorHandler.js`.
**Priority:** **Critical** · **Implementation Complexity:** Low–Medium
**Dependencies:** None.
**Risk of Not Implementing:** Brute-force account compromise; continued audit findings.

### Recommendation ID: DMS-008
**Module / Area:** Data Architecture / Master Record
**Current Implementation:** `Document.status` is the lifecycle authority, but the same status is duplicated into `DocumentRegister`, `VersionRegister`, `ObsoleteRegister` and `ArchiveRegister`, kept aligned by `masterRecordSyncService.js`. A `scripts/cleanupOrphans.js` script exists to find drift. Project memory documents a real defect where `markAsSuperseded` updated the wrong category's register rows until it was scoped by `fileCode` **and** `projectCategoryId`.
**Industry Benchmark:** Records platforms maintain a single authoritative record with derived views — M-Files' "one authoritative copy with a link" [V]; SharePoint declares records on the item itself rather than in a parallel table [V].
**Identified Gap:** There is no unambiguous single source of truth; the Master Record module can display a state the document does not hold, which is precisely the failure ISO 19475 integrity requirements target.
**Proposed Improvement:** Designate `Document` (+ `DocumentVersion`) as the sole authority and convert the four register tables into either (a) read-only projections maintained inside the lifecycle transaction (DMS-004), or (b) plain database views. Add a scheduled integrity check that reports (not silently fixes) divergence, and surface a Master Record integrity indicator to Document Controllers.
**Expected User Journey:** Master Record always reflects reality; controllers gain an integrity indicator.
**Business Benefits:** Trustworthy register; eliminates a recurring class of bugs.
**Technical Impact:** `services/masterRecordSyncService.js`, `services/reportsService.js`, `pages/MasterRecord.jsx`, migration plan for the register tables.
**Priority:** **Critical** · **Implementation Complexity:** High
**Dependencies:** DMS-004, DMS-005.
**Risk of Not Implementing:** Persistent register drift; incorrect retention and audit statements.

## B. HIGH-PRIORITY IMPROVEMENTS

### Recommendation ID: DMS-010
**Module / Area:** Workflow Engine / Configuration
**Current Implementation:** `Workflow` and `WorkflowStep` models exist and are editable via `workflowConfigService.js` and `WorkflowConfiguration.jsx`, but the runtime engine in `workflowService.js` hard-codes the stage order DRAFT → REVIEW → FIRST_APPROVAL → SECOND_APPROVAL → READY_TO_PUBLISH → PUBLISHED. `WorkflowStep` is referenced only by the configuration service and the cleanup service.
**Industry Benchmark:** DocuWare's Workflow Designer supports versioned processes that only take effect once published [V]; M-Files branches workflows by department (HR onboarding, contract approvals, engineering change orders) [V]; Laserfiche ships Approve-or-Deny with deadline branches and repeat routing [V].
**Identified Gap:** Document types and divisions cannot have different approval routes; the configuration UI creates a false impression of control.
**Proposed Improvement:** Implement a workflow-definition resolver keyed by `documentTypeId` (+ optional `projectCategoryId`/`divisionId`), materialising a `WorkflowInstance` + `WorkflowStepInstance` per document so history and in-flight migration are tracked. Provide three route shapes to start: sequential (current), parallel (all-of / any-of), and conditional (route by document type, category, value threshold or confidential flag). Until this is delivered, **the workflow configuration screen must either be completed or clearly marked as not yet effective** — silently ignored configuration is worse than absent configuration.
**Expected User Journey:** A Quality SOP and a Commercial Contract can follow different, appropriate routes; approvers see the actual route for their document.
**Business Benefits:** Removes a manual compliance compromise; enables per-department governance.
**Technical Impact:** New models + migration; `workflowService.js`, `workflowConfigService.js`, `WorkflowConfiguration.jsx`, `ReviewAndApproval.jsx`, `ApproveDocumentModal.jsx`.
**Priority:** **High** · **Implementation Complexity:** High
**Dependencies:** DMS-004, DMS-005.
**Risk of Not Implementing:** Administrators configure workflows that do nothing; governance requirements cannot be met per document type.

### Recommendation ID: DMS-011
**Module / Area:** Workflow / Notifications
**Current Implementation:** `DocumentAssignment` carries `expiresAt` and `lastReminderSentAt`; `reviewApprovalReminderService` sweeps hourly and sends reminders per digest cadence. There is **no** escalation, no reassignment, no delegation and no SLA visibility.
**Industry Benchmark:** M-Files supports assignment, deadlines, reminders **and escalation** [V]; Laserfiche routes on deadline branches [V]; ISO 9001 §7.5.2 requires review and approval actually to occur [V].
**Identified Gap:** An absent reviewer or approver can stall a controlled document indefinitely; no one is informed.
**Proposed Improvement:** Add (a) due-date-driven escalation to a configured alternate or the assignee's manager after a grace period; (b) delegation where an assignee nominates a substitute for a period; (c) an overdue view listing assignments past `expiresAt` with age buckets; (d) automatic notification to the document owner when a step breaches SLA. Expose "next actor and due date" on the document header.
**Expected User Journey:** An approver on leave delegates; if a step is overdue the escalation chain activates and the owner sees who is holding the document.
**Business Benefits:** Predictable cycle time; fewer stalled controlled documents; measurable approval SLA.
**Technical Impact:** `services/reviewApprovalReminderService.js`, `services/workflowService.js`, `services/documentAssignmentService.js`, new escalation configuration, `ReviewAndApproval.jsx`, notifications.
**Priority:** **High** · **Implementation Complexity:** Medium
**Dependencies:** DMS-010 (preferable), DMS-014.
**Risk of Not Implementing:** Documents stall; unofficial workarounds (email) replace the controlled process.

### Recommendation ID: DMS-012
**Module / Area:** Document Lifecycle
**Current Implementation:** `reviewDocument`/`firstApproval`/`secondApproval` can set a document to `RETURNED`, but `submitForReview` in `workflowService.js` accepts only `DRAFT`.
**Industry Benchmark:** Laserfiche's "Repeat Routing for Approval" sends a document back and forth until approved [V]; M-Files review/approval cycles are explicitly resumable [V].
**Identified Gap:** A return ends the controlled cycle; the owner must create a new document, losing history continuity and polluting the register.
**Proposed Improvement:** Allow `RETURNED → IN_REVIEW` resubmission with a resubmission counter, an optional "what changed" note, and full `ApprovalHistory` continuity. Surface the resubmission count so repeat offenders are visible.
**Expected User Journey:** The owner fixes the file, clicks **Resubmit**, and the document re-enters review at the same step with complete history.
**Business Benefits:** Removes duplicate documents; preserves traceability; shortens cycle time.
**Technical Impact:** `services/workflowService.js`, `controllers/documentController.js`, `routes/documents.js`, `ReviewAndApproval.jsx`, `MyDocumentsStatus.jsx`.
**Priority:** **High** · **Implementation Complexity:** Low
**Dependencies:** None.
**Risk of Not Implementing:** Register pollution and loss of revision history.

### Recommendation ID: DMS-013
**Module / Area:** Records Management
**Current Implementation:** Expiry tracking (`DocumentExpiryProfile` and siblings) governs document *validity* dates. `ArchiveRegister` records a default 7-year retention date. There is **no** retention schedule model, **no** legal hold, **no** disposition approval workflow and no proof-of-disposition record. `retentionService.js` performs scheduled deletion of old drafts and old archived documents and contains an explicit placeholder for soft delete.
**Industry Benchmark:** Laserfiche applies retention schedules to record series, folders or individual records, with cutoff events, interim transfers and final disposition, retaining metadata as proof [V]; Box retention content **cannot be permanently deleted** and non-modifiable policies mirror FINRA-style requirements, with **legal hold** on files, folders or custodians [V]; Purview provides disposition review and proof of deletion and blocks edits/deletes on records [V]; OpenText provides legal holds and under-disposition control with heavy auditing [V].
**Identified Gap:** The system can delete records on a timer but cannot demonstrate *why* a record was kept, *for how long*, or that disposal was authorised — the precise gap between a DMS and an RMS. ISO 15489/16175, ISO 9001 §7.5.3 (retention and disposition), NARA 36 CFR 1234 and Malaysia's Act 629/PDPA retention duties all turn on this.
**Proposed Improvement:** Add `RetentionSchedule` (scope: document type / category / project category; retention period; cutoff trigger event; disposition action), `RetentionAssignment` on documents, `LegalHold` (subject, scope, reason, custodian, start date, release), and a `DispositionRecord` capturing proposed disposals, reviewer, decision, timestamp and evidence. Replace timer-based deletion with a **disposition review queue**: nothing is destroyed without an authorised decision, legal holds always override, and disposal produces a retained metadata record. Retain a permanent disposition log.
**Expected User Journey:** A Document Controller opens **Retention**, sees records due for disposition grouped by schedule, reviews and approves or defers each, and the system destroys content while retaining metadata and the decision record.
**Business Benefits:** Defensible disposition; legal-hold protection; a credible basis for ISO 15489/16175 and, where relevant, Malaysian Act 629/PDPA alignment; removes the risk of destroying records under hold.
**Technical Impact:** New models + migration; `services/retentionService.js`, `services/configService.js`, new routes and services, new `RetentionManagement.jsx` screens, Master Record integration.
**Priority:** **High** · **Implementation Complexity:** High
**Dependencies:** DMS-004, DMS-005, DMS-008, DMS-006.
**Risk of Not Implementing:** Uncontrolled destruction of records (including any that should be held); inability to satisfy retention obligations; no disposition evidence.

### Recommendation ID: DMS-014
**Module / Area:** UX / Task Management
**Current Implementation:** The dashboard computes a "Needs Action" count and "Waiting" count; users are notified through the `RightPanel` notification list (polled every 5 seconds). Work is otherwise discovered by visiting each module.
**Industry Benchmark:** OnBase case management surfaces tasks and approvals in one place [V]; M-Files assigns tasks with deadlines and follow-up [V]; Laserfiche provides an always-visible to-do list and "Direct Approval" from the details pane [V].
**Identified Gap:** No single destination answers "what must I do next?" — the biggest day-to-day usability gap measured against the benchmark.
**Proposed Improvement:** Add a **My Tasks** surface aggregating pending `DocumentAssignment` rows (review, first approval, second approval, acknowledgement), overdue items first, plus expiring documents the user watches and retention/disposition decisions they own. Reuse the existing "My Documents Status" stepper for progress context, support inline approve/return/acknowledge where the API already allows it, and link directly from the dashboard counters. Add keyboard-accessible navigation and a clear overdue visual treatment.
**Expected User Journey:** A reviewer logs in, opens **My Tasks**, sees three items due today and one overdue, opens each in a side panel, approves two, returns one with a comment, and knows nothing was missed.
**Business Benefits:** Reduces cycle time and missed approvals; makes approvals measurable.
**Technical Impact:** New route + page (`MyTasks.jsx`), `services/documentAssignmentService.js` aggregation, `Dashboard.jsx` card links, `Sidebar.jsx`, `ProtectedRoute`.
**Priority:** **High** · **Implementation Complexity:** Medium
**Dependencies:** DMS-011 (overdue semantics), DMS-001 (task APIs must be permission-gated).
**Risk of Not Implementing:** Approvals missed; continued module-hopping.

### Recommendation ID: DMS-015
**Module / Area:** Search & Retrieval
**Current Implementation:** Every list view filters **client-side** over already-loaded rows. There is no global search, no metadata query API, no full-text index and no saved searches.
**Industry Benchmark:** Syntex provides advanced **metadata search** on queryable columns [V]; M-Files searches by metadata across connected systems [V]; full-text + metadata search with facets is table stakes across all seven platforms [V].
**Identified Gap:** A user who does not know which module holds a document cannot find it; as the corpus grows, client-side filtering becomes unusable.
**Proposed Improvement:** Deliver in two stages. **Stage 1:** a server-side document search API (file code, title, description, document type, category, division, status, owner, date ranges, confidential flag) with faceting and pagination, plus a Topbar global search with scoped results and recent searches. **Stage 2:** add a MySQL FULLTEXT index over title/description and extracted document text (depends on DMS-027 OCR for scans). Add saved searches and per-user default filters.
**Expected User Journey:** The user types a phrase or file code into the Topbar, gets faceted results across all modules, and clicks straight into the document.
**Business Benefits:** Retrieval time drops from minutes to seconds; reduces duplicate re-creation.
**Technical Impact:** `services/documentService.js` search, `routes/documents.js`, new `GET /api/search`; `Topbar.jsx`, new `GlobalSearch.jsx`; migration for FULLTEXT indexes.
**Priority:** **High** · **Implementation Complexity:** Medium
**Dependencies:** DMS-001 (search must enforce division scope), DMS-027 for content search of scans.
**Risk of Not Implementing:** Poor retrievability; users work around the system with local copies — the classic DMS adoption failure.

### Recommendation ID: DMS-016
**Module / Area:** Controlled Distribution / Acknowledgement
**Current Implementation:** The lifecycle includes an ACKNOWLEDGMENT stage and `ACKNOWLEDGMENT_REQUIRED` notification type; `AcknowledgeDocumentModal.jsx` supports acknowledging a document. There is no distribution list, no per-recipient due dates, no read-receipt reporting and no withdrawal notice.
**Industry Benchmark:** Controlled distribution and acknowledgement ("read and understood") with reporting is standard in ECM suites; Purview blocks actions on declared records [V]; ISO 9001 §7.5.3 requires control of distribution and access [V].
**Identified Gap:** The organisation cannot demonstrate that affected staff received and understood a controlled document, nor notify holders when one is withdrawn.
**Proposed Improvement:** Introduce an `AcknowledgementSet` for a published document version with recipient resolution (users, roles, divisions, project teams), per-recipient due dates, reminders and escalation via DMS-011, a compliance report (acknowledged / outstanding / overdue), and an automatic **withdrawal notice** to all holders when a document is superseded or obsoleted. Record every acknowledgement in the audit trail.
**Expected User Journey:** On publish, a Document Controller assigns a distribution set; staff see the acknowledgement in My Tasks; the controller monitors an acknowledgement report and chases stragglers with one click.
**Business Benefits:** Demonstrable read-and-understood compliance; faster withdrawal of superseded copies.
**Technical Impact:** New models + migration; `services/documentService.js`, `services/notificationService.js`, `MyDocumentsStatus.jsx`, `PublishedDocuments.jsx`, `MyTasks.jsx`.
**Priority:** **High** · **Implementation Complexity:** Medium
**Dependencies:** DMS-014 (task surface), DMS-011 (escalation).
**Risk of Not Implementing:** Cannot evidence controlled distribution — a common ISO 9001 audit finding.

### Recommendation ID: DMS-017
**Module / Area:** Document Control
**Current Implementation:** Expiry tracking covers validity dates and renewals. There is no separate periodic **review** cadence (i.e. "this SOP must be re-approved every 24 months even though it has no expiry date").
**Industry Benchmark:** ISO 9001 §7.5.2 requires documented information to be reviewed and approved for suitability and adequacy [V]; M-Files reminds on expirations and deadlines [V].
**Identified Gap:** Documents without expiry dates are never reconsidered; ISO 9001 auditors typically sample exactly this.
**Proposed Improvement:** Add `reviewIntervalMonths` and `nextReviewDate` to document types and documents, a "Due for Review" queue, reminders ahead of the review date, and a review action that either renews the review date with a note or initiates a revision request.
**Expected User Journey:** A SOP owner receives a review reminder, opens the document, records "reviewed, no change" (which extends `nextReviewDate` with an audit entry), or raises a revision.
**Business Benefits:** Sustains ISO 9001 §7.5.2 conformance; keeps the controlled set current.
**Technical Impact:** Schema additions; `services/expiryTrackingService.js` (or a sibling review service), `ExpiryTracking.jsx`, new review queue, reminders scheduler.
**Priority:** **High** · **Implementation Complexity:** Medium
**Dependencies:** DMS-014 (queue surface), DMS-011 (reminders/escalation).
**Risk of Not Implementing:** Stale controlled documents; audit non-conformity.

### Recommendation ID: DMS-018
**Module / Area:** Approvals / Signatures
**Current Implementation:** Approval is recorded as an `ApprovalHistory` row attributed to a user. There is no signature.
**Industry Benchmark:** M-Files provides e-signature with per-stage audit trail, positioning for FDA 21 CFR Part 11 [V]; DocuWare supports digital signatures [V]; Box Sign provides e-signature [V].
**Identified Gap:** For regulated processes, an attributed approval without a signature manifestation may be insufficient; approvers cannot produce a signed artefact.
**Proposed Improvement:** Introduce electronic sign-off at first/second approval: capture the authenticated user, timestamp, IP and a hash of the exact approved version, render a signature block on the generated PDF, and store the signature record immutably alongside the version. Keep it **optional per document type** so non-regulated flows are unaffected.
**Expected User Journey:** An approver approves; the published PDF carries a signature block naming the approver, role and timestamp; the signature record is visible in version history.
**Business Benefits:** Supports regulated document control without bolting on a third-party signature product.
**Technical Impact:** New `DocumentSignature` model + migration; `services/workflowService.js`, `services/smartDocumentPdfService.js`, `ApproveDocumentModal.jsx`, `DocumentViewerModal.jsx`.
**Priority:** **High** · **Implementation Complexity:** Medium
**Dependencies:** DMS-004, DMS-006.
**Risk of Not Implementing:** Regulated approvals remain non-evidentiary.

### Recommendation ID: DMS-019
**Module / Area:** Sharing & Confidential Documents
**Current Implementation:** Share links use a SHA-256-hashed token, default 7-day expiry, revocation, access counting and a public preview cache. Confidential access is governed by `DocumentConfidentialAccess` (subject type USER or ROLE, `canView`). There is **no password on share links, no download restriction, no watermarking and no per-recipient access expiry**. `documentController.downloadDocument`/`previewDocument` carry no permission middleware.
**Industry Benchmark:** Box Shield applies **access policies based on classification** and Purview DLP can block actions on sensitive content [V]; M-Files permissions can be set per version and driven by metadata [V].
**Identified Gap:** A leaked link exposes a confidential document unconditionally; confidential documents are not labelled or classifiable; downloads are untraceable at the permission level.
**Proposed Improvement:** (a) Optional password and email binding on share links; (b) a "no download, preview only" mode; (c) dynamic watermarking on preview and PDF export for confidential items; (d) apply `authorizePermission('documents.published','download')` (or the correct key) to download/preview; (e) make confidential access auditable on every read; (f) introduce a **classification** attribute (e.g. Public / Internal / Confidential / Restricted) that drives access policy — the foundation for DMS-044.
**Expected User Journey:** A Document Controller shares a confidential document, sets a password and disables download; the recipient previews it with a visible watermark; every access is logged.
**Business Benefits:** Prevents accidental disclosure; produces an access record; aligns with ISO 27001 A.5.12/A.5.13 and PDPA security obligations.
**Technical Impact:** `services/documentShareLinkService.js`, `services/publicSharePreviewService.js`, `documentController.js`, `ShareDocumentModal.jsx`, `DocumentViewerModal.jsx`, schema additions.
**Priority:** **High** · **Implementation Complexity:** Medium
**Dependencies:** DMS-001.
**Risk of Not Implementing:** Confidential-document leakage by shared link; no access evidence.

### Recommendation ID: DMS-020
**Module / Area:** Data Retention / Recovery
**Current Implementation:** No table has a `deletedAt` column; deletes are hard deletes. `retentionService.js` explicitly notes soft delete is a placeholder. Permanent purge is available to privileged roles (`DELETE /:id/purge`, `DELETE /code/:fileCode/purge`).
**Industry Benchmark:** SharePoint restores deleted items while preserving prior versions [V]; Box retains content in Trash under retention control [V].
**Identified Gap:** An accidental deletion is unrecoverable except by database/backup restore; the register and audit trail can lose their subject.
**Proposed Improvement:** Add soft delete (`deletedAt`, `deletedById`) to document-core entities, a recycle bin with restore, a retention window before purge, and a hard requirement that purge is a privileged, audited action. Sequence this **after or alongside** DMS-013 so soft delete does not become an uncontrolled retention bypass.
**Expected User Journey:** A user deletes a document by mistake; a Document Controller restores it from the recycle bin within the retention window.
**Business Benefits:** Prevents data loss; preserves audit continuity.
**Technical Impact:** Migration for `deletedAt`; `services/documentService.js`, `retentionService.js`, `cleanupService.js`, new recycle-bin UI.
**Priority:** **High** · **Implementation Complexity:** Medium
**Dependencies:** DMS-013 (retention policy must define the window), DMS-008.
**Risk of Not Implementing:** Irrecoverable accidental loss of controlled documents.

## C. MEDIUM-PRIORITY IMPROVEMENTS

*(Condensed format: area → current state → gap → recommendation → priority/complexity/dependencies.)*

### Recommendation ID: DMS-021 — Permission mirroring & route coverage
**Current:** Frontend keys live in `frontend/src/utils/permissions.js`; `ProtectedRoute`/`PermissionGate` gate most routes, but some routes and several server write paths are ungated. **Gap:** Divergence between UI expectations and server enforcement. **Recommendation:** Single source of truth for permission keys (generate the frontend list from a backend declaration), a route-coverage test (see DMS-001), and UI handling for HTTP 403 (clear "you do not have access" state rather than a generic error). **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-001.

### Recommendation ID: DMS-022 — Unify NDR / NVR / register flows
**Current:** `NewDocumentRequest`, `VersionRequest` and the register set are separate flows kept aligned by convention (project memory records two bugs caused by this, in NDR filtering and in `markAsSuperseded` scoping). **Gap:** Duplicate conceptual models for "a request to create or revise a controlled document". **Recommendation:** Model a single `DocumentRequest` with `requestType = NEW | REVISION` and one acknowledgement path; keep the API surface backward-compatible. **Priority:** Medium · **Complexity:** High · **Deps:** DMS-004, DMS-008.

### Recommendation ID: DMS-023 — Indexing & query performance
**Current:** Indexes exist on several `Document` fields, `AuditLog`, `Project`, expiry profiles and calendar events. **Gap:** No composite indexes for the dominant access patterns (`status + createdAt`, `status + projectCategoryId`, `status + divisionId`), no index on `obsoleteDate`/`publishedAt`, and the dashboard issues five sequential aggregations. **Recommendation:** Add composite indexes for the hot paths, add a single dashboard aggregate endpoint with short-lived caching, and add slow-query logging. **Priority:** Medium · **Complexity:** Low · **Deps:** None.

### Recommendation ID: DMS-024 — UI consistency & design-system adoption
**Current:** A real `components/ui/` design system exists but is not universally used; tabs are implemented three different ways; some inputs use hardcoded hex/`blue-500` instead of `--dms-*` tokens; two `*.backup_*.jsx` files remain in the source tree. **Gap:** Inconsistent look and behaviour; contributors copy whichever variant they find. **Recommendation:** Extract a single `Tabs` component and adopt it everywhere; replace hardcoded colours with tokens; delete the backup components; mandate `ui/Table`, `ui/Modal`, `Pagination`, `EmptyState` and `SkeletonBlock` in list and detail screens; add a short frontend contribution guide. **Priority:** Medium · **Complexity:** Medium · **Deps:** None.

### Recommendation ID: DMS-025 — Bulk operations & table feature parity
**Current:** Bulk import and bulk folder move exist; column settings, sorting and pagination exist but behave differently per module (project memory records a sorting-reset constraint and a pagination-slicing bug). **Gap:** Repetitive per-row work; inconsistent interaction. **Recommendation:** Standardise bulk select + bulk actions (move, archive, reclassify, assign, export) via a shared hook based on `useTableFeatures`; unify sort semantics (single active sort column, consistent date sorting) across all tables. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-024.

### Recommendation ID: DMS-026 — Configurable metadata
**Current:** `DocumentMetadata` stores arbitrary key/value pairs and `DocumentType` defines types, but there is no admin designer for custom metadata fields. **Gap:** New metadata requirements need code changes; metadata cannot drive search facets. **Recommendation:** Add a metadata field designer (field name, type, options, required, applies-to document type/category), validate on submit, and expose fields as search facets (DMS-015) and as conditions for workflow routing (DMS-010). **Priority:** Medium · **Complexity:** High · **Deps:** DMS-010, DMS-015.

### Recommendation ID: DMS-027 — OCR for scanned documents
**Current:** No OCR; only DOCX→PDF conversion for preview. **Gap:** Scanned documents are unsearchable — a common DMS failure. **Recommendation:** Add OCR at upload for image/PDF sources, store extracted text alongside the version, and include it in the full-text index; surface OCR status per document. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-015.

### Recommendation ID: DMS-028 — Revision comparison
**Current:** Versions are stored and listed; there is no comparison. **Gap:** Reviewers must read entire documents to find changes. **Recommendation:** Add text-level diff for DOCX/PDF-derived text between two versions, shown side-by-side or inline in the review modal, with the diff summary stored in `ApprovalHistory`. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-027 (for scanned sources).

### Recommendation ID: DMS-029 — Document relationship mapping
**Current:** Only `supersededById` links documents. **Gap:** Related, referenced, parent/child and companion documents are invisible. **Recommendation:** Add a `DocumentRelationship` model (type, source, target) with a relationships panel on the document view, and include relationships in search results. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-008.

### Recommendation ID: DMS-030 — Duplicate detection
**Current:** None. **Gap:** The same document is re-uploaded under a new code; the register inflates. **Recommendation:** Compute a content hash per version on upload, warn on exact-hash or high-similarity matches, and offer "link to existing" or "raise revision request" instead of a new document. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-022.

### Recommendation ID: DMS-031 — Template governance extension
**Current:** `Template` + `TemplateRequest` (NEW/UPDATE, PENDING/RESOLVED/REJECTED, admin/controller approval) and the `SmartTemplate` designer exist. **Gap:** Templates are not version-governed through the same lifecycle as documents, and template usage is not tracked. **Recommendation:** Bring templates under version control with approver records, and record which template version produced each generated document. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-004.

### Recommendation ID: DMS-032 — Durable notification & scheduler architecture
**Current:** Six in-process `setInterval` schedulers started in `index.js`; reminders and webhook dispatch depend on process uptime, and PM2 is deliberately limited to a single fork instance to avoid duplicate execution. **Gap:** Cannot scale horizontally; missed windows on crash; duplicate execution if replicas are ever added. **Recommendation:** Move reminders, retention runs and webhook dispatch to a durable queue (e.g. BullMQ) with idempotency keys, keep the existing outbox pattern (it is already correct), and add a "scheduler last ran" health indicator. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-013 (retention runs).

### Recommendation ID: DMS-033 — Backup automation, off-site copy and DR
**Current:** Manual backup create/list/download/restore/delete with **no authorization** and **no schedule**; backups are local files with no documented encryption. **Gap:** No automated protection, no off-site copy, no tested restore. **Recommendation:** Schedule encrypted backups, replicate off-site, document and regularly test a restore runbook with RPO/RTO targets, and record backup/restore actions in the audit trail — combined with DMS-001 for access control. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-001.

### Recommendation ID: DMS-034 — Observability
**Current:** `console.*` logging, a memory guard (503 when the heap exceeds the threshold) and `/healthz`/`/readyz`. **Gap:** No structured logs, correlation IDs, metrics or error tracking; diagnosing production incidents relies on grepping log files. **Recommendation:** Adopt structured logging with request correlation IDs, expose metrics (request latency, error rate, queue depth, scheduler lag, DB pool usage), integrate an error tracker, and retain the memory guard as a last resort rather than the primary signal. **Priority:** Medium · **Complexity:** Medium · **Deps:** None.

### Recommendation ID: DMS-035 — Accessibility & responsiveness
**Current:** ARIA attributes, `role="dialog"`, `aria-live` and focus handling are partially implemented in shared components; some modules degrade on narrow screens. **Gap:** No systematic WCAG review; keyboard traversal in dense tables and modals is inconsistent. **Recommendation:** Target WCAG 2.1 AA for core journeys (login, task inbox, document view, approvals), audit keyboard focus order and modal focus trapping, verify colour contrast against theme tokens, and add automated accessibility checks to the build. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-024.

### Recommendation ID: DMS-036 — Upload & storage hardening
**Current:** Multer-based uploads with a folder-tree picker and configurable upload settings; local-disk storage under `UPLOAD_DIR` with multiple fallback path candidates in `app.js`, indicating historical drift. **Gap:** Storage location is environment-coupled, complicating backup and horizontal scaling. **Recommendation:** Introduce a storage-abstraction layer (local + S3-compatible) behind `fileStorageService`, keep the existing directory convention, and add virus scanning on upload for an additional control. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-033.

### Recommendation ID: DMS-037 — Configuration management hardening
**Current:** `Configuration` is a key-value store edited through many screens; security settings, SMTP credentials and branding are all editable with authentication only. **Gap:** No validation schema per key, no change history for configuration, no environment separation. **Recommendation:** Validate configuration writes against per-key schemas, record every configuration change in the audit trail with before/after values, add a "test connection" for SMTP (partially present via `test-email`), and gate writes as per DMS-001. **Priority:** Medium · **Complexity:** Low · **Deps:** DMS-001.

### Recommendation ID: DMS-038 — API consistency & documentation
**Current:** A consistent response envelope exists, `/api` publishes an endpoint index, and `src/docs/openapi.v1.json` documents the public v1 API. Internal routes are not documented. **Gap:** No generated contract for internal APIs; inconsistent validation. **Recommendation:** Extend the OpenAPI document to internal routes, add request validation (e.g. Zod) at the boundary, and generate client types for the frontend to eliminate permission- and payload-shape drift. **Priority:** Medium · **Complexity:** Medium · **Deps:** DMS-001.

### Recommendation ID: DMS-039 — Repository hygiene
**Current:** The tree contains a legacy MySQL data dump (`backend/mysql-local-data-BACKUP-20260924-145055/`), many `_*.log`/`_*.out`/`_*.ps1` scratch files, `_FINAL_*.txt`, a committed `.env`, backup JSX components, and a separate React Native project (`RFID SDK APK/`). **Gap:** Review noise, secret-exposure risk from a committed `.env`, and a slow build/scan. **Recommendation:** Move operational scratch files out of the repository, remove the committed `.env` (rotate any exposed secrets), relocate the MySQL dump and the RFID APK to their own repositories or an artefacts store, and extend `.gitignore`. **Priority:** Medium · **Complexity:** Low · **Deps:** None (security items should start immediately).

## D. FUTURE ENHANCEMENTS

### Recommendation ID: DMS-040 — AI-assisted classification & metadata extraction
**Current:** The AI module is wired but generic (stub 501 when unavailable); no document intelligence. **Benchmark:** Syntex trainable classifiers/extractors and LLM autofill columns [V]; Hyland IDP classifies and routes exceptions [V]; DocuWare Intelligent Indexing extracts without templates [V]. **Gap:** Manual indexing effort and inconsistent metadata quality. **Recommendation:** On upload, propose document type, category, title and key metadata, with confidence scores and mandatory human confirmation; always route low-confidence items to a review queue (the Hyland exception pattern) rather than auto-committing. **Priority:** Future · **Complexity:** High · **Deps:** DMS-026, DMS-027, DMS-038.

### Recommendation ID: DMS-041 — AI-assisted search & summarisation
**Current:** None. **Benchmark:** M-Files Aino provides permission-aware summaries and cited Q&A [V]; Copilot summarises files [V]. **Gap:** Users cannot ask a question of the corpus. **Recommendation:** Add semantic (embedding-based) retrieval over indexed text, summarisation of single and grouped documents, and question answering with citations to the source version — **strictly permission-scoped**, using the caller's own access rights. **Priority:** Future · **Complexity:** High · **Deps:** DMS-015, DMS-027.

### Recommendation ID: DMS-042 — Microsoft 365 / SharePoint integration
**Current:** None. **Benchmark:** M-Files integrates with Microsoft 365 while keeping governance in M-Files [V]. **Gap:** Users edit in Word/Teams outside the controlled environment. **Recommendation:** Integrate with Office for co-authoring against a controlled draft, Teams notifications for assignments, and optional Outlook filing of attachments into the DMS — while keeping version control and audit in the DMS. **Priority:** Future · **Complexity:** High · **Deps:** DMS-010, DMS-032.

### Recommendation ID: DMS-043 — Advanced analytics
**Current:** An analytics tab with a 7-day timeline, module usage, status breakdown, top users and trend comparisons. **Gap:** No cycle-time, SLA-breach, rework, storage-growth, retention-volume or acknowledgement-compliance reporting for management. **Recommendation:** Add approval cycle-time distribution, SLA breach rate, rework/resubmission rate, documents due for review/disposition, storage growth by division and acknowledgement compliance. **Priority:** Future · **Complexity:** Medium · **Deps:** DMS-011, DMS-014, DMS-016, DMS-017.

### Recommendation ID: DMS-044 — Classification-driven access (ABAC)
**Current:** Access is RBAC + folder ACL + division scope + per-document confidential list. There is no classification label driving policy. **Benchmark:** Box Shield enforces access policies based on classification [V]; M-Files drives permissions from metadata properties [V]; ISO 27001 A.5.12/A.5.13 require classification and labelling [V]. **Gap:** Policy must be configured per document rather than derived from its sensitivity. **Recommendation:** Introduce a classification attribute (Public / Internal / Confidential / Restricted) with default access policies, require a classification for every published document, and drive download/preview/share behaviour from it. **Priority:** Future · **Complexity:** High · **Deps:** DMS-019, DMS-026.

### Recommendation ID: DMS-045 — External submission portal
**Current:** Public share links are outbound only. **Benchmark:** DocuWare Forms and Laserfiche Forms accept inbound submissions [V]. **Gap:** Suppliers and clients email documents in, outside the controlled process. **Recommendation:** A tokenised public submission page that accepts uploads against a request, validates type/size, runs the same numbering and intake path, and creates an NDR automatically. **Priority:** Future · **Complexity:** Medium · **Deps:** DMS-001, DMS-036.

### Recommendation ID: DMS-046 — Multi-company / tenant isolation
**Current:** `Division` + `ProjectCategory` scope data; there is **no** Company/Organisation entity and **no** tenant FK on documents. Project memory already restricts cross-company movement to Admin/Document Controller. **Gap:** Hosting multiple companies in one instance cannot be safely isolated. **Recommendation:** Treat as a **commercial decision**. If required, introduce a `Company` entity and a company FK across document-core and organisational tables with backfill, enforce it in the same middleware that resolves division scope, and require company selection at session level. **Priority:** Future · **Complexity:** High · **Deps:** DMS-001, DMS-008, DMS-015.

---

# PART 9 — PROPOSED IMPLEMENTATION ROADMAP

Phases are ordered by **dependency and risk**, not by feature grouping.

## Phase 1 — Foundational corrections *(must precede everything else)*
**Contents:** DMS-005 (shared Prisma client), DMS-001 (API authorization), DMS-002 (encryption key), DMS-003 (default password), DMS-007 (rate limiting, headers, secrets), DMS-039 (repository hygiene, rotate the committed `.env`).
**Why first:** These are security- and correctness-critical and are prerequisites for the transactional and records work that follows. DMS-005 specifically blocks DMS-004.
**Independently deliverable:** Yes, each except DMS-001/DMS-021 (deliver together).
**Database restructuring:** No.
**Workflow changes:** No.
**User training:** Minimal (administrators must learn the invitation flow).
**External integrations:** None.

## Phase 2 — Integrity and evidence
**Contents:** DMS-004 (transactional lifecycle), DMS-008 (single source of truth for registers), DMS-006 (tamper-evident, complete audit trail), DMS-012 (resubmission), DMS-023 (indexes and aggregate endpoint), DMS-037 (configuration validation and change history).
**Why here:** Register consistency and an evidentiary audit trail are the preconditions for any retention, disposition or compliance claim. DMS-004 depends on DMS-005; DMS-008 depends on DMS-004.
**Must be delivered together:** DMS-004 + DMS-008 + DMS-006 (they touch the same writes and audit path).
**Database restructuring:** Yes (register projection model, audit hash columns, indexes).
**Workflow changes:** Minor (`RETURNED` acceptance).
**User training:** Low.
**External integrations:** None.

## Phase 3 — Records management and governance
**Contents:** DMS-013 (retention schedules, legal hold, disposition review), DMS-020 (soft delete + recycle bin), DMS-017 (periodic review), DMS-016 (distribution and acknowledgement), DMS-019 (share-link and confidential hardening), DMS-018 (electronic sign-off).
**Why here:** Retention and legal hold require transactional integrity and audit (Phase 2) and a defined disposal window before soft delete can be introduced safely.
**Requires database restructuring:** Yes (four new entity groups).
**Requires changes to existing workflows:** Yes (transitioning from timer-based deletion to disposition review is a business-process change requiring Document Controller sign-off).
**Requires user training:** Yes (Document Controllers and approvers).
**External integrations:** No.

## Phase 4 — User experience and operational efficiency
**Contents:** DMS-014 (My Tasks), DMS-015 Stage 1 (server-side and global search), DMS-011 (delegation, escalation, SLA), DMS-024 (design-system consolidation), DMS-025 (bulk operations and table parity), DMS-021 (permission mirroring), DMS-035 (accessibility), DMS-043 (advanced analytics).
**Why here:** The task inbox and escalation depend on the workflow semantics settled in Phase 2/3; search must enforce the authorization model fixed in Phase 1.
**Requires database restructuring:** Minor (saved searches, delegation records).
**Requires user training:** Yes (new navigation entry points and the My Tasks habit).
**External integrations:** No.

## Phase 5 — Automation, scale and integration
**Contents:** DMS-010 (configurable workflow engine), DMS-026 (custom metadata), DMS-027 (OCR), DMS-028 (revision comparison), DMS-029 (relationships), DMS-030 (duplicate detection), DMS-031 (template governance), DMS-015 Stage 2 (full-text/semantic search), DMS-032 (durable queue), DMS-033 (backup/DR), DMS-034 (observability), DMS-036 (storage abstraction), DMS-038 (API contract and validation), DMS-042 (Microsoft 365).
**Why here:** OCR and full text feed search; the workflow engine is the highest-complexity change and is best attempted on a stable, transactional base. DMS-032 depends on the retention volume introduced in Phase 3.
**Requires database restructuring:** Yes (workflow instance tables, metadata definitions, relationship and hash tables, full-text indexes).
**Requires changes to existing workflows:** Yes, if divergent routes are adopted — requires business sign-off per document type.
**Requires user training:** Yes (workflow configuration, metadata design).
**External integrations:** Yes (Microsoft 365, potentially OpenSearch, S3-compatible storage).

## Phase 6 — Intelligent document management
**Contents:** DMS-040 (AI classification and extraction), DMS-041 (AI retrieval and summarisation), DMS-044 (classification-driven access), DMS-045 (external submission portal), DMS-046 (tenant isolation if commercially required).
**Why last:** AI features are only trustworthy on top of complete metadata (DMS-026), full text (DMS-015/027), classification (DMS-044) and a correct permission model (DMS-001). AI over an inconsistent register would amplify errors.
**Requires database restructuring:** Yes for DMS-044/DMS-046.
**Requires user training:** Yes.
**External integrations:** Yes.

### Dependency summary
- **Blocks:** DMS-005 → DMS-004 → DMS-008 → DMS-006; DMS-001 → DMS-019, DMS-021, DMS-033, DMS-037, DMS-045; DMS-015 → DMS-026, DMS-027 → DMS-028, DMS-040, DMS-041; DMS-013 → DMS-020, DMS-032.
- **Must be implemented together:** DMS-001 + DMS-021; DMS-004 + DMS-005 + DMS-008 + DMS-006.
- **Require database restructuring:** DMS-004, DMS-006, DMS-008, DMS-010, DMS-013, DMS-015 (Stage 2), DMS-016, DMS-017, DMS-018, DMS-019, DMS-020, DMS-025, DMS-026, DMS-029, DMS-040, DMS-044, DMS-046.
- **Require changes to existing workflows:** DMS-010, DMS-011, DMS-013, DMS-016, DMS-017.
- **Require user training:** DMS-003, DMS-010, DMS-013, DMS-014, DMS-016, DMS-017, DMS-026, DMS-040.
- **Require external integrations:** DMS-032 (queue), DMS-036 (object storage), DMS-042 (Microsoft 365), DMS-045 (public intake), optionally DMS-040/041 (AI providers, already configured), DMS-015 Stage 2 (search engine).

---

# PART 10 — FINAL REVIEW AND APPROVAL GATE

## 10.1 Overall assessment of the current DMS

The system is **functionally ambitious and architecturally respectable**. It covers a genuine enterprise document-control scope far beyond a typical in-house build: a controlled lifecycle with concurrency guards, atomic document numbering, versioning, folder ACLs, division scoping, confidential access lists, project tracking with requirement matrices, expiry tracking with four reminder levels, register sets, CRM registers, a calendar, an RFID/EPC registry, a template designer, an audit module with configurable categories, an API-key/webhook integration layer using the transactional-outbox pattern, and optional AI. The response envelope, permission middleware and `components/ui` design system are reusable foundations.

The principal weaknesses are **uneven enforcement** and **missing governance depth**: the same permission discipline applied correctly to the document-request routes is absent from the administrative routes; the transactional care applied to stage transitions is absent from the multi-write operations; and the configuration UI promises workflow flexibility the engine does not provide. None of these are structural — they are completion and hardening tasks.

## 10.2 Existing strengths worth preserving

1. **Layered backend** (routes → controllers → services → Prisma) with a single shared database client as the intended pattern.
2. **Consistent response envelope** via `ResponseFormatter`.
3. **Compare-and-set lifecycle transitions** preventing double-processing races.
4. **Atomic document numbering** through `CodeRegistry` with unique `[projectCategoryId, codeKey, runningNumber]`.
5. **Expiry tracking** — the most complete governance module present (profiles, watchers, four reminder levels, renewal history, exports).
6. **Integration layer** — API keys, HMAC-signed webhooks, transactional outbox, external reference mapping, self-documenting `/api` index and a public OpenAPI v1 document.
7. **Audit settings granularity** — per-category tracking toggles plus alerting configuration.
8. **Design-system primitives** in `frontend/src/components/ui/` and the My Documents Status lifecycle stepper.
9. **Feature-flag discipline** for Smart Documents and RFID, enforced server-side and mirrored client-side.
10. **Key-based reCAPTCHA-free onboarding aids** — `GettingStartedModal` and `GuidedTour`.

## 10.3 Current architectural assessment

Sound layering, correct separation of concerns, and a workable data model (86 models, 33 enums, 61 sequential migrations). The architecture will support the proposed roadmap without a rewrite. The three architectural debts that should be addressed earliest are the fragmented database client (DMS-005), the duplicated register representation (DMS-008) and the in-process scheduler model (DMS-032) — in that order of urgency.

## 10.4 Global industry benchmark comparison
See Part 3 for the full comparison matrix. In summary: the DMS matches the benchmark on **lifecycle, numbering, versioning, expiry tracking, audit breadth, notifications and API integration**; it lags on **records retention/legal hold, workflow configurability, escalation/delegation, global search, OCR, task consolidation, e-signature, classification-driven access and tamper-evident audit**.

## 10.5 Module-by-module review
See Part 4 (all seventeen modules and sub-modules reviewed).

## 10.6 Benchmark references and sources
All URLs are listed inline in Part 2. Principal sources: Microsoft Learn (versioning, Purview records management, file plan, event-driven retention, DLP, Syntex, autofill, Copilot); OpenText (Records Management product overview, Content Manager retention/disposal); M-Files (document control, workflow automation, Aino user guide); DocuWare (features and platform PDFs, Workflow Designer, workflow rights KBA); Laserfiche (Retention Schedule help, DoD certification, Approve-or-Deny and Repeat-Routing templates); Hyland (onbase.com, IDP overview PDF, Banco de Antigua case study); Box (Governance settings, retention policy editing, legal hold policy, Box Shield classification); Standards — ISO 15489-1, ISO 16175-1/2/3, ISO 19475, ISO 30300/30301/30302, ISO 27001 Annex A, ISO 9001 clause 7.5, DoD 5015.02/DoDI 5015.02, MoReq2010, NARA 36 CFR 1234, GARP; Malaysia — National Archives Act 2003 (Act 629), ANM DDMS procedure, MS 2223, PDPA 2010 (Act 709).

**Evidence caveats:** DocuWare retention-schedule mechanics and legal hold, Box AI capabilities, Hyland OnBase retention specifics beyond vendor marketing statements, Laserfiche IDP/OCR specifics, SharePoint approval branching (which derives from Power Automate rather than SharePoint natively), and the GARP 7-vs-8 principle count could **not** be fully verified from official documentation and are flagged accordingly.

## 10.7 Risks and dependencies
- **Implementation risk:** Phase 2 and Phase 3 touch the core lifecycle. They must be delivered behind automated regression tests covering the full lifecycle (NDR → publish → supersede → obsolete → archive) and the register projections.
- **Data migration risk:** DMS-008 (register unification) and DMS-010 (workflow instances) require careful backfill with a verified rollback path.
- **Business-process risk:** DMS-013 replaces timer-based deletion with authorised disposition. This changes Document Controller responsibilities and requires explicit business sign-off and training.
- **Adoption risk:** DMS-014 and DMS-015 are the features most likely to change day-to-day user behaviour; schedule training alongside them.
- **Deployment risk:** Six in-process schedulers assume a single instance (`ecosystem.config.cjs` uses a single fork). Do not enable PM2 cluster mode or multiple replicas before DMS-032.
- **Environment risk:** The repository contains a committed `.env`; any secrets in it should be treated as compromised and rotated (DMS-039).

## 10.8 Recommendation summary

| Recommendation ID | Module | Improvement | Priority | Complexity | Requires Approval |
|---|---|---|---|---|---|
| DMS-001 | Security / All API | Apply authorization middleware to user, role, backup, configuration, folder and document routes | Critical | Medium | Yes |
| DMS-002 | File Storage | Remove hardcoded encryption-key fallback; require `ENCRYPTION_KEY` | Critical | Low | Yes |
| DMS-003 | User Admin | Remove default password; invitation flow and forced first-login change | Critical | Low–Medium | Yes |
| DMS-004 | Lifecycle / Integrity | Wrap multi-write transitions and audit/register writes in transactions | Critical | Medium | Yes |
| DMS-005 | Data Access | Single shared Prisma client; lint rule to prevent recurrence | Critical | Low | Yes |
| DMS-006 | Audit / Governance | Tamper-evident, complete, append-only audit trail | Critical | Medium | Yes |
| DMS-007 | Platform Security | Rate limiting, security headers, explicit refresh secret, error hygiene, CORS tightening | Critical | Low–Medium | Yes |
| DMS-008 | Data Architecture | Single source of truth for lifecycle status; registers as projections | Critical | High | Yes |
| DMS-010 | Workflow Engine | Configurable workflow: per-type routes, parallel and conditional approval | High | High | Yes |
| DMS-011 | Workflow / Notifications | Escalation, delegation, SLA visibility and overdue handling | High | Medium | Yes |
| DMS-012 | Lifecycle | Allow resubmission of RETURNED documents with history continuity | High | Low | Yes |
| DMS-013 | Records Management | Retention schedules, legal hold, disposition review with evidence | High | High | Yes |
| DMS-014 | UX / Tasks | Centralised My Tasks inbox with inline actions | High | Medium | Yes |
| DMS-015 | Search | Server-side faceted search + global Topbar search (Stage 1); full text (Stage 2) | High | Medium | Yes |
| DMS-016 | Distribution | Acknowledgement sets, read-and-understood reporting, withdrawal notices | High | Medium | Yes |
| DMS-017 | Document Control | Periodic review cadence distinct from expiry | High | Medium | Yes |
| DMS-018 | Approvals | Optional electronic sign-off with signature record | High | Medium | Yes |
| DMS-019 | Sharing | Share-link passwords, no-download mode, watermarking, download authorization | High | Medium | Yes |
| DMS-020 | Recovery | Soft delete, recycle bin and restore window | High | Medium | Yes |
| DMS-021 | Permissions | Single source of truth for permission keys; route-coverage test; 403 UX | Medium | Medium | Yes |
| DMS-022 | NDR / NVR | Unify new-document and new-version request flows | Medium | High | Yes |
| DMS-023 | Performance | Composite indexes, single dashboard aggregate, slow-query logging | Medium | Low | Yes |
| DMS-024 | UI | Consolidated tabs, design-token adoption, remove backup components, contribution guide | Medium | Medium | Yes |
| DMS-025 | Tables / Bulk | Standardised bulk actions and consistent sort/pagination semantics | Medium | Medium | Yes |
| DMS-026 | Metadata | Custom metadata field designer feeding search and routing | Medium | High | Yes |
| DMS-027 | Capture | OCR for scanned documents into the search index | Medium | Medium | Yes |
| DMS-028 | Review UX | Revision comparison between versions | Medium | Medium | Yes |
| DMS-029 | Relationships | Document relationship mapping | Medium | Medium | Yes |
| DMS-030 | Duplicate Control | Content-hash duplicate detection with link-or-revise options | Medium | Medium | Yes |
| DMS-031 | Templates | Template version governance and usage tracking | Medium | Medium | Yes |
| DMS-032 | Scheduling | Durable queue for reminders, retention runs and webhook dispatch | Medium | Medium | Yes |
| DMS-033 | Backup / DR | Automated, encrypted, off-site backups and a tested restore runbook | Medium | Medium | Yes |
| DMS-034 | Observability | Structured logging, correlation IDs, metrics, error tracking | Medium | Medium | Yes |
| DMS-035 | Accessibility | WCAG 2.1 AA for core journeys; automated checks | Medium | Medium | Yes |
| DMS-036 | Storage | Storage abstraction (local + object storage), upload virus scanning | Medium | Medium | Yes |
| DMS-037 | Configuration | Per-key validation and audited before/after change history | Medium | Low | Yes |
| DMS-038 | API | Internal OpenAPI contract, request validation, generated client types | Medium | Medium | Yes |
| DMS-039 | Repository | Remove committed `.env` and rotate secrets; relocate dumps, scratch files and the RFID APK | Medium | Low | Yes |
| DMS-040 | AI | AI-assisted classification and metadata extraction with human confirmation | Future | High | Yes |
| DMS-041 | AI | Permission-scoped semantic search, summarisation and cited Q&A | Future | High | Yes |
| DMS-042 | Integration | Microsoft 365 / SharePoint co-authoring and Teams notifications | Future | High | Yes |
| DMS-043 | Analytics | Cycle time, SLA, rework, retention volume and acknowledgement analytics | Future | Medium | Yes |
| DMS-044 | Governance | Classification labels driving access policy (ABAC) | Future | High | Yes |
| DMS-045 | Intake | External submission portal raising NDRs automatically | Future | Medium | Yes |
| DMS-046 | Tenancy | Company/tenant isolation (commercial decision) | Future | High | Yes |

## 10.9 Approval gate

**No implementation has been started.** No source code, database schema or records, API endpoints, business logic, UI components, navigation, permissions, workflows or configuration files have been modified, and no packages have been installed or migrations created. Nothing in this document has been executed.

Please review and respond with any of the following:
1. **Approve** the report as a whole.
2. **Approve by phase** (e.g. "Phase 1 only").
3. **Approve specific recommendation IDs** (e.g. "DMS-005, DMS-001, DMS-007").
4. **Reject or amend** individual recommendations with direction, and I will revise this document.

Only after your explicit approval will an implementation plan — with task breakdown, migration scripts drafted but not applied, test strategy and rollback procedures — be prepared for the approved items.
