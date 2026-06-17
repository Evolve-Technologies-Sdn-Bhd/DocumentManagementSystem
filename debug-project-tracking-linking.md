# Debug Session: project-tracking-linking
- **Status**: [OPEN]
- **Issue**: Project Tracking search returns 500, create-new flow opens the wrong upload path, and published documents do not reflect back into the tracked field after review workflow.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-project-tracking-linking.ndjson

## Reproduction Steps
1. Open `Project Tracking` for a project phase.
2. Try `Attach Existing` in a stage and search by file code/title.
3. Try `Create New` from a stage or required row, then follow draft/review/publish flow.
4. Verify whether the document stays linked under the expected stage/item after publish.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | `/project-tracking/documents/search` crashes for some document rows because the new global search code reads fields that are absent on certain result shapes. | High | Low | Pending |
| B | `Create New` currently returns a draft document record but Project Tracking assumes upload happens inline, while the real approved flow requires continuing in the Draft module. | High | Low | Pending |
| C | The tracked field loses its relationship after review/publish because publish status changes are not mirrored back into project tracking item/stage summaries. | High | Medium | Pending |
| D | The stage UI is still using an accordion model, so users can view multiple stage blocks in one scroll and it feels mixed instead of tab-scoped. | Medium | Low | Pending |
| E | There may be a missing backend transition or refresh hook after publish that should recalculate linked item completion for the originating stage/item. | Medium | Medium | Pending |

## Log Evidence
- Instrumentation added to:
  - `frontend/src/components/ProjectTracking.jsx`
  - `backend/src/services/projectTrackingService.js`
  - `backend/src/services/workflowService.js`
- Local collector started via `.dbg/project-tracking-linking-server.cjs`
- Waiting for user reproduction to capture `pre-fix` logs.

## Verification Conclusion
- Pending pre-fix evidence.
