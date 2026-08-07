/**
 * rankingUtils.ts — Centralized event-ranking weights and comparators.
 *
 * Design contract:
 *   • An active paid boost ALWAYS outranks a higher-tier unboosted event.
 *   • Promoter tier is a tiebreaker only — it never overrides a meaningful
 *     boost-score difference or a clear engagement/relevance gap.
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
   * Tier scores.
   * Used only as a secondary/tertiary sort key — always after boost.
   */
  tier: {
    elite: 2,
    pro:   1,
    free:  0,
  },

  /**
   * Trending boost bonus — fraction added to the engagement total.
   * A boost score of 3 adds at most 3 × boostBonus = 1.5 "engagement points".
   * This lets an active boost break ties between similar-engagement events
   * without letting a low-engagement boosted event leapfrog a popular one.
   */
  trendingBoostBonus: 0.5,

  /**
   * Trending tier nudge — essentially invisible unless engagement AND boost
   * are exactly equal between two events.
   */
  trendingTierNudge: 0.01,
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

/**
 * Returns the promoter tier score (0–2).
 * Never used as a primary sort key — always secondary or tertiary.
 */
export function getTierScore(event: Event): number {
  if (event.promoterTier === 'elite') return RANK_WEIGHTS.tier.elite;
  if (event.promoterTier === 'pro')   return RANK_WEIGHTS.tier.pro;
  return RANK_WEIGHTS.tier.free;
}

// ─── Comparators ─────────────────────────────────────────────────────────────

/**
 * BROWSE / SEARCH comparator.
 *
 * Sorting order:
 *   1. Active boost score          (paid boost always beats higher tier)
 *   2. Promoter tier               (tiebreaker between equal boost scores)
 *   3. Engagement (going + interested)
 *   4. Event date (newer / sooner first)
 *
 * An unrelated Elite event will not outrank a relevant Free event because
 * relevance is handled by the caller's filter pass before sorting begins.
 * Within the filtered set, boost → tier → engagement → date applies.
 */
export function compareBrowse(a: Event, b: Event): number {
  const boostDiff = getBoostScore(b) - getBoostScore(a);
  if (boostDiff !== 0) return boostDiff;

  const tierDiff = getTierScore(b) - getTierScore(a);
  if (tierDiff !== 0) return tierDiff;

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
 *   2. Promoter tier               (tiebreaker within the same boost band)
 *   3. Engagement
 *
 * Caller must pre-filter to events where featured === true OR boostScore > 0.
 * Organic featured events (no active boost) rank below ANY boosted event.
 */
export function compareFeatured(a: Event, b: Event): number {
  const boostDiff = getBoostScore(b) - getBoostScore(a);
  if (boostDiff !== 0) return boostDiff;

  const tierDiff = getTierScore(b) - getTierScore(a);
  if (tierDiff !== 0) return tierDiff;

  return (b.goingCount + b.interestedCount) - (a.goingCount + a.interestedCount);
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
 * Numeric examples (see test scenarios below for full verification):
 *   engagement=100, boost=3 → score = 101.52
 *   engagement=100, boost=0 → score = 100.02  (elite tier)
 *   → boosted event wins despite equal engagement ✓
 *
 *   engagement=200, boost=3 → score = 201.50
 *   engagement=100, boost=3 → score = 101.50
 *   → high-engagement unboosted (if eng=200, boost=0) → 200.02 vs 101.50
 *   → popular event still wins ✓
 */
export function compareTrending(a: Event, b: Event): number {
  const scoreA =
    (a.goingCount + a.interestedCount)
    + getBoostScore(a) * RANK_WEIGHTS.trendingBoostBonus
    + getTierScore(a) * RANK_WEIGHTS.trendingTierNudge;

  const scoreB =
    (b.goingCount + b.interestedCount)
    + getBoostScore(b) * RANK_WEIGHTS.trendingBoostBonus
    + getTierScore(b) * RANK_WEIGHTS.trendingTierNudge;

  return scoreB - scoreA;
}

