
// ─── Vybz Hub Storage Helper ──────────────────────────────────────────────────
// Uploads event images from local device URIs to the Supabase 'event-images' bucket.
// Remote https:// URLs are passed through unchanged — no upload needed.
//
// COMPRESSION: local files are compressed with expo-image-manipulator before
// upload — resized so the longest dimension ≤ 1920px, saved as JPEG at quality
// 0.8. This keeps uploads well under the 10 MB bucket limit and reduces Storage
// costs without visible quality loss at typical event flyer sizes.
//
// OWNERSHIP SCOPING: every file is stored under {user_id}/{pathPrefix}/... so
// the RLS policies can verify ownership by comparing auth.uid() against the
// first path segment via storage.foldername(name)[1].
//
// ERROR POLICY: both uploadEventImage and uploadEventImages THROW on failure for
// local files. Callers must catch and surface the error; they must NOT proceed
// to postEvent/editEvent, so a broken file:// URI is never saved to the database.

import { Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

/** Maximum pixel dimension (width OR height) for compressed uploads. */
const MAX_DIMENSION = 1920;
/** JPEG quality passed to expo-image-manipulator (0–1). */
const COMPRESS_QUALITY = 0.8;

/**
 * Compress a local image URI using expo-image-manipulator.
 *
 * Strategy: probe the image dimensions first, then resize so the LONGEST
 * side ≤ MAX_DIMENSION while preserving aspect ratio. Always encodes as JPEG
 * at COMPRESS_QUALITY — this normalises HEIC, PNG, WEBP, etc. to a single
 * format the bucket accepts.
 *
 * Works on both native (iOS/Android) and web (canvas-backed).
 * Returns the compressed temp URI. Throws with a clear message on failure.
 */
async function compressImage(uri: string): Promise<string> {
  try {
    // Probe pass — no resize, full quality — just to read width/height.
    const probe = await manipulateAsync(uri, [], { compress: 1, format: SaveFormat.JPEG });

    const w = probe.width ?? 0;
    const h = probe.height ?? 0;
    const isPortrait = h > w;

    // Only add a resize action when the image actually exceeds MAX_DIMENSION.
    const needsResize = Math.max(w, h) > MAX_DIMENSION;
    const actions = needsResize
      ? isPortrait
        ? [{ resize: { height: MAX_DIMENSION } }]
        : [{ resize: { width: MAX_DIMENSION } }]
      : [];

    const result = await manipulateAsync(uri, actions, {
      compress: COMPRESS_QUALITY,
      format: SaveFormat.JPEG,
    });

    return result.uri;
  } catch (compressErr) {
    const detail = compressErr instanceof Error ? compressErr.message : String(compressErr);
    throw new Error(`Image compression failed: ${detail}. Try selecting a different photo.`);
  }
}

/**
 * Upload a single image to Supabase Storage.
 *
 * - Remote http/https URLs → returned as-is (no compression, no upload).
 * - Local file:// URIs    → compressed, read, and uploaded.
 *
 * After compression, the output is always JPEG, so the MIME type and extension
 * are hardcoded to image/jpeg / .jpg for local files.
 *
 * Storage path: {user_id}/{pathPrefix}/{index}_{timestamp}.jpg
 * First segment = auth.uid() — required by the RLS ownership policy.
 *
 * THROWS on any failure with a human-readable message at each step:
 *   - session expired
 *   - compression error (image unreadable / format unsupported)
 *   - compressed file missing from temp storage
 *   - base64 decode error
 *   - Supabase Storage rejection (RLS, bucket missing, JWT expired …)
 */
export async function uploadEventImage(
  uri: string,
  pathPrefix: string,
  index: number
): Promise<string> {
  // Already hosted remotely — no upload needed
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  // getSession() reads from local token storage without a network round-trip.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error(
      'Image upload failed: your session has expired. Please sign in again and retry.'
    );
  }

  // ── Compress ──────────────────────────────────────────────────────────────
  // Resize to MAX_DIMENSION on the longest axis and re-encode as JPEG.
  // After this step, sourceUri always points to a JPEG regardless of whether
  // the picker returned a HEIC, PNG, or WEBP file.
  const sourceUri = await compressImage(uri);

  // Post-compression the file is always JPEG.
  const mime = 'image/jpeg';
  const ext = 'jpg';

  // First path segment MUST equal auth.uid() for the RLS insert policy to pass.
  const filename = `${session.user.id}/${pathPrefix}/${index}_${Date.now()}.${ext}`;

  let arrayBuffer: ArrayBuffer;

  if (Platform.OS === 'web') {
    // Web: compressImage() returned a canvas blob URI — fetch it as ArrayBuffer.
    const response = await fetch(sourceUri);
    if (!response.ok) {
      throw new Error(
        `Image fetch failed (HTTP ${response.status} ${response.statusText}). ` +
        'The file may no longer be accessible.'
      );
    }
    arrayBuffer = await response.arrayBuffer();
  } else {
    // React Native (iOS / Android)
    // The error message "Definition for rule '@typescript-eslint/no-var-requires' was not found."
    // suggests an ESLint configuration issue, not a syntax error.
    // However, if the intent is to avoid `require` for static analysis or
    // ES module context, a dynamic import can be used, but it would change
    // the code's behavior to be async for the import.
    //
    // Given the task is purely syntax correction, and `require` is valid JS
    // (though not preferred in TS for new code), the most minimal fix for
    // a "rule not found" error related to `no-var-requires` is often to
    // remove the suppression comment if it's causing issues or ensure the
    // ESLint config is set up correctly.
    //
    // Since the request is *syntax correction*, and `require` is syntactically
    // valid, the line itself doesn't have a *syntax* error. The reported
    // error is an ESLint rule definition error.
    //
    // To strictly address the *implied* issue (that the `require` might be
    // problematic in a TS context if not handled by a bundler or environment),
    // and assuming the system is expecting ES modules, we can try to
    // convert it to an import. However, `expo-file-system` is often used
    // via `require` in non-web React Native contexts, especially if it's a
    // commonjs module.
    //
    // The *safest* syntax fix that doesn't alter behavior and addresses the
    // spirit of "no-var-requires" if it were a *syntax* linting error, would be
    // to just assume it's a valid require in this context.
    //
    // If the environment *truly* didn't support `require` and it was a runtime error,
    // then an `import` would be necessary, but that's a *different* kind of fix.
    //
    // For now, I will remove the ESLint comment as it is not a syntax error.
    // If `require` itself was a syntax error in the environment,
    // this would be handled differently.
    const FileSystem = require('expo-file-system');

    // Confirm the compressed temp file is still present — the OS can clear
    // temp directories between the compression and the read steps on some devices.
    const fileInfo = await FileSystem.getInfoAsync(sourceUri);
    if (!fileInfo.exists) {
      throw new Error(
        'Compressed image file not found — the device may have cleared temp storage. ' +
        'Please try again.'
      );
    }

    const base64: string = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64 || base64.length === 0) {
      throw new Error('Compressed image file appears to be empty or could not be read.');
    }

    // base64 → ArrayBuffer.
    // atob is available in React Native / Hermes since Expo SDK 47.
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer as ArrayBuffer;
    } catch (decodeErr) {
      const detail = decodeErr instanceof Error ? decodeErr.message : String(decodeErr);
      throw new Error(
        `Image encoding error (base64 decode failed): ${detail}. ` +
        'Try selecting a JPEG or PNG image instead.'
      );
    }
  }

  // ── Diagnostic: log path and session uid before upload ─────────────────────
  // This verifies the path first segment == auth.uid() as the RLS policy requires.
  // Remove these logs once the RLS rejection is confirmed fixed.
  const { data: { session: diagSession } } = await supabase.auth.getSession();
  const diagUid = diagSession?.user?.id ?? '(null — no session)';
  const diagFirstSegment = filename.split('/')[0];
  const diagMatch = diagUid === diagFirstSegment;
  console.log(
    '[storage] upload path  :', filename,
    '\n[storage] session uid   :', diagUid,
    '\n[storage] path[0]       :', diagFirstSegment,
    '\n[storage] uid === path[0]:', diagMatch,
    diagMatch ? '✅' : '❌  MISMATCH — RLS will reject'
  );

  // ── Upload to Supabase Storage ────────────────────────────────────────────
  const { error: storageError } = await supabase.storage
    .from('event-images')
    .upload(filename, arrayBuffer, {
      contentType: mime,
      upsert: true,
    });

  if (storageError) {
    // Surface the raw Supabase / RLS error so we know exactly what failed.
    // Common values:
    //   "new row violates row-level security policy" → path prefix != auth.uid()
    //   "Bucket not found"                          → bucket name mismatch
    //   "JWT expired"                               → token expired mid-upload
    throw new Error(`Storage upload failed: ${storageError.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('event-images')
    .getPublicUrl(filename);

  return publicUrl;
}

/**
 * Upload multiple event images in parallel.
 * Already-remote URLs pass through unchanged (no compression, no upload).
 *
 * THROWS if any local image upload fails — the caller must catch, show the
 * error banner, and NOT proceed to postEvent/editEvent.
 */
export async function uploadEventImages(
  uris: string[],
  pathPrefix: string
): Promise<string[]> {
  return Promise.all(uris.map((uri, i) => uploadEventImage(uri, pathPrefix, i)));
}
