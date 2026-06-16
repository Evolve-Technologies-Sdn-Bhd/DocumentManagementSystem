# EPC Registry Module (Optional)

## Purpose

This document defines an optional RFID module for customers who use RFID labels. The module automatically generates a fixed-length EPC value from the DMS file code when a draft file is uploaded, then stores every generated EPC value in a registry for management and export.

This module:

- keeps the existing DMS workflow unchanged,
- runs EPC generation automatically during the normal draft upload flow,
- provides one registry page to view, filter, and export EPC generated records,
- is feature-gated so only RFID customers enable it.

## Current State

The current RFID implementation is a frontend-only encoder utility:

- route: `/rfid-epc-encoder`
- page: `frontend/src/components/RfidLedEpcEncoder.jsx`
- encoder logic: frontend utility only, with no backend persistence

Limitations:

- no backend persistence,
- no reliable link to document and uploaded file,
- no central registry list and export,
- exposed as a standalone tool instead of an optional module.

## Target Outcome

Replace the standalone encoder with:

`EPC Registry`

Capabilities:

1. auto-generate a fixed-length EPC hex from `fileCode` after a draft file upload,
2. store a registry record with `fileCode`, `epcHex`, `fileName`, and document details,
3. filter by date range and file code,
4. export the filtered list.

## Encoding Model

The simplified implementation does not use GS1 or SGTIN-96 field mapping.

Instead:

- the system takes `fileCode`
- generates a deterministic fixed-length 96-bit EPC value
- stores the result as `epcHex`

Handheld devices should scan:

- `epcHex` (the value written to the tag)

## Scope

### In Scope (Phase 1)

- auto EPC generation on draft upload
- EPC registry table (document + uploaded version linkage)
- registry page (list + filters + export)
- audit log entry for EPC auto-generation
- feature toggle + permission gate for RFID customers only

### Out of Scope (Phase 1)

- check-in/check-out movement tracking
- handheld transaction workflows (handheld scans EPC but DMS does not manage movements)
- direct RFID reader SDK integration

## Module Enablement (RFID Customers Only)

Recommended approach:

- a configuration flag (example: `rfid_epc_registry_enabled`) controls whether the module menu and endpoints are available,
- permissions control which users can view/export/manage inside an enabled environment.

## End-to-End Flow

### 1) Document Register (Existing)

No change. The system continues generating `fileCode` using existing numbering rules.

### 2) Draft Upload (Existing, Trigger Point)

Trigger point:

- after `POST /api/documents/:id/upload` succeeds.

### 3) Auto EPC Generation (New, Runs in Backend)

Steps:

1. After upload completes, backend checks `rfid_epc_registry_enabled`.
2. Backend checks if an EPC record already exists for this `documentVersionId`.
3. Backend generates a deterministic fixed-length 96-bit EPC value from `fileCode`.
5. Backend stores a registry record containing:
   - `epcHex`
   - `fileCode`
   - `fileName` (from uploaded file)
   - other document details for display
6. Backend writes an audit log entry (example action: `EPC_GENERATE`).

Output:

- `epcHex` is available for RFID encoding/printing,
- the registry list is the single source of truth for all EPC generated records.

### 4) Registry Management (New)

Registry page shows records and supports:

- filter by date range (`generatedAt`)
- filter by file code (contains/exact)
- export of filtered records

## Mapping Rule (File Code → Fixed-Length EPC)

The implementation uses a deterministic hash-based conversion:

- input: `fileCode`
- encoding source: UTF-8 string
- hash: SHA-256
- output length: first 24 hex characters with a fixed namespace prefix
- final output: `epcHex` (96-bit / 24 hex characters)

Notes:

- `fileCode` remains the human-readable source value
- RFID scanning uses `epcHex`, not `fileCode`
- no GS1 company prefix, filter, or item reference setup is required
- fixed-length output is safer for common EPC memory sizes on RFID tags

## Proposed Data Model

### Model: `DocumentEpcRegistryRecord`

Suggested fields:

- `id`
- `documentId`
- `documentVersionId`
- `fileCode`
- `fileName`
- `documentTitle` (optional denormalized for fast list)
- `documentTypeName` (optional denormalized for fast list)
- `version`
- `epcScheme` (example: `FILECODE-HASH-96`)
- `epcHex`
- `filter` (legacy compatibility field, fixed placeholder)
- `companyPrefixDigits` (legacy compatibility field, fixed placeholder)
- `companyPrefix` (legacy compatibility field, fixed placeholder)
- `itemReference` (legacy compatibility field, stores source `fileCode`)
- `serial` (legacy compatibility field)
- `tagUri`
- `pureIdentityUri`
- `generatedAt`
- `generatedById` (nullable; system-generated on upload)
- `createdAt`

Recommended constraints/indexes:

- unique: `epcHex`
- unique: `documentVersionId` (one EPC per uploaded version)
- index: `generatedAt`
- index: `fileCode`
- index: `documentId`

## Permissions

Suggested permissions:

- `documents.rfidEpcRegistry.view`
- `documents.rfidEpcRegistry.export`
- `documents.rfidEpcRegistry.manage` (optional: regenerate/delete)

## Frontend Module

### Menu

- label: `EPC Registry`
- visibility: only when feature flag enabled + user has view permission

### Registry Page (Single Page)

Table columns (minimum):

- generatedAt
- fileCode
- fileName
- epcHex
- document title
- document type
- version

Filters:

- date range
- file code

Actions:

- export CSV (uses same filters)

## Backend Module

Recommended structure:

- `backend/src/routes/epcRegistry.js`
- `backend/src/controllers/epcRegistryController.js`
- `backend/src/services/epcRegistryService.js`

Suggested endpoints:

- `GET /api/epc-registry`
  - query: `from`, `to`, `fileCode`, `page`, `limit`
- `GET /api/epc-registry/export`
  - query: same filters as list, returns CSV

Hook point:

- after successful draft upload in the existing document upload flow, call EPC generation when feature is enabled.

## Development Plan

### Phase 1: Backend + Auto Generation

- add feature flag config
- add Prisma model + migration for registry
- add service to generate fixed-length EPC hex after upload
- add list + export endpoints
- audit logging integration

### Phase 2: Frontend Registry

- remove/hide old standalone RFID encoder route/menu
- add new menu item for RFID registry (feature + permission gated)
- build registry list page with filters + export

### Phase 3 (Optional): Tag Capacity Validation

- add warning if converted hex exceeds supported tag memory size
- add configurable tag capacity limit if needed

## Acceptance Criteria

- on draft upload, system auto-generates a fixed-length `epcHex` from `fileCode` when module is enabled
- registry record saved with `fileCode`, `fileName`, and required EPC fields
- registry page filters by date and file code correctly
- export returns only the filtered results
- module can be disabled completely for non-RFID customers
