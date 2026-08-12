// ─── Canonical Jamaica Parishes ───────────────────────────────────────────────
// Single source of truth for all 14 Jamaica parishes.
// Use canonical spelling ("Saint Andrew" not "St. Andrew") for DB consistency.
// Legacy values ("St. Andrew", "St Andrew") are mapped via PARISH_LEGACY_MAP.
//
// IMPORTANT: Do NOT maintain separate parish arrays elsewhere in the codebase.
// Import from this file everywhere parishes are needed.

export const JAMAICA_PARISHES = [
  'Kingston',
  'Saint Andrew',
  'Saint Catherine',
  'Clarendon',
  'Manchester',
  'Saint Elizabeth',
  'Westmoreland',
  'Hanover',
  'Saint James',
  'Trelawny',
  'Saint Ann',
  'Saint Mary',
  'Portland',
  'Saint Thomas',
] as const;

export type JamaicaParish = typeof JAMAICA_PARISHES[number];

// Legacy variant → canonical mapping.
// Use normalizeParish() to safely map any stored value to the canonical form.
export const PARISH_LEGACY_MAP: Record<string, JamaicaParish> = {
  'St. Andrew':   'Saint Andrew',
  'St Andrew':    'Saint Andrew',
  'St Catherine': 'Saint Catherine',
  'St. Catherine':'Saint Catherine',
  'St. Elizabeth':'Saint Elizabeth',
  'St Elizabeth': 'Saint Elizabeth',
  'St. James':    'Saint James',
  'St James':     'Saint James',
  'St. Ann':      'Saint Ann',
  'St Ann':       'Saint Ann',
  'St. Mary':     'Saint Mary',
  'St Mary':      'Saint Mary',
  'St. Thomas':   'Saint Thomas',
  'St Thomas':    'Saint Thomas',
};

/**
 * Normalizes any parish string (including legacy variants) to the canonical form.
 * Returns the original string unchanged if no mapping exists.
 */
export function normalizeParish(parish: string): string {
  return PARISH_LEGACY_MAP[parish] ?? parish;
}

/**
 * Checks whether a string is a valid Jamaica parish (canonical OR legacy form).
 */
export function isValidParish(parish: string): parish is JamaicaParish {
  const normalized = normalizeParish(parish);
  return JAMAICA_PARISHES.includes(normalized as JamaicaParish);
}
