// ─── Vybz Hub Storage Helper ──────────────────────────────────────────────────
// Uploads event images from local device URIs to the Supabase 'event-images' bucket.
// Remote https:// URLs are passed through unchanged — no upload needed.
//
// OWNERSHIP SCOPING: every file is stored under {user_id}/{pathPrefix}/... so
// the RLS policies can verify ownership by comparing auth.uid() against the
// first path segment via storage.foldername(name)[1]. This prevents user A
// from deleting files uploaded by user B.

import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Upload a single image to Supabase Storage.
 * - Remote http/https URLs → returned as-is.
 * - Local file:// URIs   → uploaded via base64 (mobile) or fetch+blob (web).
 * Falls back to the original URI if upload fails, so the app never crashes.
 *
 * Storage path: {user_id}/{pathPrefix}/{index}_{timestamp}.jpg
 * The first segment (user_id) is what the RLS ownership policies check.
 */
export async function uploadEventImage(
  uri: string,
  pathPrefix: string,
  index: number
): Promise<string> {
  // Already hosted remotely — skip upload
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  // Require an authenticated user — ownership is embedded in the storage path
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[storage] No authenticated user — skipping upload, using local URI');
    return uri;
  }

  // {user_id}/{pathPrefix}/{index}_{timestamp}.jpg
  // First segment matches auth.uid() so the delete policy can verify ownership.
  const filename = `${user.id}/${pathPrefix}/${index}_${Date.now()}.jpg`;

  try {
    let arrayBuffer: ArrayBuffer;

    if (Platform.OS === 'web') {
      // Web: fetch the blob URL as an ArrayBuffer
      const response = await fetch(uri);
      arrayBuffer = await response.arrayBuffer();
    } else {
      // React Native (iOS / Android): read as base64, then decode to ArrayBuffer
      // expo-file-system is always available in Expo projects
      const FileSystem = require('expo-file-system');
      const base64: string = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Decode base64 → Uint8Array → ArrayBuffer
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer as ArrayBuffer;
    }

    const { error } = await supabase.storage
      .from('event-images')
      .upload(filename, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.warn('[storage] Upload failed, using original URI:', error.message);
      return uri;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('event-images')
      .getPublicUrl(filename);

    return publicUrl;
  } catch (e) {
    console.warn('[storage] Unexpected error, using original URI:', e);
    return uri;
  }
}

/**
 * Upload multiple event images in parallel.
 * Already-remote URLs pass through unchanged.
 * Returns an array of resolved public URLs in the same order as the input.
 */
export async function uploadEventImages(
  uris: string[],
  pathPrefix: string
): Promise<string[]> {
  return Promise.all(uris.map((uri, i) => uploadEventImage(uri, pathPrefix, i)));
}
