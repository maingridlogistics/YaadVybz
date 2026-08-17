# VYBZ HUB — PHASE 12: BUSINESS MAP NATIVE CRASH

## STATUS
PARTIAL — NEEDS DEVICE TEST

## ROOT CAUSE (IDENTIFIED)

The crash is caused by rapid `tracksViewChanges` toggling across all 14 MapKit annotation views simultaneously when async business data loads after component mount.

**Why Events mode works and Businesses mode crashes:**
- Events data is pre-loaded by `useEvents()` context before the Map tab opens → `parishCounts` is stable at JamaicaMap mount time → `tracksViewChanges` effect fires once → no subsequent trigger
- Business data starts as all-zeros → async load completes → `parishCounts` reference changes → `tracksViewChanges` effect fires AGAIN → rapid `true→false→true→false` cycle across 14 MapKit annotations → SIGABRT

**Secondary contributing factor (earlier session):**
- `customMapStyle` was being passed to Apple Maps (iOS) — Apple Maps does not support custom styles; this causes SIGABRT. Fixed in earlier session by making `customMapStyle` Android-only.

## IMPLEMENTED

Three targeted fixes applied across two sessions:

**Fix 1 (earlier session):** `customMapStyle` is now only applied on Android where `PROVIDER_GOOGLE` is active. iOS receives `customMapStyle={undefined}`.

**Fix 2 (earlier session):** Added `key={mode}` to `<JamaicaMap>` in `map.tsx` so the component fully remounts when mode switches (events → businesses). This eliminates stale annotation references from the previous mode.

**Fix 3 (this session):** Removed `tracksViewChanges` state management entirely from `JamaicaMap.native.tsx`. All 14 markers now permanently use `tracksViewChanges={true}`. At 14 markers this has negligible performance impact and eliminates the rapid-toggling crash.

**Fix 4 (this session):** Added namespaced `identifier` props (`parish-${parish}`) to prevent MapKit annotation recycling ambiguity on remount.

**Fix 5 (all sessions):** Full coordinate validation before every `<Marker>` render — guards against `NaN`, `Infinity`, `null`, `undefined`, and out-of-range values.

## FILES CHANGED
- `components/feature/JamaicaMap.native.tsx` — multiple targeted fixes
- `app/(tabs)/map.tsx` — `key={mode}` on JamaicaMap

## DATABASE CHANGES
None.

## SECURITY
- Parish markers are aggregate-level only — no individual Business GPS coordinates exposed
- Private home-based / mobile / hybrid-private businesses are parish-count aggregated only
- `serves_parish` flag used to distinguish service-area coverage from physical location

## VALIDATION
TypeScript: NOT RUN
ESLint: NOT RUN
Expo Doctor: NOT RUN
Runtime: NOT RUN — NEEDS PHYSICAL IPHONE TEST

## ISOLATION RESULTS
These are analysis-based, not physical-device-verified:

| Stage | Expected Result | Confidence |
|-------|----------------|------------|
| Map only (no markers) | PASS | HIGH |
| 1 plain marker | PASS | HIGH |
| 14 plain parish markers | PASS | HIGH |
| Business counts (async update) | FAIL before fix, PASS after | HIGH |
| Custom markers | PASS after tracksViewChanges fix | HIGH |
| Callouts / press | PASS (no callout component used) | HIGH |

## TESTS PERFORMED
- Code review: traced Events vs Businesses data lifecycle differences
- Verified `tracksViewChanges` removal is complete and no state variable remains
- Verified coordinate validation covers all 14 Jamaica parish entries in `PARISH_COORDS`
- Verified `key={mode}` causes component remount on mode switch

## NOT TESTED
- Physical iPhone: Events → Businesses switch (10+ repetitions required)
- Physical iPhone: Businesses with 0 results
- Physical iPhone: Businesses with loading/error state
- Physical iPhone: Repeated mode switching (30+ cycles)
- Physical Android: Google Maps parallel paths

## BLOCKERS
Physical iPhone required to confirm SIGABRT is resolved. Cannot claim FIXED without device test.

## REQUIRED DEVICE TEST SEQUENCE
1. Launch on physical iPhone
2. Open Map tab → Events mode
3. Wait 10 seconds (confirm Events mode renders)
4. Switch to Businesses
5. Wait 60 seconds (confirm no crash)
6. Pan and zoom the map
7. Tap several parish markers
8. Switch Businesses → Events
9. Switch Events → Businesses
10. Repeat switching 10 times
11. Leave Map tab, return, repeat switching 10 more times
12. Test with 0 business results (use Verified filter if no verified businesses exist)
13. Test with network offline → switch to Businesses mode

If app does NOT crash at step 5: **BUSINESS MAP CRASH: FIXED**
If app crashes at step 5: **BUSINESS MAP CRASH: BLOCKED — capture crash report**

## FOLLOW-UP
If still crashing after device test: capture Exception Type, Subtype, Termination Reason, Last Exception Backtrace from iOS device logs and report for further diagnosis.
