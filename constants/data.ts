
// Yaad Vybz — Data Types & Mock Data

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  tiktok?: string;
  website?: string;
}

export type SubscriptionTier = 'free' | 'pro' | 'elite';

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  homeParish: string;
  preferredParishes?: string[];  // multi-parish preferences, editable from profile
  interests: string[];
  roles: ('attendee' | 'promoter' | 'admin')[];
  followersCount: number;
  eventsPosted: number;
  joinedAt: string;
  bio?: string;
  socialLinks?: SocialLinks;
  verified?: boolean;            // promoter verified badge
  subscriptionTier?: SubscriptionTier; // monetization plan
  subscriptionExpiresAt?: string;      // ISO date when plan expires
  // Supabase-persisted fields
  followedPromoters: string[];         // promoter IDs this user follows
  requireEventApproval: boolean;       // admin: require event approval before going live
  emailNotifNewParish: boolean;        // email pref: new events in preferred parishes
  emailNotifNewPromoter: boolean;      // email pref: events from followed promoters
  emailNotifEventChange: boolean;      // email pref: event updates & cancellations
  emailNotifEventReminder: boolean;    // email pref: event day reminders
}

export type EventStatus = 'pending' | 'live' | 'rejected' | 'flagged';

export type NotificationType =
  | 'new_event_parish'     // new event in preferred parish
  | 'new_event_promoter'   // new event from followed promoter
  | 'event_reminder'       // day-of or 1-hr before reminder
  | 'event_change'         // event time/details changed
  | 'event_cancelled'      // event cancelled
  | 'event_approved'       // admin approved your event
  | 'event_rejected'       // admin rejected your event
  | 'new_follower';        // someone followed you

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
  lineup: string[];
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
  // ── Boost / Monetization ──
  boosted?: boolean;          // currently boosted (paid placement)
  boostExpiresAt?: string;    // ISO date when boost expires
  boostImpressions?: number;  // tracked boost view count
  // ── Ticket Sales ──
  sellingTicketsInApp?: boolean; // using in-app ticket sales
  ticketCommissionPct?: number;  // commission % (default 5)
  ticketsSold?: number;          // tickets sold via app
}

// ─── Subscription Plans ───────────────────────────────────────────────────────
export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  priceMonthly: number;      // USD
  priceYearly: number;       // USD/yr
  color: string;
  icon: string;
  features: string[];
  highlight?: string;        // badge text e.g. "Most Popular"
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: 'free',
    name: 'Free',
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
    name: 'Promoter Pro',
    priceMonthly: 9.99,
    priceYearly: 89.99,
    color: '#FFD700',
    icon: 'campaign',
    highlight: 'Most Popular',
    features: [
      'Unlimited event posts',
      'Verified promoter badge',
      'Event analytics dashboard',
      '1 free boost per month',
      'Priority in search results',
      'Promoter profile page',
    ],
  },
  {
    tier: 'elite',
    name: 'Elite',
    priceMonthly: 24.99,
    priceYearly: 219.99,
    color: '#E91E63',
    icon: 'star',
    highlight: 'Best Value',
    features: [
      'Everything in Promoter Pro',
      '5 free boosts per month',
      'Featured homepage placement',
      'In-app ticket sales (5% fee)',
      'Priority customer support',
      'Advanced analytics & exports',
      'Custom promoter banner',
    ],
  },
];

// ─── Boost Packages ───────────────────────────────────────────────────────────
export interface BoostPackage {
  id: string;
  label: string;
  duration: string;      // display text
  days: number;
  price: number;         // USD
  description: string;
  popular?: boolean;
}

export const BOOST_PACKAGES: BoostPackage[] = [
  {
    id: 'boost_3',
    label: '3-Day Boost',
    duration: '3 days',
    days: 3,
    price: 2.99,
    description: 'Perfect for upcoming weekend events',
  },
  {
    id: 'boost_7',
    label: '7-Day Boost',
    duration: '1 week',
    days: 7,
    price: 4.99,
    description: 'Maximum reach for major events',
    popular: true,
  },
  {
    id: 'boost_14',
    label: '14-Day Boost',
    duration: '2 weeks',
    days: 14,
    price: 7.99,
    description: 'Best for festivals & recurring events',
  },
];

