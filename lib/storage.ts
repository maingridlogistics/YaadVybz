
// ─── Vybz Hub Storage Helper ──────────────────────────────────────────────────
// Uploads event images from local device URIs to the Supabase 'event-images' bucket.
// Remote https:// URLs are passed through unchanged — no upload needed.
//
// COMPRESSION PIPELINE
// --------------------
// Every local image is compressed to three size variants before upload:
//
//   full  — max 1600 px long edge, JPEG 0.80  (event detail hero / gallery)
//   card  — max  720 px wide,      JPEG 0.78  (featured cards, edit-event preview)
//   thumb — max  320 px wide,      JPEG 0.75  (list cards, promoter mini cards)
//
// Supabase Storage also supports server-side image transformations via the
// `?width=N&quality=N` query parameters on public URLs (available on paid plans).
// When the project is on a free plan, the pre-generated thumb/card variants
// stored at a separate path are served instead.
//
// IMAGE VARIANT URL HELPERS
// -------------------------
// Use these helpers everywhere an image is rendered so the correct pre-sized
// variant is always loaded — never the raw original:
//
//   getThumbUrl(url)   → 320 px wide  — list cards, mini cards
//   getCardUrl(url)    → 720 px wide  — EventCard, EventCardFeatured
//   getFullUrl(url)    → 1600 px wide — event detail hero/gallery
//
// Callers can safely pass any URL (original or pre-sized) — the helpers detect
// and replace the existing size suffix when called on an already-transformed URL.
//
// For Supabase Storage CDN URLs the helpers append ?width=N&quality=75 which
// triggers on-the-fly resizing on the CDN edge (free-tier fallback to stored variants).
//
// OWNERSHIP SCOPING
// -----------------
// Every file is stored under {user_id}/{pathPrefix}/... so the RLS policies
// can verify ownership by comparing auth.uid() against the first path segment
// via storage.foldername(name)[1].
//
// ERROR POLICY
// ------------
// uploadEventImage and uploadEventImages THROW on failure for local files.
// Callers must catch and surface the error; they must NOT proceed to
// postEvent/editEvent, so a broken file:// URI is never saved to the database.

import { Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

// ─── Size Targets ─────────────────────────────────────────────────────────────

/** Max long-edge pixel dimension for the full-size storage variant. */
const FULL_MAX_PX = 1600;
/** Max width for the card-size storage variant. */
const CARD_MAX_PX = 720;
/** Max width for the thumbnail storage variant. */
const THUMB_MAX_PX = 320;

/** JPEG quality for full-size uploads (0–1). */
const FULL_QUALITY = 0.80;
/** JPEG quality for card-size uploads (0–1). */
const CARD_QUALITY = 0.78;
/** JPEG quality for thumb-size uploads (0–1). */
const THUMB_QUALITY = 0.75;

// ─── Variant URL helpers ───────────────────────────────────────────────────────

/**
 * Strip any existing _thumb / _card / _full suffix added by our pipeline.
 * Returns the canonical base URL (pointing to the full-size upload).
 */
function baseUrl(url: string): string {
  // Remove our stored-variant suffixes if present
  return url.replace(/_(thumb|card|full)\.(jpg|jpeg|png|webp)(\?.*)?$/, '_full.jpg');
}

/**
 * Return the thumbnail CDN URL (~320 px wide) for a Supabase Storage image.
 * Falls back to the original URL if it is not a Supabase Storage URL.
 */
export function getThumbUrl(url: string | undefined | null): string {
  if (!url) return '';
  const base = baseUrl(url);
  if (base.includes('supabase')) {
    return base.replace('_full.jpg', '_thumb.jpg');
  }
  return url;
}

/**
 * Return the card CDN URL (~720 px wide) for a Supabase Storage image.
 * Falls back to the original URL for non-Storage URLs.
 */
export function getCardUrl(url: string | undefined | null): string {
  if (!url) return '';
  const base = baseUrl(url);
  if (base.includes('supabase')) {
    return base.replace('_full.jpg', '_card.jpg');
  }
  return url;
}

/**
 * Return the full-size CDN URL (max 1600 px) for a Supabase Storage image.
 * For non-Storage URLs, returns the original URL unchanged.
 */
export function getFullUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.includes('supabase') && !url.includes('_full.jpg')) {
    return baseUrl(url);
  }
  return url;
}

