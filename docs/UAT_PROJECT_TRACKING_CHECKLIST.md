# UAT Checklist: Project Tracking + Confidential Access

## Prerequisites
- Migration applied:
  - `backend/prisma/migrations/20260617000100_add_confidential_access_entries/migration.sql`
- Minimum roles/users:
  - Admin (full permissions)
  - Project Manager (projectTracking view/create/edit/linkDocument/advanceStage, without global `viewConfidential`)
  - Normal User (projectTracking view only)
- One project category with at least 2 enabled stages and at least 1 confidential required document type.

## 1) Move To Next Stage
### 1.1 Blocked when pending
- Open Project Tracking → open a project → select Phase 1.
- Confirm current stage has at least 1 required item still `Pending`.
- Click `Move To Next Stage`.
- Expected:
  - Alert shows a clear reason including pending required document types.
  - Current stage remains unchanged.
  - Previous stage documents remain visible in their stage sections.

### 1.2 Allowed when complete
- For every required item in current stage:
  - `Create New` and upload a file, then publish via workflow (or attach an existing published document).
- Click `Move To Next Stage`.
- Expected:
  - Success message: moved to next stage.
  - Current stage badge updates in Stage Flow.
  - Previous stage sections still render and show linked documents.

## 2) Add / Rename Phase
### 2.1 Add next phase (custom name)
- Click `Add Next Phase`.
- Set name (e.g. `Pilot Rollout`).
- Expected:
  - New phase created with the given name (not hardcoded iteration label).
  - New phase inherits stage flow + checklist template.

### 2.2 Rename existing phase
- Select a phase → click `Rename Phase`.
- Update name (e.g. `Wave 2`).
- Expected:
  - Phase card + selected phase header display the new name.
  - Stage flow and documents remain attached to the same phase.

## 3) Create / Link / Unlink / Upload
### 3.1 Required checklist item: Create New + upload
- In a required item row → click `Create New`.
- Confirm the document opens upload modal → upload file.
- Expected:
  - Document appears under Completed Documents list (based on publish status rules).
  - Upload updates document’s latest version.

### 3.2 Required checklist item: Attach Existing
- Click `Attach Existing`.
- Search using file code/title → select a document from results.
- Expected:
  - Link appears under Completed Documents list.
  - No manual input for document ID is needed.

### 3.3 Required checklist item: Remove Link
- On a linked document → click `Remove Link` → confirm.
- Expected:
  - Link disappears from the list.
  - If no published document remains for the item, the item becomes `Pending` again.

### 3.4 Stage extra documents: attach/create/remove
- In “Other Documents Under This Stage”:
  - `Attach Existing` (search & select)
  - `Create New` (then upload)
  - `Remove Link`
- Expected:
  - Stage-level links appear under the stage’s “Other Documents” list.
  - Remove link only removes the relationship, not deleting the document.

## 4) Confidential Access by User/Role
### 4.1 Requirement template access (Project Setup)
- Go to Project Tracking → `Project Setup`.
- Add a requirement and tick `Confidential`.
- Click `Access` and add:
  - One role (e.g. `Management`)
  - One user (specific email)
- Expected:
  - Access list saved and persists after refresh.

### 4.2 Document-level access (from Project Tracking)
- Create a confidential document from a confidential requirement.
- On linked row, click `Access` (only allowed while document stage is `DRAFT`).
- Enable confidential and add/remove viewers.
- Expected:
  - Only allowlisted users/roles can view the document (besides owner/creator and global `viewConfidential`).
  - Non-allowlisted user gets access denied when opening document, versions, comments, remarks, or fileCode link.

## 5) Previous Stage Visibility
- After moving to next stage:
  - Ensure Stage Flow shows the new stage as current.
  - Ensure previous stage section remains visible and shows its linked/created documents.
- Expected:
  - No stage “disappears” after advancing.
  - Old stage documents remain accessible (subject to document/folder/confidential rules).

## 6) Audit Trail (Project Activity)
- Open a project → click `Activity`.
- Perform actions:
  - Rename phase
  - Move to next stage
  - Update confidential viewers (document/requirement)
- Expected:
  - Activity list shows entries for project stage/phase actions.
  - Confidential viewer updates appear as audit entries (system-wide log), and project entries appear under project activity.
