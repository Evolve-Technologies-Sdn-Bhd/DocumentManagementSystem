# Debug Session: attach-folder-empty
- **Status**: [OPEN]
- **Issue**: Dalam modal "Attach Existing Document", pilih folder tapi list file bawah folder tak keluar.
- **Debug Server**: http://127.0.0.1:<port>/event
- **Log File**: .dbg/trae-debug-log-attach-folder-empty.ndjson

## Reproduction Steps
1. Pergi Project Tracking → buka mana-mana Required Item atau Stage → klik "Attach Existing".
2. Dalam "Browse Folder", pilih satu folder.
3. Expected: senarai dokumen bawah folder muncul di panel kanan.
4. Actual: panel kanan kosong / butang masih "Search All".

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Folder selection tak set `selectedFolderId` (user click expand, bukan select; atau node id kosong) | High | Low | Pending |
| B | Request search masih tak include `folderId` atau params tak betul | Med | Low | Pending |
| C | Search endpoint `/project-tracking/documents/search` filter access terlalu ketat, jadi return 0 walaupun folder ada dokumen (permission mismatch) | High | Med | Pending |
| D | Folder ada dokumen tapi status bukan PUBLISHED/DRAFT yang UI filter expect | Low | Low | Pending |
| E | API error/403/500 berlaku tapi UI swallow error tanpa nampak | Med | Low | Pending |

## Log Evidence
[Key log entries]

## Verification Conclusion
[Pre-fix vs post-fix comparison]