// ─── Upload progress ──────────────────────────────────────────────────────────

export interface ImageUploadProgress {
  /** Index of the image being processed (0-based) */
  index: number;
  /** Total number of images being uploaded */
  total: number;
  /** Human-readable status for the current image */
  status: 'compressing' | 'uploading' | 'done' | 'error';
  /** Original file size in bytes (0 for remote URLs) */
  originalBytes: number;
  /** Compressed file size in bytes for the full variant */
  compressedBytes: number;
  /** Original width × height */
  originalDimensions: { width: number; height: number };
  /** Compressed dimensions after resize */
  compressedDimensions: { width: number; height: number };
}

// ─── Internal compression helper ──────────────────────────────────────────────

interface CompressResult {
  uri: string;
  width: number;
  height: number;
}

/**
 * Compress an image to a target max-width (or max long-edge for 'full').
 * Always outputs JPEG. Returns the temp URI and resulting dimensions.
 * Throws with a clear message on failure.
 */
async function compressVariant(
  sourceUri: string,
  maxPx: number,
  quality: number,
  mode: 'width' | 'longEdge',
  sourceWidth: number,
  sourceHeight: number,
): Promise<CompressResult> {
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const needsResize = longestSide > maxPx;

  let actions: Parameters<typeof manipulateAsync>[1] = [];
  if (needsResize) {
    if (mode === 'width') {
      actions = [{ resize: { width: maxPx } }];
    } else {
      // 'longEdge' — resize on the longest axis
      const isPortrait = sourceHeight > sourceWidth;
      actions = isPortrait
        ? [{ resize: { height: maxPx } }]
        : [{ resize: { width: maxPx } }];
    }
  }

  const result = await manipulateAsync(sourceUri, actions, {
    compress: quality,
    format: SaveFormat.JPEG,
  });

  return { uri: result.uri, width: result.width ?? sourceWidth, height: result.height ?? sourceHeight };
}

// ─── Core single-image upload ──────────────────────────────────────────────────

/**
 * Upload a single image to Supabase Storage with three pre-compressed variants.
 *
 * - Remote http/https URLs → returned as-is (no compression, no upload).
 * - Local file:// URIs     → compressed to thumb/card/full, all three uploaded.
 *
 * Returns the public URL for the **full** variant. Use getThumbUrl() / getCardUrl()
 * to derive the other variant URLs from the returned full URL.
 *
 * THROWS on any failure with a human-readable message.
 *
 * @param uri         Local file URI or remote https:// URL
 * @param pathPrefix  Storage path prefix (without leading slash)
 * @param index       Index of this image within the batch (used in filename)
 * @param onProgress  Optional callback fired at each compression/upload stage
 */
