// ─── Vybz Hub Storage Helper ──────────────────────────────────────────────────
// Uploads event images from local device URIs to the Supabase 'event-images' bucket.
// Remote https:// URLs are passed through unchanged — no upload needed.
//
// OWNERSHIP SCOPING: every file is stored under {user_id}/{pathPrefix}/... so
// the RLS policies can verify ownership by comparing auth.uid() against the
// first path segment via storage.foldername(name)[1].
//
// ERROR POLICY: both uploadEventImage and uploadEventImages now THROW on failure
// for local files. The previous implementation caught every error silently and
// returned the original file:// URI — callers then saved that broken local path
// to the database, giving the appearance of success while producing a reference
// that is invisible to every other device/user. Callers must now catch and show
// the error to the user rather than proceeding to postEvent/editEvent.

import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Detect MIME type and file extension from a URI.
 * Strips query strings before inspecting the extension.
 */
function getMimeType(uri: string): { mime: string; ext: string } {
  const lower = uri.split('?')[0].toLowerCase();
  if (lower.endsWith('.png'))  return { mime: 'image/png',  ext: 'png'  };
  if (lower.endsWith('.webp')) return { mime: 'image/webp', ext: 'webp' };
  if (lower.endsWith('.gif'))  return { mime: 'image/gif',  ext: 'gif'  };
  return { mime: 'image/jpeg', ext: 'jpg' };
}

/**
 * Upload a single image to Supabase Storage.
 *
 * - Remote http/https URLs → returned as-is (no upload).
 * - Local file:// URIs    → read from device, decoded, and uploaded.
 *
 * THROWS on any failure with a human-readable message describing where the
 * failure occurred (session missing, file not found, decode error, RLS
 * rejection, etc.). Callers must catch and surface the error; they must NOT
 * proceed to save the event if this throws.
 *
 * Storage path: {user_id}/{pathPrefix}/{index}_{timestamp}.{ext}
 * First segment = auth.uid() — required by the RLS ownership policy.
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

  // getSession() reads from local token storage without a network round-trip,
  // so it works reliably mid-form-submission even on slow connections.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error(
      'Image upload failed: your session has expired. Please sign in again and retry.'
    );
  }

  const { mime, ext } = getMimeType(uri);
  // First path segment MUST equal auth.uid() for the RLS insert policy to pass.
  const filename = `${session.user.id}/${pathPrefix}/${index}_${Date.now()}.${ext}`;

  let arrayBuffer: ArrayBuffer;

  if (Platform.OS === 'web') {
    // Web: fetch the blob URL as an ArrayBuffer
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(
        `Image fetch failed (HTTP ${response.status} ${response.statusText}). ` +
        'The file may no longer be accessible.'
      );
    }
    arrayBuffer = await response.arrayBuffer();
  } else {
    // React Native (iOS / Android)
    // expo-file-system is always present in the Expo managed workflow.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require('expo-file-system');

    // Verify the file still exists before reading — the user might have moved
    // or deleted the photo between selecting it and hitting Publish.
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error(
        'Image file not found on this device. It may have been moved or deleted. ' +
        'Please re-select the image and try again.'
      );
    }

    const base64: string = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64 || base64.length === 0) {
      throw new Error('Image file appears to be empty or could not be read from storage.');
    }

    // base64 → ArrayBuffer.
    // atob is available in React Native / Hermes since Expo SDK 47.
    // Wrapped in a separate try so a decode failure is distinguishable from an
    // upload failure in the error message shown to the user.
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

  // Upload to Supabase Storage
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
    //   "JWT expired"                               → token expired
    throw new Error(`Storage upload failed: ${storageError.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('event-images')
    .getPublicUrl(filename);

  return publicUrl;
}

/**
 * Upload multiple event images in parallel.
 * Already-remote URLs pass through unchanged.
 *
 * THROWS if any local image upload fails — the caller must catch, show the
 * error message to the user, and NOT proceed to postEvent/editEvent. Saving
 * an event with a broken file:// reference makes the image invisible to every
 * other device and to the admin panel.
 */
export async function uploadEventImages(
  uris: string[],
  pathPrefix: string
): Promise<string[]> {
  return Promise.all(uris.map((uri, i) => uploadEventImage(uri, pathPrefix, i)));
}
