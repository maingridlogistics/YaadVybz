
// Vybz Hub — Data Types & Mock Data

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  tiktok?: string;
  website?: string;
}

export type SubscriptionTier = 'free' | 'pro' | 'elite';

// ─── Apple In-App Purchase Product IDs ────────────────────────────────────────
// Registered in App Store Connect. Mirror values in services/iapService.ts.
// DO NOT change product IDs after App Review approval — Apple treats them as permanent.
export const APPLE_PRODUCT_IDS = {
  SUBSCRIPTIONS: {
    PRO_MONTHLY:    'com.vybzhub.subscription.promoter_pro.monthly',
    PRO_YEARLY:     'com.vybzhub.subscription.promoter_pro.yearly',
    ELITE_MONTHLY:  'com.vybzhub.subscription.elite.monthly',
    ELITE_YEARLY:   'com.vybzhub.subscription.elite.yearly',
  },
  BOOSTS: {
    THREE_DAY:       'com.vybzhub.boost.three_day',
    SEVEN_DAY:       'com.vybzhub.boost.seven_day',
    UNTIL_EVENT_END: 'com.vybzhub.boost.until_event_end',
  },
} as const;

export type AppleSubscriptionProductId =
  typeof APPLE_PRODUCT_IDS.SUBSCRIPTIONS[keyof typeof APPLE_PRODUCT_IDS.SUBSCRIPTIONS];
export type AppleBoostProductId =
  typeof APPLE_PRODUCT_IDS.BOOSTS[keyof typeof APPLE_PRODUCT_IDS.BOOSTS];

// ─── Google Play Billing Product IDs ─────────────────────────────────────────
// Registered in Google Play Console. Must match exactly.
// Subscriptions: each SKU maps to one base plan (monthly or yearly).
export const GOOGLE_PRODUCT_IDS = {
  SUBSCRIPTIONS: {
    PRO_MONTHLY:    'com.vybzhub.subscription.promoter_pro.monthly',
    PRO_YEARLY:     'com.vybzhub.subscription.promoter_pro.yearly',
    ELITE_MONTHLY:  'com.vybzhub.subscription.elite.monthly',
    ELITE_YEARLY:   'com.vybzhub.subscription.elite.yearly',
  },
  BOOSTS: {
    THREE_DAY:       'com.vybzhub.boost.three_day',
    SEVEN_DAY:       'com.vybzhub.boost.seven_day',
    UNTIL_EVENT_END: 'com.vybzhub.boost.until_event_end',
  },
} as const;

export type GoogleSubscriptionProductId =
  typeof GOOGLE_PRODUCT_IDS.SUBSCRIPTIONS[keyof typeof GOOGLE_PRODUCT_IDS.SUBSCRIPTIONS];
export type GoogleBoostProductId =
  typeof GOOGLE_PRODUCT_IDS.BOOSTS[keyof typeof GOOGLE_PRODUCT_IDS.BOOSTS];

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  avatarUrl?: string;
  homeParish: string;
  preferredParishes?: string[];  // multi-parish preferences, editable from profile
  interests: string[];
  roles: ('attendee' | 'promoter' | 'admin')[];
  followersCount: number;
  eventsPosted: number;
  joinedAt: string;
  bio?: string;
  socialLinks?: SocialLinks;
  verified?: boolean;            // promoter verified badge (legacy)
  subscriptionTier?: SubscriptionTier; // active plan (synced from Stripe webhook)
  subscriptionExpiresAt?: string;      // ISO date when plan expires
  // Subscription fields (populated from DB, written only by Stripe webhook)
  verifiedPromoter?: boolean;          // true when plan is pro or elite and subscription is active
  remainingBoosts?: number;            // free boost credits left this billing cycle
  monthlyBoostAllowance?: number;      // credits granted per billing cycle
  subscriptionStatus?: string;         // 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid'
  currentPeriodEnd?: string;           // ISO: when current billing period ends
  stripeCustomerId?: string;           // Stripe customer ID (never shown to users)
  // Supabase-persisted fields
  followedPromoters: string[];         // promoter IDs this user follows
  requireEventApproval: boolean;       // admin: require event approval before going live
  featuredPriority?: number;           // 0=free, 1=pro, 2=elite — used for search ordering
  emailNotifNewParish: boolean;        // email pref: new events in preferred parishes
  emailNotifNewPromoter: boolean;      // email pref: events from followed promoters
  emailNotifEventChange: boolean;      // email pref: event updates & cancellations
  emailNotifEventReminder: boolean;    // email pref: event day reminders
  // Push notification preferences (server-sent; rsvp_reminder is local-only)
  pushNotifNewParish: boolean;         // push pref: new events in preferred parishes
  pushNotifNewPromoter: boolean;       // push pref: events from followed promoters
  pushNotifEventChange: boolean;       // push pref: event updates & cancellations
}