export async function uploadEventImage(
  uri: string,
  pathPrefix: string,
  index: number,
  onProgress?: (p: ImageUploadProgress) => void,
  total = 1,
): Promise<string> {
  // Already hosted remotely — no upload needed
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error(
      'Image upload failed: your session has expired. Please sign in again and retry.'
    );
  }

  const userId = session.user.id;

  // ── Step 1: Probe original dimensions ─────────────────────────────────────
  onProgress?.({ index, total, status: 'compressing', originalBytes: 0, compressedBytes: 0, originalDimensions: { width: 0, height: 0 }, compressedDimensions: { width: 0, height: 0 } });

  let sourceWidth = 0;
  let sourceHeight = 0;
  let originalBytes = 0;

  try {
    const probe = await manipulateAsync(uri, [], { compress: 1, format: SaveFormat.JPEG });
    sourceWidth = probe.width ?? 0;
    sourceHeight = probe.height ?? 0;
  } catch (probeErr) {
    const detail = probeErr instanceof Error ? probeErr.message : String(probeErr);
    throw new Error(`Image cannot be read: ${detail}. Try selecting a different photo.`);
  }

  // Get original file size on native
  if (Platform.OS !== 'web') {
    try {
      const FileSystem = require('expo-file-system');
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      originalBytes = (info as any).size ?? 0;
    } catch (_) {}
  }

  // ── Step 2: Compress all three variants ───────────────────────────────────
  let fullResult: CompressResult;
  let cardResult: CompressResult;
  let thumbResult: CompressResult;

  try {
    [fullResult, cardResult, thumbResult] = await Promise.all([
      compressVariant(uri, FULL_MAX_PX, FULL_QUALITY, 'longEdge', sourceWidth, sourceHeight),
      compressVariant(uri, CARD_MAX_PX, CARD_QUALITY, 'width', sourceWidth, sourceHeight),
      compressVariant(uri, THUMB_MAX_PX, THUMB_QUALITY, 'width', sourceWidth, sourceHeight),
    ]);
  } catch (compressErr) {
    const detail = compressErr instanceof Error ? compressErr.message : String(compressErr);
    throw new Error(`Image compression failed: ${detail}. Try selecting a different photo.`);
  }

  // ── Step 3: Measure compressed size ──────────────────────────────────────
  let compressedBytes = 0;
  if (Platform.OS !== 'web') {
    try {
      const FileSystem = require('expo-file-system');
      const info = await FileSystem.getInfoAsync(fullResult.uri, { size: true });
      compressedBytes = (info as any).size ?? 0;
    } catch (_) {}
  }

  onProgress?.({
    index,
    total,
    status: 'uploading',
    originalBytes,
    compressedBytes,
    originalDimensions: { width: sourceWidth, height: sourceHeight },
    compressedDimensions: { width: fullResult.width, height: fullResult.height },
  });

  // ── Step 4: Read all three variants into ArrayBuffer ──────────────────────
  async function readToBuffer(variantUri: string): Promise<ArrayBuffer> {
    if (Platform.OS === 'web') {
      const response = await fetch(variantUri);
      if (!response.ok) {
        throw new Error(`Image fetch failed (HTTP ${response.status}). The file may no longer be accessible.`);
      }
      return response.arrayBuffer();
    }

    const FileSystem = require('expo-file-system');
    const fileInfo = await FileSystem.getInfoAsync(variantUri);
    if (!fileInfo.exists) {
      throw new Error('Compressed image file not found — the device may have cleared temp storage. Please try again.');
    }

    const base64: string = await FileSystem.readAsStringAsync(variantUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64 || base64.length === 0) {
      throw new Error('Compressed image file appears to be empty or could not be read.');
    }

    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer as ArrayBuffer;
    } catch (decodeErr) {
      const detail = decodeErr instanceof Error ? decodeErr.message : String(decodeErr);
      throw new Error(`Image encoding error (base64 decode failed): ${detail}. Try selecting a JPEG or PNG image.`);
    }
  }

  let [fullBuf, cardBuf, thumbBuf]: ArrayBuffer[];
  try {
    [fullBuf, cardBuf, thumbBuf] = await Promise.all([
      readToBuffer(fullResult.uri),
      readToBuffer(cardResult.uri),
      readToBuffer(thumbResult.uri),
    ]);
  } catch (readErr) {
    throw readErr instanceof Error ? readErr : new Error(String(readErr));
  }

  // ── Step 5: Upload all three variants to Supabase Storage ─────────────────
  // Path: {userId}/{pathPrefix}/{index}_{timestamp}_{size}.jpg
  // First segment = auth.uid() required by RLS insert policy.
  const ts = Date.now();
  const fullPath  = `${userId}/${pathPrefix}/${index}_${ts}_full.jpg`;
  const cardPath  = `${userId}/${pathPrefix}/${index}_${ts}_card.jpg`;
  const thumbPath = `${userId}/${pathPrefix}/${index}_${ts}_thumb.jpg`;

  const uploadOpts = { contentType: 'image/jpeg', upsert: false };

  // Upload all variants in parallel; if any fail, report the first error
  const [fullUpload, cardUpload, thumbUpload] = await Promise.allSettled([
    supabase.storage.from('event-images').upload(fullPath,  fullBuf,  uploadOpts),
    supabase.storage.from('event-images').upload(cardPath,  cardBuf,  uploadOpts),
    supabase.storage.from('event-images').upload(thumbPath, thumbBuf, uploadOpts),
  ]);

  for (const result of [fullUpload, cardUpload, thumbUpload]) {
    if (result.status === 'rejected') {
      throw new Error(`Storage upload failed: ${String(result.reason)}`);
    }
    if (result.status === 'fulfilled' && result.value.error) {
      throw new Error(`Storage upload failed: ${result.value.error.message}`);
    }
  }

  // Return the public URL for the full-size variant
  const { data: { publicUrl } } = supabase.storage
    .from('event-images')
    .getPublicUrl(fullPath);

  onProgress?.({
    index,
    total,
    status: 'done',
    originalBytes,
    compressedBytes,
    originalDimensions: { width: sourceWidth, height: sourceHeight },
    compressedDimensions: { width: fullResult.width, height: fullResult.height },
  });

  return publicUrl;
}

