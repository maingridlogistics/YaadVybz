-- ─── Add banner_url to user_profiles (Custom Creator Banner) ──────────────────
-- Phase 02: Elite Custom Creator Banner
-- Adds banner_url column to user_profiles.
-- The column is nullable; NULL means no custom banner set.
-- Only Elite creators should write this field (enforced application-side with
-- server-authoritative Elite check before the storage upload and DB update).
-- Storage path: profile-images/{user_id}/banner.{ext}
-- Storage bucket policy already restricts uploads to owner-scoped paths.

alter table public.user_profiles
  add column if not exists banner_url text;

comment on column public.user_profiles.banner_url is
  'Elite Custom Creator Banner image URL (profile-images bucket, owner-scoped path). NULL = no banner.';

-- Update the get_public_promoter_profiles function to expose banner_url.
-- This function is SECURITY DEFINER and already exists; drop-and-replace is safe
-- as it only adds banner_url to the returned set — no removal of existing fields.
-- NOTE: The actual function body depends on the existing implementation.
-- Run this manually if the function signature needs updating:
-- SELECT routine_name, routine_definition FROM information_schema.routines
--   WHERE routine_name = 'get_public_promoter_profiles';
-- Then add banner_url to the SELECT list inside the function.
