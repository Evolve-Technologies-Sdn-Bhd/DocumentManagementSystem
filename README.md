# Document Management System (DMS)

An enterprise document lifecycle platform for controlled documents: drafting, review and
approval, publishing, versioning, superseding, retention and expiry — with integrated
project tracking, CRM registers, a calendar, and RFID/EPC tag registry.

- **Repository:** https://github.com/Evolve-Technologies-Sdn-Bhd/DocumentManagementSystem
- **Architecture:** REST API (Express + Prisma + MySQL) and a single-page app (React + Vite)

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js, Express 4, Prisma 5.22 (MySQL), JWT, bcryptjs, multer, nodemailer, speakeasy (2FA), exceljs, docx / docxtemplater / pizzip, mammoth, qrcode, archiver |
| Frontend | React 18, Vite 5, React Router 6, Tailwind CSS 3, MUI 7 + Emotion, Chart.js, docx-preview, mammoth, jsPDF |
| Database | MySQL 8 (utf8mb4) |
| AI (optional) | OpenAI or Google Gemini (configurable provider) |
| Document rendering | Chromium (puppeteer-core) and/or LibreOffice for DOCX → PDF conversion |
| Process manager | PM2 (`backend/ecosystem.config.cjs`) |
| Container option | Docker Compose (MySQL + backend + nginx frontend + Caddy TLS) |

---

## Repository Layout

```
backend/
  prisma/            schema.prisma (data model), migrations/, seed.js, seeds/
  scripts/           Operational scripts (orphan cleanup, backfills, admin recovery, seeds)
  src/
    app.js           Express app: CORS, security, uploads, route mounting
    index.js         Server bootstrap + background scheduler registration
    config/          App config and Prisma client
    controllers/     HTTP layer
    routes/          Route definitions
    services/        Business logic (documents, workflow, expiry, calendar, AI, ...)
    middleware/      auth / permission checks, uploads, error handling
    utils/           Formatting, logging, JWT, file numbering, error helpers
  ecosystem.config.cjs   PM2 process definition
frontend/
  src/
    components/      Feature screens and reusable UI (ui/, dashboard/, calendar/, layout/, content/)
    pages/           Route-level pages
    contexts/        Preferences and notification providers
    hooks/           API and UI hooks (permissions, calendar, upload settings, AI)
    utils/           Branding, permissions, session, formatting helpers
    api/             Axios instance and API modules
  vite.config.mjs    Dev server, proxy, production build chunking
  nginx.conf         SPA serving config for the container build
docker-compose.yml   MySQL + backend + frontend + Caddy reverse proxy
deploy/              (Not committed — see Deployment)
```

---

## Feature Modules

| Module | Description |
| --- | --- |
| Dashboard | Metrics, attention panel, activity feed, expiry overview, quick actions |
| Documents | Draft → Review & Approval → Published → Superseded/Obsolete lifecycle, versioning, assignments, comments, confidential access lists, share links |
| New Document Request | Request intake and routing into the workflow |
| My Documents | Owner view of document status across stages |
| Project Tracking | Projects, categories, iterations, stage definitions, per-project document requirements, PIC assignment, change requests, project dashboard |
| Expiry Tracking | Expiry profiles, watchers, renewal history, reminder recipients |
| Calendar | Month/week/day/agenda views, custom events, reminders, viewer sharing |
| CRM | Tender Book register and Facebook Enquiry register with assignees and follow-up logs |
| RFID / EPC Registry | EPC tag identity registry and encoder with a tracking status |
| Smart Documents | Template designer, style profiles, dynamic form fields, generated documents and PDF export |
| Master Record | Document/version/obsolete/archive registers |
| Logs & Reports | Audit trail, user activity, generated reports, analytics |
| Configuration | Users, roles and permissions, templates, template requests, document types, master data, general settings, backup/recovery, database cleanup, audit settings |
| Maintenance | System-wide maintenance mode (manual or scheduled) with public status endpoint |
| AI Assistant | Optional in-app assistant (OpenAI or Gemini) |
| Public portal | Branded landing page, public share links, document download links |