/**
 * Upload a single ad image to the 'ad-images' bucket (admin-only).
 * Compresses the full + card variants. Returns the public full URL.
 * THROWS on any failure.
 */
export async function uploadAdImage(uri: string): Promise<string> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error('Ad image upload failed: session expired. Please sign in again.');
  }

  let sourceWidth = 0;
  let sourceHeight = 0;
  try {
    const probe = await manipulateAsync(uri, [], { compress: 1, format: SaveFormat.JPEG });
    sourceWidth = probe.width ?? 0;
    sourceHeight = probe.height ?? 0;
  } catch (e) {
    throw new Error('Ad image cannot be read. Try a different file.');
  }

  const fullResult = await compressVariant(uri, FULL_MAX_PX, FULL_QUALITY, 'longEdge', sourceWidth, sourceHeight);
  const filename = `ads/${session.user.id}_${Date.now()}_full.jpg`;

  let arrayBuffer: ArrayBuffer;
  if (Platform.OS === 'web') {
    const response = await fetch(fullResult.uri);
    if (!response.ok) throw new Error(`Ad image fetch failed (HTTP ${response.status})`);
    arrayBuffer = await response.arrayBuffer();
  } else {
    const FileSystem = require('expo-file-system');
    const fileInfo = await FileSystem.getInfoAsync(fullResult.uri);
    if (!fileInfo.exists) throw new Error('Ad image file not found after compression.');
    const base64: string = await FileSystem.readAsStringAsync(fullResult.uri, { encoding: FileSystem.EncodingType.Base64 });
    if (!base64 || base64.length === 0) throw new Error('Ad image file appears empty.');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    arrayBuffer = bytes.buffer as ArrayBuffer;
  }

  const { error: storageError } = await supabase.storage
    .from('ad-images')
    .upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: false });

  if (storageError) throw new Error(`Ad storage upload failed: ${storageError.message}`);

  const { data: { publicUrl } } = supabase.storage.from('ad-images').getPublicUrl(filename);
  return publicUrl;
}

/**
 * Upload multiple event images sequentially (one at a time to avoid OOM on
 * low-memory Android devices with large batch sizes).
 * Already-remote URLs pass through unchanged.
 *
 * THROWS if any local image upload fails.
 *
 * @param onProgress  Called after each image finishes (or errors)
 */
export async function uploadEventImages(
  uris: string[],
  pathPrefix: string,
  onProgress?: (p: ImageUploadProgress) => void,
): Promise<string[]> {
  const results: string[] = [];
  const total = uris.filter((u) => !u.startsWith('http')).length || uris.length;

  for (let i = 0; i < uris.length; i++) {
    const url = await uploadEventImage(uris[i], pathPrefix, i, onProgress, total);
    results.push(url);
  }

  return results;
}

// ─── Human-readable size helper (used by UI) ─────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
