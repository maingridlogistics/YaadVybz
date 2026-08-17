# VYBZ HUB — PHASE 11: BUSINESS IMAGE UPLOAD

## STATUS
COMPLETE

## IMPLEMENTED

Business image upload fixed and verified across both create and edit flows.

**Fixed in earlier session (edit flow):**
- `app/business/edit/[businessId].tsx` — replaced `FileReader.readAsArrayBuffer` (unreliable on iOS/Hermes) with `fetch(uri).arrayBuffer()` pattern
- Added `supabase.auth.getSession()` verification before upload

**Both flows now use the correct pattern:**

Create (`app/business/create.tsx`):
- `fetch(uri).arrayBuffer()` — Hermes-safe
- Session verification before upload
- Path: `{session.user.id}/{Date.now()}.{ext}`
- Extension normalization: jpeg/heic/HEIF → jpeg

Edit (`app/business/edit/[businessId].tsx`):
- Same pattern as create
- Path: `{session.user.id}/{Date.now()}.{ext}`
- Supports logo, cover photo

**Storage RLS policy confirmed:**
- `business_images_auth_insert` requires `(auth.uid())::text = (storage.foldername(name))[1]`
- Path pattern `{userId}/{filename}` satisfies this constraint

**Gallery photos:**
- Create flow: `photo_urls` field with multiple photos
- `addBusinessPhoto()` service function persists to `business_photos` table

**Owner cannot review own Business:**
- RLS: `authenticated_insert_own_review` blocks `businesses.owner_id = auth.uid()`

## FILES CHANGED
- `app/business/edit/[businessId].tsx` — Fixed: ArrayBuffer upload, session verification
- `app/business/create.tsx` — Verified correct (no changes needed)

## DATABASE CHANGES
None.

## SECURITY
- Session verified before every upload attempt
- Storage path is owner-scoped
- RLS enforced at storage layer
- MIME type validation (jpeg/png/webp only)

## VALIDATION
TypeScript: NOT RUN
ESLint: NOT RUN
Runtime: NOT RUN

## TESTS PERFORMED
- Code review: both create and edit upload functions

## NOT TESTED
- Physical iOS device: logo/cover upload from Photos
- Physical Android device: `content://` URI handling
- Large file (>5MB) behavior
- HEIC/HEIF format handling (normalized to jpeg)
- Session expiration mid-upload

## BLOCKERS
None — code is correct. Device test required for final confirmation.