// ─── Mock Banner Ads (local Jamaican businesses) ──────────────────────────────
export interface BannerAd {
  id: string;
  businessName: string;
  tagline: string;
  imageUri: string;
  ctaLabel: string;
  ctaUrl: string;
  accentColor: string;
}

export const MOCK_ADS: BannerAd[] = [
  {
    id: 'ad1',
    businessName: 'Appleton Estate',
    tagline: "Jamaica's finest rum — taste the island.",
    imageUri: 'https://images.unsplash.com/photo-1609951651556-5334e2706168?w=600&q=80',
    ctaLabel: 'Shop Now',
    ctaUrl: 'https://appletonestate.com',
    accentColor: '#D4A017',
  },
  {
    id: 'ad2',
    businessName: 'Digicel Jamaica',
    tagline: 'Stay connected all night long. Unlimited data from $499/month.',
    imageUri: 'https://images.unsplash.com/photo-1555421689-491a97ff2040?w=600&q=80',
    ctaLabel: 'Get a Plan',
    ctaUrl: 'https://digiceljamaica.com',
    accentColor: '#E30613',
  },
  {
    id: 'ad3',
    businessName: 'Island Car Rentals',
    tagline: 'Travel the island in style. Pick up from any parish.',
    imageUri: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&q=80',
    ctaLabel: 'Book Now',
    ctaUrl: 'https://islandcarrentals.com',
    accentColor: '#007A33',
  },
  {
    id: 'ad4',
    businessName: 'NCB Financial Group',
    tagline: 'Fast, easy payments for every event. Download the NCB app.',
    imageUri: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&q=80',
    ctaLabel: 'Learn More',
    ctaUrl: 'https://jncb.com',
    accentColor: '#1565C0',
  },
  {
    id: 'ad5',
    businessName: 'Red Stripe Beer',
    tagline: 'Cool off at the best parties with Jamaica\'s original beer.',
    imageUri: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&q=80',
    ctaLabel: 'Find Near You',
    ctaUrl: 'https://redstripebeer.com',
    accentColor: '#CC0001',
  },
];

// ─── Parishes (user-specified order) ──────────────────────────────────────────
export const PARISHES = [
  'Kingston',
  'St. Andrew',
  'St. Catherine',
  'Clarendon',
  'Manchester',
  'St. Elizabeth',
  'Westmoreland',
  'Hanover',
  'St. James',
  'Trelawny',
  'St. Ann',
  'St. Mary',
  'Portland',
  'St. Thomas',
];

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

// ─── Mock Events ──────────────────────────────────────────────────────────────
export const MOCK_EVENTS: Event[] = [
  // Empty — events are created by promoters via the Post tab
  // The original code had a duplicate opening brace here, causing a syntax error.
  // Removed the extra '{' to fix.
  {
    id: 'placeholder_never_shown',
    title: '',
    description: '',
    type: '',
    typeLabel: '',
    eventTypes: [],
    parish: '',
    date: '',
    startTime: '',
    endTime: '',
    venue: '',
    address: '',
    coverImage: '',
    flyerImages: [],
    ticketPrice: '',
    ticketLink: '',
    ageLimit: '',
    lineup: [],
    recurring: false,
    promoterId: '',
    promoterName: '',
    goingCount: 0,
    interestedCount: 0,
    featured: false,
    status: 'rejected' as EventStatus, // never shown
    tags: [],
  },
];

// ─── Mock Promoter Social Links ───────────────────────────────────────────────
export const MOCK_PROMOTER_SOCIALS: Record<string, { verified: boolean; bio: string; socialLinks: SocialLinks; followerCount: number }> = {};

// ─── Helpers ───────────────────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-JM', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}
