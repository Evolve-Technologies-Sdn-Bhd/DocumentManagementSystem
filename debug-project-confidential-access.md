# Debug Session: project-confidential-access
- **Status**: [OPEN]
- **Issue**: Confidential document in Project Tracking is still viewable/downloadable by Hanish even when System Admin uploaded it and no viewers were assigned.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-project-confidential-access.ndjson

## Reproduction Steps
1. Login as System Admin.
2. Upload a confidential file in Project Tracking.
3. Do not assign any extra viewers.
4. Login as Hanish.
5. Open the same project/stage and try to view or download the file.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Project Tracking list API returns `canAccess: true` for Hanish even when there is no valid confidential access entry. | High | Medium | Pending |
| B | The document has hidden `DocumentConfidentialAccess` entries for Hanish or one of Hanish's roles. | High | Medium | Pending |
| C | The document `ownerId` or `createdById` is not actually System Admin, so Hanish qualifies as owner/creator. | Medium | Medium | Pending |
| D | Role resolution for Hanish expands to a role that matches confidential access unexpectedly. | Medium | Medium | Pending |
| E | Hanish is using a Project Tracking path that bypasses the same access decision used by general document endpoints. | Medium | Medium | Pending |

## Log Evidence
Instrumentation active in `backend/src/services/projectTrackingService.js`.

- Local DB check on 2026-07-14:
  - Users present: `admin@company.com`, `test@email.com`, `doccontroller@company.com`
  - No `Hanish` user found
  - No `Project` records found in Project Tracking
  - No matching UAT document/file code from screenshot found in local DB
  - No Project Tracking instrumentation events emitted yet because local DB cannot reproduce the reported scenario

## Verification Conclusion
- Local reproduction fixture created successfully:
  - uploader: `admin@company.com`
  - viewer substitute: `hanish.local@company.com`
  - project: `LCR-1783994263421`
  - confidential document: `LCR/263421`
- Result in local environment:
  - Project Tracking item API returned `canAccess: false` for the viewer substitute
  - `GET /api/documents/:id` returned `403`
  - `GET /api/documents/:id/download` returned `403`
  - Debug logs confirm denial happened because viewer was neither owner nor creator and had no matching confidential access entry
- Conclusion:
  - The reported bug is **not reproducible in the current local codebase and local DB fixture**
  - The original issue is likely environment-specific, data-specific, or coming from a different deployment/build than the current local backend
