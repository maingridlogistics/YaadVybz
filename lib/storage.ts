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
// IMAGE VARIANT URL HELPERS
// -------------------------
//   getThumbUrl(url)   → 320 px wide  — list cards, mini cards
//   getCardUrl(url)    → 720 px wide  — EventCard, EventCardFeatured
//   getFullUrl(url)    → 1600 px wide — event detail hero/gallery
//
// OWNERSHIP SCOPING
// -----------------
// Every file is stored under {user_id}/{pathPrefix}/... so the RLS policies
// can verify ownership via storage.foldername(name)[1].
//
// ERROR POLICY
// ------------
// uploadEventImage and uploadEventImages THROW on failure for local files.
// Callers must catch and NOT proceed to postEvent/editEvent on error.

import { Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

// ─── Size Targets ─────────────────────────────────────────────────────────────

const FULL_MAX_PX = 1600;
const CARD_MAX_PX = 720;
const THUMB_MAX_PX = 320;
const FULL_QUALITY = 0.80;
const CARD_QUALITY = 0.78;
const THUMB_QUALITY = 0.75;

// ─── Variant URL helpers ───────────────────────────────────────────────────────

function baseUrl(url: string): string {
  return url.replace(/_(thumb|card|full)\.(jpg|jpeg|png|webp)(\?.*)?$/, '_full.jpg');
}

export function getThumbUrl(url: string | undefined | null): string {
  if (!url) return '';
  const base = baseUrl(url);
  if (base.includes('supabase')) return base.replace('_full.jpg', '_thumb.jpg');
  return url;
}

export function getCardUrl(url: string | undefined | null): string {
  if (!url) return '';
  const base = baseUrl(url);
  if (base.includes('supabase')) return base.replace('_full.jpg', '_card.jpg');
  return url;
}

export function getFullUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.includes('supabase') && !url.includes('_full.jpg')) return baseUrl(url);
  return url;
}

// ─── Upload progress ──────────────────────────────────────────────────────────

export interface ImageUploadProgress {
  index: number;
  total: number;
  status: 'compressing' | 'uploading' | 'done' | 'error';
  originalBytes: number;
  compressedBytes: number;
  originalDimensions: { width: number; height: number };
  compressedDimensions: { width: number; height: number };
}

// ─── Internal compression helper ──────────────────────────────────────────────

interface CompressResult {
  uri: string;
  width: number;
  height: number;
}

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
      const isPortrait = sourceHeight > sourceWidth;
      actions = isPortrait ? [{ resize: { height: maxPx } }] : [{ resize: { width: maxPx } }];
    }
  }

  const result = await manipulateAsync(sourceUri, actions, {
    compress: quality,
    format: SaveFormat.JPEG,
  });

  return { uri: result.uri, width: result.width ?? sourceWidth, height: result.height ?? sourceHeight };
}

// ─── Read a compressed temp file to ArrayBuffer ───────────────────────────────

async function readToBuffer(variantUri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(variantUri);
    if (!response.ok) {
      throw new Error(`Image fetch failed (HTTP ${response.status}). The file may no longer be accessible.`);
    }
    return response.arrayBuffer();
  }

  const FileSystem = require('expo-file-system/legacy');
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

// ─── Core single-image upload ──────────────────────────────────────────────────

