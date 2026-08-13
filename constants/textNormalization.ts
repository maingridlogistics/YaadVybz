/**
 * Text normalization utilities for user names and event titles.
 */

/**
 * Capitalizes the first letter of a word, lowercasing the rest.
 */
function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Converts a user name to proper title case.
 * Handles hyphens (Mary-Jane → Mary-Jane) and apostrophes (O'Connor → O'Connor).
 * Examples:
 *   "john smith"   → "John Smith"
 *   "JOHN SMITH"   → "John Smith"
 *   "mary-jane"    → "Mary-Jane"
 *   "o'connor"     → "O'Connor"
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
  const trimmed = str.trim().replace(/\s+/g, ' ');
  return trimmed
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (word.includes('-')) {
        return word.split('-').map(capitalizeWord).join('-');
      }
      if (word.includes("'")) {
        return word.split("'").map(capitalizeWord).join("'");
      }
      return capitalizeWord(word);
    })
    .join(' ');
}

// Emoji removal regex — covers major Unicode emoji blocks
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|\u{FE0F}|\u{20E3}|\u{200D}/gu;

/**
 * Normalizes an event title:
 * - Strips emoji characters
 * - Trims and collapses whitespace
 * - Converts to title case (first letter of each word capitalized, rest lower)
 * - Pure numeric tokens (e.g. "2026") are preserved unchanged
 * - Returns empty string if the result is blank after stripping
 *
 * Examples:
 *   "JOHN Kinfolk EVENT"  → "John Kinfolk Event"
 *   "SUMMER PARTY 2026"   → "Summer Party 2026"
 *   "dancehall NIGHT"     → "Dancehall Night"
 */
export function normalizeEventTitle(str: string): string {
  if (!str) return '';
  // Remove emojis
  const stripped = str.replace(EMOJI_REGEX, '');
  // Trim and collapse whitespace
  const trimmed = stripped.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  // Title case each word; pure numeric tokens (e.g. years) are unchanged
  return trimmed
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (/^\d+$/.test(word)) return word; // e.g. "2026"
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