Access is controlled per module and action through a role/permission model managed in
Configuration → Roles.

---

## Backend API

Health and discovery endpoints:

```
GET  /healthz, /readyz          Liveness / readiness probe
GET  /                          Service info + memory usage
GET  /api                       Endpoint index
```

Mounted route groups:

```
/api/auth                     Authentication, sessions, 2FA, trusted devices
/api/documents                Document CRUD, versions, assignments, approvals
/api/folders                  Folder tree, folder ACLs
/api/workflow                 Workflow definitions and steps
/api/supersede-requests       Supersede / obsolete requests
/api/notifications            In-app notifications and preferences
/api/reports                  Reports and master record registers
/api/templates                Document templates and template requests
/api/audit                    Audit trail
/api/system                   System health, backup, cleanup, configuration
/api/users                    User administration
/api/roles                    Roles and permissions
/api/divisions                Divisions and scoping
/api/epc-registry             RFID / EPC registry
/api/project-tracking         Projects, iterations, requirements
/api/expiry-tracking          Expiry profiles and reminders
/api/crm                      Tender book and FB enquiry registers
/api/calendar                 Calendar events, reminders, preferences
/api/smart-templates          Smart document templates (gated by feature flag)
/api/smart-document-style     Style profiles (gated by feature flag)
/api/smart-documents          Smart document content and generation (gated by feature flag)
/api/ai                       AI assistant (stub returns 501 when unavailable)
/api/public                   Branding, maintenance status, public links
/api/user                     Current-user profile, preferences, notification settings
/api/files/upload             Bulk document upload
```

Responses use a consistent envelope produced by `backend/src/utils/responseFormatter.js`.

## Background Schedulers

