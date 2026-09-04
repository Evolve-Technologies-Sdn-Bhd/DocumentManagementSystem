# Debug Session: demo-logo-flash-missing

## Status: [OPEN]

## Session ID
demo-logo-flash-missing

## Bug Description
Main logo appears briefly on demo version then disappears. Works correctly on other versions. Browser console shows 404 for main-logo file. User reports >3 previous fix attempts still result in same issue.

## Screenshot Evidence
- URL: https://dms.demo.clbgroups.com/config
- Main Logo area shows "File missing. Upload a new one"
- Favicon works correctly
- Network error: GET https://dms.demo.clbgroups.com/uploads/branding/main-logo-1788512866092.png 404 (Not Found)

## Hypotheses (Falsifiable)

### H1: Caching Race Condition
Frontend loads logo from localStorage/cache first (appears briefly), then fetches config from server which returns null/invalid path for mainLogo, overriding the state and hiding the logo.

### H2: Path Normalization Mismatch (Demo vs Other Versions)
Backend returns branding logo path in different format (absolute URL vs relative) between demo and working versions. Frontend resolver logic fails to correctly resolve demo-specific paths, resulting in 404 after initial cached render.

### H3: useEffect/State Update Race in Branding Component
Multiple useEffect hooks in the branding settings component execute in wrong order:
1. First effect sets logo from theme preset (visible briefly)
2. Subsequent effect runs later with incomplete/empty data from API and overwrites logo state to null

### H4: Image OnError Handler Double-Trigger / State Clearing
Initial cached image load succeeds (appears). A re-render causes the image src to reset; onError handler is triggered (or cached failure flag IN_MEMORY_FAILED kicks in) and incorrectly clears the logo preview state, even though a valid logo existed.

### H5: Demo Server Backend resolveBrandingFile Path Mismatch
Demo server has a different upload directory structure. resolveBrandingFile() in backend successfully validates on other servers but fails to locate the physical file on demo server (wrong path checked), returns null, causing frontend to clear logo.

## Instrumentation Plan
1. Instrument backend branding/config endpoints: log every step of resolveBrandingFile() — input path, directories checked, file existence result, final return value
2. Instrument frontend BrandLogoImage component: log src value at mount, onLoad, onError events, cache lookup results (IN_MEMORY_FAILED, localStorage)
3. Instrument frontend GeneralSystemSettings/Theme settings page: log useEffect execution order, logo state transitions (setLogo, setLogoPreview)

## Evidence Logs
(To be filled after instrumentation)

## Fix & Verification
(To be filled after root cause is confirmed)
