[OPEN] Tender Book Import - invalid submissionDeadline

## Symptom
- User imports Tender Book CSV
- API responds: "invalid submissionDeadline" even when submissionDeadline appears blank/null

## Hypotheses (falsifiable)
1) Backend deployed is not running the latest code (old validation still active).
2) CSV has at least one row where `submissionDeadline` is not actually empty (e.g. "null", "-", "N/A", Excel date-like text), and backend rejects it.
3) CSV parsing shifts columns for some rows (commas/quotes), so a non-date value is being read into `submissionDeadline`.
4) Different header name is used (e.g. `submissionDeadline ` with hidden chars), causing wrong index mapping and data misread.
5) Reverse proxy / old frontend build is still serving the old importer code.

## Evidence to Collect
- For each imported row (first ~5), capture:
  - raw CSV `submissionDeadline` token (string)
  - parsed `submissionDeadline` result (null vs date)
  - header list
  - row index that triggers error

## Repro Steps (server-side)
1) Start debug server on the same machine as backend:
   - `node .dbg/debug-server-node.js --session tender-import-deadline --outdir .dbg --port 7777 --clean --idle 1200`
2) Ensure backend process has env vars from `.dbg/tender-import-deadline.env`:
   - `DEBUG_SERVER_URL=...`
   - `DEBUG_SESSION_ID=tender-import-deadline`
3) Reproduce import once.
4) Share `.dbg/trae-debug-log-tender-import-deadline.ndjson`

