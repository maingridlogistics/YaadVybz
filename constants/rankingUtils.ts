/**
 * rankingUtils.ts — Centralized event-ranking weights and comparators.
 *
 * Design contract:
 *   • An active paid boost ALWAYS outranks a higher-tier unboosted event.
 *   • Promoter tier from the cached Event row is NEVER used for ranking on
 *     search/discovery surfaces — it can be stale (subscription may have
 *     expired, upgraded, or been revoked since the event was created).
 *     Search Priority entitlement is evaluated server-side in search_events RPC.
 *   • compareBrowse is used only by EventsExplore general-browse (client-side,
 *     non-search discovery). It ranks on boost + engagement + date only.
 *   • compareFeatured and compareTrending are editorial rails — no tier signal.
 *   • Expired, canceled, or event-ended boosts receive a score of 0.
 *   • All sorting surfaces import from here; no duplicate logic elsewhere.
 */

import { Event, isEventPassed } from './data';

// ─── Weights (single source of truth) ────────────────────────────────────────
export const RANK_WEIGHTS = {
  /**
   * Boost scores.
   * These are integers so comparisons are exact; never use fractions here.
   * until_event_end > seven_day > three_day > legacy > 0
   */
  boost: {
    until_event_end: 3,
    seven_day:       2,
    three_day:       1,
    legacy:          1,  // boosted=true with no boost_type (backward compat)
  },

  /**
   * Trending boost bonus — fraction added to the engagement total.
   * A boost score of 3 adds at most 3 × boostBonus = 1.5 "engagement points".
   * This lets an active boost break ties between similar-engagement events
   * without letting a low-engagement boosted event leapfrog a popular one.
   */
  trendingBoostBonus: 0.5,

} as const;

// ─── Primitive scorers ────────────────────────────────────────────────────────

/**
 * Returns the active boost score (0–3) for an event.
 * Zero is returned for: unboosted, inactive status, expired time, or
 * until_event_end where the event has already passed.
 */
export function getBoostScore(event: Event): number {
  if (!event.boosted) return 0;
  if ((event.boostStatus ?? 'active') !== 'active') return 0;

  if (event.boostType === 'until_event_end') {
    return isEventPassed(event.date) ? 0 : RANK_WEIGHTS.boost.until_event_end;
  }

  // Time-limited boosts: check wall-clock expiry
  if (!event.boostExpiresAt) {
    // Legacy: boosted=true with no type or expiry
    return RANK_WEIGHTS.boost.legacy;
  }
  if (new Date(event.boostExpiresAt) <= new Date()) return 0;

  if (event.boostType === 'seven_day')  return RANK_WEIGHTS.boost.seven_day;
  if (event.boostType === 'three_day')  return RANK_WEIGHTS.boost.three_day;
  return RANK_WEIGHTS.boost.legacy;
}

// ─── Comparators ─────────────────────────────────────────────────────────────

/**
 * BROWSE comparator — used by EventsExplore general-browse (client-side).
 *
 * Subscription tier (promoterTier) is intentionally NOT included.
 * The cached Event.promoterTier field can be stale (e.g. subscription expired
 * after event creation). Search Priority ranking is handled server-side by the
 * search_events RPC, which joins user_profiles for live entitlement.
 *
 * Sorting order (client-side general browse, not search):
 *   1. Active boost score          (paid boost always beats organic)
 *   2. Engagement (going + interested)
 *   3. Event date (soonest first)
 */
export function compareBrowse(a: Event, b: Event): number {
  const boostDiff = getBoostScore(b) - getBoostScore(a);
  if (boostDiff !== 0) return boostDiff;

  const engDiff =
    (b.goingCount + b.interestedCount) - (a.goingCount + a.interestedCount);
  if (engDiff !== 0) return engDiff;

  // Soonest event first when everything else is equal
  if (a.date && b.date) return a.date.localeCompare(b.date);
  return 0;
}

/**
 * FEATURED CAROUSEL comparator (Home tab hero strip).
 *
 * Sorting order:
 *   1. Active boost score          (any boosted event ranks above all organic)
 *   2. Engagement
 *   3. Date (soonest first)
 *
 * Subscription tier intentionally omitted — the Featured carousel is an
 * editorial rail and must NOT be influenced by Search Priority.
 * Caller must pre-filter to events where featured === true OR boostScore > 0.
 */
export function compareFeatured(a: Event, b: Event): number {
  const boostDiff = getBoostScore(b) - getBoostScore(a);
  if (boostDiff !== 0) return boostDiff;

  const engDiff = (b.goingCount + b.interestedCount) - (a.goingCount + a.interestedCount);
  if (engDiff !== 0) return engDiff;

  if (a.date && b.date) return a.date.localeCompare(b.date);
  return 0;
}

/**
 * TRENDING / "YOU MIGHT ALSO LIKE" comparator (Home trending rail).
 *
 * Engagement is the primary driver. The boost and tier bonuses are fractional
 * additions so that:
 *   • A popular event (high engagement) is never buried by a boosted one.
 *   • An active boost provides a meaningful nudge between similarly-engaged events.
 *   • Tier provides an almost-invisible nudge when both boost AND engagement tie.
 *
 * Numeric examples:
 *   engagement=100, boost=3 → score = 101.50
 *   engagement=100, boost=0 → score = 100.00
 *   → boosted event wins despite equal engagement ✓
 *
 *   engagement=200, boost=0 → score = 200.00
 *   engagement=100, boost=3 → score = 101.50
 *   → popular event still wins ✓
 *
 * Subscription tier intentionally omitted — the Trending rail is an editorial
 * surface and must NOT be influenced by Search Priority.
 */
export function compareTrending(a: Event, b: Event): number {
  const scoreA =
    (a.goingCount + a.interestedCount)
    + getBoostScore(a) * RANK_WEIGHTS.trendingBoostBonus;

  const scoreB =
    (b.goingCount + b.interestedCount)
    + getBoostScore(b) * RANK_WEIGHTS.trendingBoostBonus;

  return scoreB - scoreA;
}