// ─── Physical Ticket Location ─────────────────────────────────────────────────
export interface PhysicalTicketLocation {
  business_name: string;
  town: string;
  parish: string;
}

export type EventStatus = 'pending' | 'live' | 'rejected' | 'flagged';

export type NotificationType =
  | 'new_event_parish'                    // new event in preferred parish
  | 'new_event_promoter'                  // new event from followed promoter
  | 'event_reminder'                      // day-of or 1-hr before reminder
  | 'event_change'                        // event time/details changed
  | 'event_cancelled'                     // event cancelled
  | 'event_approved'                      // admin approved your event
  | 'event_rejected'                      // admin rejected your event
  | 'event_rsvp'                          // user RSVP'd to promoter's event
  | 'new_follower'                        // someone followed you
  | 'boost_expiring'                      // promoter's boost is expiring soon
  | 'payment_failed'                      // subscription payment failed
  | 'subscription_cancellation_scheduled' // subscription set to cancel
  | 'account_deletion_request'            // user submitted deletion request (admin)
  | 'account_deletion_rejected'           // admin rejected deletion request (user)
  | 'profile_verification_approved'       // admin approved profile verification
  | 'profile_verification_rejected';      // admin rejected profile verification

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  eventId?: string;
  promoterId?: string;
  read: boolean;
  createdAt: string;  // ISO string
}

export interface Event {
  id: string;
  title: string;
  description: string;
  type: string;               // primary type ID (for color lookup)
  typeLabel: string;          // primary type display label
  eventTypes: string[];       // all selected type IDs (multi-select)
  parish: string;
  date: string;
  startTime: string;          // event start time
  endTime: string;            // event end time
  venue: string;
  address: string;
  coverImage: string;         // primary flyer image (used by cards)
  flyerImages: string[];      // all flyer/cover images
  ticketPrice: string;        // e.g. "JMD 3,500" or "Free"
  ticketLink: string;         // contact / ticket purchase link
  dressCode?: string;         // optional
  ageLimit: string;           // e.g. "All Ages", "18+", "21+"
  lineup: string[];           // stored as "Role: Name" strings for compat
  lineupEntries?: { name: string; role: string }[];
  recurring: boolean;
  recurringFrequency?: string; // e.g. "Weekly", "Bi-Weekly", "Monthly"
  promoterId: string;
  promoterName: string;
  promoterSocialLinks?: SocialLinks;
  goingCount: number;
  interestedCount: number;
  viewCount?: number;
  featured: boolean;
  tags: string[];
  status: EventStatus;        // moderation status
  flagReason?: string;        // reason if flagged
  rejectedReason?: string;    // reason if rejected
  reportCount?: number;       // community flag count
  eventPhotosLink?: string;    // link to post-event photos gallery (added after the event)
  contactInfo?: string;         // phone, WhatsApp, or social handle for attendee contact
  createdAt?: string;          // ISO — when the event was posted (for monthly event limit)
  promoterTier?: string;       // 'free' | 'pro' | 'elite' — denorm'd from promoter plan for sort/badge
  // ── Boost / Monetization ──
  boosted?: boolean;           // currently boosted (paid placement)
  boostType?: string;          // 'three_day' | 'seven_day' | 'until_event_end'
  boostStatus?: string;        // 'active' | 'expired' | 'refunded'
  boostStartedAt?: string;     // ISO — when the boost was activated
  boostExpiresAt?: string;     // ISO date when time-based boost expires
  boostImpressions?: number;   // tracked boost view count
  boostPaymentIntent?: string; // Stripe payment intent ID
  boostCheckoutSession?: string; // Stripe checkout session ID
  boostAmount?: number;        // amount paid in cents
  boostCurrency?: string;      // currency code e.g. 'usd'
  // ── Ticket Sales ──
  sellingTicketsInApp?: boolean; // using in-app ticket sales
  ticketCommissionPct?: number;  // commission % (default 5)
  ticketsSold?: number;          // tickets sold via app
  // ── Extended Ticket Methods ──
  ticketProviderName?: string;          // external ticket provider (e.g. "Eventbrite")
  physicalTicketLocations?: PhysicalTicketLocation[]; // up to 5 physical sales locations
}