Registered on server start in [index.js](file:///c:/Users/USER/Desktop/DocumentManagementSystem/backend/src/index.js):

- Maintenance expiry scheduler (`configService.initializeMaintenanceScheduler`)
- Retention policy cleanup (`retentionService.scheduleRetentionCleanup`)
- Document expiry reminders (`expiryReminderService.scheduleDailyProcessing`)
- Review/approval reminders (`reviewApprovalReminderService.scheduleProcessing`)
- Calendar event reminders (`calendarReminderService.scheduleProcessing`)

---

## Getting Started

### Prerequisites

- Node.js 20+ (production and containers run Node 20/22)
- MySQL 8
- Optional: Chromium and LibreOffice (DOCX → PDF conversion)

### 1. Backend

```bash
cd backend
npm install                 # runs `prisma generate` via postinstall
cp .env.example .env        # then edit DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
npx prisma migrate deploy   # apply migrations
npm run seed                # first run only: roles, document types, workflows, admin user
npm run dev                 # or: npm run dev:watch
```

The API listens on `PORT` (see [backend/src/config/app.js](file:///c:/Users/USER/Desktop/DocumentManagementSystem/backend/src/config/app.js)).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api` and `/uploads` to the
backend ([vite.config.mjs](file:///c:/Users/USER/Desktop/DocumentManagementSystem/frontend/vite.config.mjs)).
For the proxy to work, set `PORT=4001` in `backend/.env`, because both the Vite proxy and
[.env.development](file:///c:/Users/USER/Desktop/DocumentManagementSystem/frontend/.env.development)
point at `http://localhost:4001`.

On Windows you can start both with `./start-dev.ps1`.

### 3. Default credentials

The seed script creates a system administrator:

```
Email:    admin@company.com
Password: Admin@123
```

Change this password immediately in any non-local environment.

---

## Environment Variables

Core backend variables ([backend/.env.example](file:///c:/Users/USER/Desktop/DocumentManagementSystem/backend/.env.example)):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string |
| `JWT_SECRET` | Token signing secret (use a long random value) |
| `ENCRYPTION_KEY` | Key for encrypted file storage |
| `PORT` | API port (default `4000`; use `4001` for the Vite dev proxy) |
| `UPLOAD_DIR` | Upload root (default `./uploads`) |
| `CORS_ORIGIN` | Allowed origin(s), comma-separated |
| `FRONTEND_URL` | Public frontend URL, used in emails and links |
| `AI_ENABLED`, `AI_PROVIDER`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, ... | Optional AI features |
| `EMAIL_ENABLED`, `SMTP_*` | Optional outbound email |

Frontend variables: `VITE_API_URL` in `.env.development` / `.env.production`.

A root [.env.example](file:///c:/Users/USER/Desktop/DocumentManagementSystem/.env.example) documents the
additional variables used by the Docker Compose deployment (MySQL credentials, TLS mode,
Caddy hostnames, `RUN_SEED`).

---

## Database

Prisma is the single source of truth: [backend/prisma/schema.prisma](file:///c:/Users/USER/Desktop/DocumentManagementSystem/backend/prisma/schema.prisma)
covers users and roles, documents and versions, folders and ACLs, projects, expiry tracking,
CRM registers, smart documents, the calendar, audit logs and system configuration.

```bash
cd backend
npx prisma migrate deploy      # production: apply committed migrations
npx prisma migrate dev         # development: create a new migration
npx prisma generate            # regenerate the client
npm run seed                   # idempotent seeding
```

Migration history lives in `backend/prisma/migrations/`.

---

## Deployment

### PM2 (aaPanel / VPS)

```bash
cd /path/to/DocumentManagementSystem
git pull

cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
cd ..

cd frontend
npm ci
npm run build          # outputs frontend/dist

pm2 restart dms-backend    # or: pm2 start backend/ecosystem.config.cjs
```

`frontend/dist` is served as a static site by the web server (`dist/` is git-ignored, so it
is always built on the target machine). PM2 settings — single fork instance, memory limit,
`wait_ready` and log paths — are defined in
[ecosystem.config.cjs](file:///c:/Users/USER/Desktop/DocumentManagementSystem/backend/ecosystem.config.cjs).

### Docker Compose

[docker-compose.yml](file:///c:/Users/USER/Desktop/DocumentManagementSystem/docker-compose.yml) defines
four services: `mysql` (8.0), `backend`, `frontend` (nginx serving the Vite build) and `caddy`
(TLS-terminating reverse proxy). Environment values come from the root `.env`.

```bash
docker compose build mysql caddy
docker compose build backend
docker compose build frontend
docker compose up -d
```

> **Note:** the Caddy service builds from `./deploy/docker/caddy`, and the root
> `.env.example` references `./deploy/docker/first-run.sh`. The `deploy/` directory is not
> part of this repository, so the Compose stack cannot be built as-is until that folder
> (Caddyfile, Dockerfiles, helper scripts) is added.

---

## Conventions and Notes

- **Auth:** JWT in the `Authorization` header. Permissions are checked per module/action in
  `backend/src/middleware/auth.js`; the frontend mirrors the same module keys in
  [permissions.js](file:///c:/Users/USER/Desktop/DocumentManagementSystem/frontend/src/utils/permissions.js).
- **Response format:** always `{ success, data, message }` via `ResponseFormatter`.
- **File storage:** uploads live under `UPLOAD_DIR` not in the database; branding, landing
  and profile images are served statically with a fallback-directory resolver.
- **Memory guard:** when the Node heap exceeds the production threshold the API answers
  `503 HIGH_MEMORY_LOAD` instead of risking an OOM kill.
- **Feature flags:** Smart Documents routes are gated server-side by configuration and
  client-side by a route guard; the AI module degrades to stubs when unavailable.
- **Repository hygiene:** this repository still contains historical artifacts (backup copies
  of components, build logs, and a legacy `backend/mysql-local-data*/` MySQL data dump). New
  backup patterns, logs and runtime files are ignored via `.gitignore`.
