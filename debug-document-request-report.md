# Debug Session: document-request-report

Status: OPEN

## Symptom
- Document Request Report still shows only version request data.
- Expected behavior: report should include NDR, NVR, supersede, and obsolete requests.

## Hypotheses
1. The browser is receiving an old API payload from a backend process that was not restarted.
2. The UI is hitting a different report endpoint or runtime path than the patched service.
3. NDR rows are filtered out by date/status criteria and never make it into the merged dataset.
4. The frontend is showing stale cached report data.
5. The local environment is using multiple runtimes that are out of sync with the edited code.

## Plan
- Instrument the report fetch path first.
- Reproduce and collect runtime evidence.
- Confirm or reject each hypothesis using logs.
- Apply the minimal fix only after evidence points to the root cause.