export async function uploadEventImage(
  uri: string,
  pathPrefix: string,
  index: number,
  onProgress?: (p: ImageUploadProgress) => void,
  total = 1,
): Promise<string> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error('Image upload failed: your session has expired. Please sign in again and retry.');
  }

  const userId = session.user.id;

  // ── Step 1: Probe original dimensions ─────────────────────────────────────
  onProgress?.({
    index, total, status: 'compressing',
    originalBytes: 0, compressedBytes: 0,
    originalDimensions: { width: 0, height: 0 },
    compressedDimensions: { width: 0, height: 0 },
  });

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

  if (Platform.OS !== 'web') {
    try {
      const FileSystem = require('expo-file-system/legacy');
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      originalBytes = (info as any).size ?? 0;
    } catch (_) {}
  }

  // ── Step 2: Compress all three variants ───────────────────────────────────
  let fullResult: CompressResult;
  let cardResult: CompressResult;
  let thumbResult: CompressResult;

  try {
    const compressed = await Promise.all([
      compressVariant(uri, FULL_MAX_PX, FULL_QUALITY, 'longEdge', sourceWidth, sourceHeight),
      compressVariant(uri, CARD_MAX_PX, CARD_QUALITY, 'width', sourceWidth, sourceHeight),
      compressVariant(uri, THUMB_MAX_PX, THUMB_QUALITY, 'width', sourceWidth, sourceHeight),
    ]);
    fullResult = compressed[0];
    cardResult = compressed[1];
    thumbResult = compressed[2];
  } catch (compressErr) {
    const detail = compressErr instanceof Error ? compressErr.message : String(compressErr);
    throw new Error(`Image compression failed: ${detail}. Try selecting a different photo.`);
  }

  // ── Step 3: Measure compressed size ──────────────────────────────────────
  let compressedBytes = 0;
  if (Platform.OS !== 'web') {
    try {
      const FileSystem = require('expo-file-system/legacy');
      const info = await FileSystem.getInfoAsync(fullResult.uri, { size: true });
      compressedBytes = (info as any).size ?? 0;
    } catch (_) {}
  }

  onProgress?.({
    index, total, status: 'uploading',
    originalBytes, compressedBytes,
    originalDimensions: { width: sourceWidth, height: sourceHeight },
    compressedDimensions: { width: fullResult.width, height: fullResult.height },
  });

  // ── Step 4: Read all three variants into ArrayBuffer ──────────────────────
  let fullBuf: ArrayBuffer;
  let cardBuf: ArrayBuffer;
  let thumbBuf: ArrayBuffer;

  try {
    const bufs = await Promise.all([
      readToBuffer(fullResult.uri),
      readToBuffer(cardResult.uri),
      readToBuffer(thumbResult.uri),
    ]);
    fullBuf = bufs[0];
    cardBuf = bufs[1];
    thumbBuf = bufs[2];
  } catch (readErr) {
    throw readErr instanceof Error ? readErr : new Error(String(readErr));
  }

  // ── Step 5: Upload all three variants to Supabase Storage ─────────────────
  const ts = Date.now();
  const fullPath  = `${userId}/${pathPrefix}/${index}_${ts}_full.jpg`;
  const cardPath  = `${userId}/${pathPrefix}/${index}_${ts}_card.jpg`;
  const thumbPath = `${userId}/${pathPrefix}/${index}_${ts}_thumb.jpg`;

  const uploadOpts = { contentType: 'image/jpeg', upsert: false };

  const uploadResults = await Promise.allSettled([
    supabase.storage.from('event-images').upload(fullPath,  fullBuf,  uploadOpts),
    supabase.storage.from('event-images').upload(cardPath,  cardBuf,  uploadOpts),
    supabase.storage.from('event-images').upload(thumbPath, thumbBuf, uploadOpts),
  ]);

  for (const result of uploadResults) {
    if (result.status === 'rejected') {
      throw new Error(`Storage upload failed: ${String(result.reason)}`);
    }
    if (result.status === 'fulfilled' && result.value.error) {
      throw new Error(`Storage upload failed: ${result.value.error.message}`);
    }
  }

  const { data: { publicUrl } } = supabase.storage
    .from('event-images')
    .getPublicUrl(fullPath);

  onProgress?.({
    index, total, status: 'done',
    originalBytes, compressedBytes,
    originalDimensions: { width: sourceWidth, height: sourceHeight },
    compressedDimensions: { width: fullResult.width, height: fullResult.height },
  });

  return publicUrl;
}

// ─── Ad image upload ──────────────────────────────────────────────────────────

export async function uploadAdImage(uri: string): Promise<string> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Ad image upload failed: session expired. Please sign in again.');

  let sourceWidth = 0;
  let sourceHeight = 0;
  try {
    const probe = await manipulateAsync(uri, [], { compress: 1, format: SaveFormat.JPEG });
    sourceWidth = probe.width ?? 0;
    sourceHeight = probe.height ?? 0;
  } catch (_) {
    throw new Error('Ad image cannot be read. Try a different file.');
  }

  const fullResult = await compressVariant(uri, FULL_MAX_PX, FULL_QUALITY, 'longEdge', sourceWidth, sourceHeight);
  const filename = `ads/${session.user.id}_${Date.now()}_full.jpg`;

  const arrayBuffer = await readToBuffer(fullResult.uri);

  const { error: storageError } = await supabase.storage
    .from('ad-images')
    .upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: false });

  if (storageError) throw new Error(`Ad storage upload failed: ${storageError.message}`);

  const { data: { publicUrl } } = supabase.storage.from('ad-images').getPublicUrl(filename);
  return publicUrl;
}

// ─── Profile photo upload ────────────────────────────────────────────────────

export async function uploadProfilePhoto(uri: string, userId: string): Promise<string> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;

  // Probe original dimensions
  let sourceWidth = 0;
  let sourceHeight = 0;
  try {
    const probe = await manipulateAsync(uri, [], { compress: 1, format: SaveFormat.JPEG });
    sourceWidth = probe.width ?? 0;
    sourceHeight = probe.height ?? 0;
  } catch (err) {
    throw new Error('Profile photo cannot be read. Try a different image.');
  }

  // Compress to max 512 px — appropriate for circular avatars
  const MAX_PX = 512;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const actions: Parameters<typeof manipulateAsync>[1] = longestSide > MAX_PX
    ? [{ resize: { width: MAX_PX } }]
    : [];

  let compressed: { uri: string };
  try {
    compressed = await manipulateAsync(uri, actions, {
      compress: 0.82,
      format: SaveFormat.JPEG,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Profile photo compression failed: ${detail}`);
  }

  const arrayBuffer = await readToBuffer(compressed.uri);

  // Each upload gets a unique timestamped filename to bust CDN cache naturally
  const filename = `${userId}/avatar_${Date.now()}.jpg`;
  const { error: storageError } = await supabase.storage
    .from('profile-images')
    .upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

  if (storageError) throw new Error(`Profile photo upload failed: ${storageError.message}`);

  const { data: { publicUrl } } = supabase.storage.from('profile-images').getPublicUrl(filename);
  return publicUrl;
}

// ─── Batch upload ─────────────────────────────────────────────────────────────

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

// ─── Human-readable size helper ───────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