// ─── Subscription Plans ───────────────────────────────────────────────────────
export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  tagline: string;
  priceMonthly: number;      // USD
  priceYearly: number;       // USD/yr
  color: string;
  icon: string;
  features: string[];
  comingSoonFeatures?: string[]; // displayed but disabled
  highlight?: string;        // badge text e.g. "Most Popular"
  appleProductIdMonthly?: string;  // Apple IAP product ID for monthly billing
  appleProductIdYearly?: string;   // Apple IAP product ID for yearly billing
  googleProductIdMonthly?: string; // Google Play product ID for monthly billing
  googleProductIdYearly?: string;  // Google Play product ID for yearly billing
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: 'free',
    name: 'Free',
    tagline: 'Get started at no cost',
    priceMonthly: 0,
    priceYearly: 0,
    color: '#607D8B',
    icon: 'person',
    features: [
      'Post up to 3 events/month',
      'Basic event listing',
      'RSVP tracking',
      'Browse & discover events',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    tagline: 'For serious creators — events & businesses',
    priceMonthly: 4.99,
    priceYearly: 44.99,
    color: '#FFD700',
    icon: 'campaign',
    highlight: 'Most Popular',
    appleProductIdMonthly:  'com.vybzhub.subscription.promoter_pro.monthly',
    appleProductIdYearly:   'com.vybzhub.subscription.promoter_pro.yearly',
    googleProductIdMonthly: 'com.vybzhub.subscription.promoter_pro.monthly',
    googleProductIdYearly:  'com.vybzhub.subscription.promoter_pro.yearly',
    features: [
      '3 posts per billing cycle (Events + Businesses)',
      '2 included Boosts per billing cycle',
      'Profile Verification Included',
      'Event & Business analytics dashboard',
      'Priority in search results',
      'Creator Profile page',
    ],
  },
  {
    tier: 'elite',
    name: 'Elite',
    tagline: 'Maximum reach across Jamaica',
    priceMonthly: 14.99,
    priceYearly: 134.99,
    color: '#E91E63',
    icon: 'star',
    highlight: 'Best Value',
    appleProductIdMonthly:  'com.vybzhub.subscription.elite.monthly',
    appleProductIdYearly:   'com.vybzhub.subscription.elite.yearly',
    googleProductIdMonthly: 'com.vybzhub.subscription.elite.monthly',
    googleProductIdYearly:  'com.vybzhub.subscription.elite.yearly',
    features: [
      '6 posts per billing cycle (Events + Businesses)',
      '6 included Boosts per billing cycle',
      'Profile Verification Included',
      'Priority in search results',
      'Creator Profile page',
      'Event & Business advanced analytics',
      'Analytics exports',
      'Featured Homepage placement (1 active listing)',
      'Custom Creator Banner',
      'In-App Ticket Sales — 5% fee',
      'Priority Customer Support',
    ],
  },
];

// ─── Boost Packages ───────────────────────────────────────────────────────────
export interface BoostPackage {
  id: string;
  label: string;
  duration: string;      // display text
  days: number;          // 0 for until_event_end
  price: number;         // USD full price
  description: string;
  popular?: boolean;
  bestExposure?: boolean;
  appleProductId?: string;   // Apple IAP consumable product ID (iOS)
  googleProductId?: string;  // Google Play consumable product ID (Android)
}

export const BOOST_PACKAGES: BoostPackage[] = [
  {
    id: 'three_day',
    label: '3-Day Boost',
    duration: '3 days',
    days: 3,
    price: 1.99,
    description: 'Perfect for last-minute promotion',
    appleProductId:  'com.vybzhub.boost.three_day',
    googleProductId: 'com.vybzhub.boost.three_day',
  },
  {
    id: 'seven_day',
    label: '7-Day Boost',
    duration: '7 days',
    days: 7,
    price: 3.99,
    description: 'Best value for most events',
    popular: true,
    appleProductId:  'com.vybzhub.boost.seven_day',
    googleProductId: 'com.vybzhub.boost.seven_day',
  },
  {
    id: 'until_event_end',
    label: 'Until Event Ends',
    duration: 'Until event ends',
    days: 0,
    price: 6.99,
    description: 'Maximum visibility until your event finishes',
    bestExposure: true,
    appleProductId:  'com.vybzhub.boost.until_event_end',
    googleProductId: 'com.vybzhub.boost.until_event_end',
  },
];

// ─── Parishes ─────────────────────────────────────────────────────────────────
// Re-exported from constants/parishes.ts for backward compatibility.
// New code should import directly from constants/parishes.ts.
export { JAMAICA_PARISHES as PARISHES } from './parishes';

// ─── Event Types (12 categories) ──────────────────────────────────────────────
export const EVENT_TYPES = [
  { id: 'party',         label: 'Parties/Fetes',          icon: 'local-bar',    color: '#FF6B35' },
  { id: 'all-inclusive', label: 'All-Inclusive Events',   icon: 'celebration',  color: '#E91E63' },
  { id: 'dancehall',     label: 'Dancehall/Sound System', icon: 'speaker',      color: '#FF9800' },
  { id: 'beach',         label: 'Beach Parties',          icon: 'beach-access', color: '#00BCD4' },
  { id: 'club',          label: 'Club Nights',            icon: 'nightlife',    color: '#9C27B0' },
  { id: 'concert',       label: 'Concerts & Live',        icon: 'mic',          color: '#5C6BC0' },
  { id: 'carnival',      label: 'Carnival & Road March',  icon: 'flag',         color: '#F44336' },
  { id: 'culture',       label: 'Cultural & Heritage',    icon: 'museum',       color: '#27AE60' },
  { id: 'community',     label: 'Community & Church',     icon: 'people',       color: '#00897B' },
  { id: 'sporting',      label: 'Sporting Events',        icon: 'emoji-events', color: '#1565C0' },
  { id: 'corporate',     label: 'Corporate & Networking', icon: 'work',         color: '#607D8B' },
  { id: 'private',       label: 'Private/Members-Only',   icon: 'lock',         color: '#795548' },
];

// ─── Type colour lookup ────────────────────────────────────────────────────────
export const TYPE_COLORS: Record<string, string> = {
  'party':         '#FF6B35',
  'all-inclusive': '#E91E63',
  'dancehall':     '#FF9800',
  'beach':         '#00BCD4',
  'club':          '#9C27B0',
  'concert':       '#5C6BC0',
  'carnival':      '#F44336',
  'culture':       '#27AE60',
  'community':     '#00897B',
  'sporting':      '#1565C0',
  'corporate':     '#607D8B',
  'private':       '#795548',
};

export const RECURRING_OPTIONS = ['Weekly', 'Bi-Weekly', 'Monthly'];

// ─── Helpers ───────────────────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  // Construct as a local date to avoid UTC midnight rolling back one day in UTC-offset timezones
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-JM', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

// ─── Jamaica Timezone Helpers (UTC-5, no DST) ────────────────────────────────
// Jamaica always runs at UTC-5 with no daylight saving time.
const JAMAICA_OFFSET_MS = 5 * 60 * 60 * 1000;

function getJamaicaMs(): number {
  return Date.now() - JAMAICA_OFFSET_MS;
}

function jamaicaDateParts(utcMs: number): { y: number; m: number; d: number } {
  const dt = new Date(utcMs);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

export function isToday(dateStr: string): boolean {
  const { y, m, d } = jamaicaDateParts(getJamaicaMs());
  const [ey, em, ed] = dateStr.split('-').map(Number);
  return ey === y && em === m + 1 && ed === d;
}

// An event is NOT "past" until 7:00 AM the following day in Jamaica time.
// Events often run until early morning — this prevents Aug 3 being marked
// passed until Aug 4 at 7:00 AM Jamaica (= 12:00 UTC).
export function isEventPassed(dateStr: string): boolean {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  // Next day 7:00 AM Jamaica = next day 12:00 UTC
  const threshold = Date.UTC(y, m - 1, d + 1, 12, 0, 0);
  return Date.now() > threshold;
}

// Returns true only when the event has an active boost that has not expired by time or event end.
// Combines database-side status check with runtime expiry verification.
// Use this everywhere a boost badge or boost filter is evaluated.
export function isBoostActive(event: Event): boolean {
  if (!event.boosted || event.boostStatus !== 'active') return false;
  if (event.boostType === 'until_event_end') return !isEventPassed(event.date);
  return event.boostExpiresAt ? new Date(event.boostExpiresAt) > new Date() : false;
}

// "This weekend" = the upcoming Saturday + Sunday in Jamaica time.
// On Sunday the current day is included (Saturday was yesterday).
export function isThisWeekend(dateStr: string): boolean {
  const nowMs = getJamaicaMs();
  const now = new Date(nowMs);
  const todayDow = now.getUTCDay(); // 0=Sun ... 6=Sat in Jamaica time

  // Days to reach Saturday (if today is Sun, go back 1 day to this weekend's Sat)
  const daysToSat = todayDow === 0 ? -1 : (6 - todayDow + 7) % 7;

  // Saturday midnight Jamaica = Sat 05:00 UTC
  const satMs = nowMs + daysToSat * 86_400_000;
  const satD = new Date(satMs);
  const satStartUtc = Date.UTC(satD.getUTCFullYear(), satD.getUTCMonth(), satD.getUTCDate(), 5, 0, 0);

  // End of Sunday in Jamaica = Mon 04:59:59 UTC
  const sunMs = satMs + 86_400_000;
  const sunD = new Date(sunMs);
  const sunEndUtc = Date.UTC(sunD.getUTCFullYear(), sunD.getUTCMonth(), sunD.getUTCDate() + 1, 4, 59, 59, 999);

  // Event date midnight Jamaica = event date 05:00 UTC
  const [ey, em, ed] = dateStr.split('-').map(Number);
  const evtUtc = Date.UTC(ey, em - 1, ed, 5, 0, 0);

  return evtUtc >= satStartUtc && evtUtc <= sunEndUtc;
}
