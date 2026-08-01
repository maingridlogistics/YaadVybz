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
  {
    id: '1',
    title: 'Summa Splash 2026',
    description: "Jamaica's hottest beach party returns to Negril! Dance under the stars with the island's top DJs, live performances, and all the vibes you need for the ultimate summer experience. Food, drinks, and unforgettable energy all night long.",
    type: 'beach',
    typeLabel: 'Beach Parties',
    eventTypes: ['beach', 'party'],
    parish: 'Westmoreland',
    date: '2026-08-15',
    startTime: '4:00 PM',
    endTime: '4:00 AM',
    venue: 'Bloody Bay Beach',
    address: 'Norman Manley Blvd, Negril',
    coverImage: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80'],
    ticketPrice: 'JMD 3,500',
    ticketLink: 'https://example.com/tickets',
    dressCode: 'Beach Wear',
    ageLimit: '18+',
    lineup: ['Skillibeng', 'Popcaan', 'Masicka', 'DJ Chrome'],
    recurring: false,
    promoterId: 'p1',
    promoterName: 'Island Fete Crew',
    goingCount: 1240,
    interestedCount: 3200,
    featured: true,
    status: 'live',
    boosted: true,
    boostExpiresAt: '2026-08-20T00:00:00.000Z',
    boostImpressions: 4820,
    tags: ['beach', 'summer', 'dancehall', 'negril'],
  },
  {
    id: '2',
    title: 'Reggae Sumfest 2026',
    description: "The world's greatest reggae festival is back at Montego Bay's iconic Catherine Hall. Two nights of non-stop reggae, dancehall, and soca featuring Jamaica's finest alongside international acts. The ultimate festival experience.",
    type: 'concert',
    typeLabel: 'Concerts & Live',
    eventTypes: ['concert', 'dancehall'],
    parish: 'St. James',
    date: '2026-08-20',
    startTime: '6:00 PM',
    endTime: '6:00 AM',
    venue: 'Catherine Hall Entertainment Complex',
    address: 'Catherine Hall, Montego Bay',
    coverImage: 'https://images.unsplash.com/photo-1540575467537-4952d2c7fa62?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1540575467537-4952d2c7fa62?w=800&q=80'],
    ticketPrice: 'JMD 8,000',
    ticketLink: 'https://example.com/tickets',
    dressCode: 'Casual',
    ageLimit: 'All Ages',
    lineup: ['Buju Banton', 'Beenie Man', 'Shaggy', 'Etana', 'Chronixx'],
    recurring: false,
    promoterId: 'p2',
    promoterName: 'Summerfest Productions',
    goingCount: 8500,
    interestedCount: 22000,
    featured: true,
    status: 'live',
    boosted: true,
    boostExpiresAt: '2026-08-22T00:00:00.000Z',
    boostImpressions: 18450,
    tags: ['reggae', 'festival', 'montego-bay', 'international'],
  },
  {
    id: '3',
    title: 'Passa Passa Weddy Weddy',
    description: "Kingston's legendary street dance returns every Wednesday night at Maxfield Park. Experience authentic dancehall culture with the island's best selectors. Pure street vibes, no dress code, just energy.",
    type: 'dancehall',
    typeLabel: 'Dancehall/Sound System',
    eventTypes: ['dancehall', 'party'],
    parish: 'Kingston',
    date: '2026-08-06',
    startTime: '10:00 PM',
    endTime: '5:00 AM',
    venue: 'Maxfield Park',
    address: 'Maxfield Ave, Kingston',
    coverImage: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80'],
    ticketPrice: 'Free',
    ticketLink: '',
    dressCode: 'Street Style',
    ageLimit: '18+',
    lineup: ['Foota Hype', 'DJ Liquid', 'Boom Boom'],
    recurring: true,
    recurringFrequency: 'Weekly',
    promoterId: 'p3',
    promoterName: 'Passa Passa Official',
    goingCount: 2100,
    interestedCount: 4500,
    featured: true,
    status: 'live',
    tags: ['dancehall', 'street-dance', 'kingston', 'weekly'],
  },
  {
    id: '4',
    title: 'Bacchanal Jamaica 2026',
    description: 'Caribbean carnival comes to Kingston! Join thousands in full carnival regalia for the ultimate road march and concert experience. All day, all night, all energy! Costumes, paint, and pure celebration.',
    type: 'carnival',
    typeLabel: 'Carnival & Road March',
    eventTypes: ['carnival', 'party'],
    parish: 'St. Andrew',
    date: '2026-08-22',
    startTime: '2:00 PM',
    endTime: '12:00 AM',
    venue: 'National Stadium',
    address: '22 Arthur Wint Dr, Kingston',
    coverImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80'],
    ticketPrice: 'JMD 5,000',
    ticketLink: 'https://example.com/tickets',
    dressCode: 'Costume/Casual',
    ageLimit: '18+',
    lineup: ['Machel Montano', 'Shal Marshall', 'Mr. Killa', 'Destra Garcia'],
    recurring: false,
    promoterId: 'p4',
    promoterName: 'Bacchanal Jamaica Ltd',
    goingCount: 5200,
    interestedCount: 12000,
    featured: false,
    status: 'live',
    tags: ['carnival', 'soca', 'road-march', 'costume'],
  },
  {
    id: '5',
    title: 'Ocho Rios Jazz Festival',
    description: "World-class jazz meets Caribbean paradise. Three days of smooth sounds by the sea in beautiful Ocho Rios. Featuring international jazz legends alongside Jamaica's top musicians. Elegant, soulful, unforgettable.",
    type: 'concert',
    typeLabel: 'Concerts & Live',
    eventTypes: ['concert', 'culture'],
    parish: 'St. Ann',
    date: '2026-08-28',
    startTime: '5:00 PM',
    endTime: '12:00 AM',
    venue: 'Margaritaville',
    address: 'Main St, Ocho Rios',
    coverImage: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80'],
    ticketPrice: 'JMD 4,500',
    ticketLink: 'https://example.com/tickets',
    dressCode: 'Smart Casual',
    ageLimit: 'All Ages',
    lineup: ['Monty Alexander', 'Dean Fraser', 'Gramps Morgan', 'Tessanne Chin'],
    recurring: false,
    promoterId: 'p5',
    promoterName: 'OCN Events',
    goingCount: 900,
    interestedCount: 2800,
    featured: false,
    status: 'live',
    tags: ['jazz', 'ocho-rios', 'music', 'family-friendly'],
  },
  {
    id: '6',
    title: 'Negril Beach Jouvert',
    description: "Start your morning covered in paint and powder at Negril's most explosive beach jouvert! Right on the sand with the waves as your backdrop. Bring your white outfit and prepare to get soaked.",
    type: 'beach',
    typeLabel: 'Beach Parties',
    eventTypes: ['beach', 'carnival'],
    parish: 'Westmoreland',
    date: '2026-08-21',
    startTime: '4:00 AM',
    endTime: '10:00 AM',
    venue: '7-Mile Beach',
    address: '7 Mile Beach, Negril',
    coverImage: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80'],
    ticketPrice: 'JMD 2,000',
    ticketLink: 'https://example.com/tickets',
    dressCode: 'White Outfit (will get painted)',
    ageLimit: '18+',
    lineup: ['DJ Blaze', 'Selecta Righteous', 'DJ Flex'],
    recurring: false,
    promoterId: 'p4',
    promoterName: 'Bacchanal Jamaica Ltd',
    goingCount: 1800,
    interestedCount: 4100,
    featured: false,
    status: 'live',
    tags: ['jouvert', 'beach', 'paint-party', 'negril'],
  },
  {
    id: '7',
    title: 'Tasteful Thursday Kingston',
    description: "Every Thursday Kingston's food scene comes alive. Sample dishes from Jamaica's hottest street chefs, craft cocktails from local mixologists, and live acoustic performances in a vibrant open-air setting at Emancipation Park.",
    type: 'culture',
    typeLabel: 'Cultural & Heritage',
    eventTypes: ['culture', 'community'],
    parish: 'Kingston',
    date: '2026-08-08',
    startTime: '5:00 PM',
    endTime: '11:00 PM',
    venue: 'Emancipation Park',
    address: 'Knutsford Blvd, New Kingston',
    coverImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80'],
    ticketPrice: 'Free Entry',
    ticketLink: '',
    dressCode: 'Casual',
    ageLimit: 'All Ages',
    lineup: ['Chef Irie', 'The Yard Eats Collective'],
    recurring: true,
    recurringFrequency: 'Weekly',
    promoterId: 'p6',
    promoterName: 'Kingston Food Scene',
    goingCount: 450,
    interestedCount: 1200,
    featured: false,
    status: 'live',
    tags: ['food', 'culture', 'weekly', 'new-kingston'],
  },
  {
    id: '8',
    title: 'Ting Fling MoBay',
    description: "Montego Bay's biggest all-inclusive Saturday fete is back! Unlimited premium drinks, gourmet food stations, and non-stop music from Jamaica's hottest DJs in a stunning beachfront venue. One price, unlimited everything.",
    type: 'all-inclusive',
    typeLabel: 'All-Inclusive Events',
    eventTypes: ['all-inclusive', 'beach'],
    parish: 'St. James',
    date: '2026-08-08',
    startTime: '1:00 PM',
    endTime: '9:00 PM',
    venue: 'Iberostar Rose Hall Beach',
    address: 'Rose Hall, Montego Bay',
    coverImage: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80'],
    ticketPrice: 'JMD 12,000',
    ticketLink: 'https://example.com/tickets',
    dressCode: 'Beach Party Wear',
    ageLimit: '21+',
    lineup: ['DJ Norie', 'Selecta Kemar', 'Live Soca Act'],
    recurring: false,
    promoterId: 'p7',
    promoterName: 'Island Vybz Productions',
    goingCount: 680,
    interestedCount: 2300,
    featured: false,
    status: 'live',
    tags: ['all-inclusive', 'mobay', 'fete', 'beachfront'],
  },
  {
    id: '9',
    title: 'Blue Lagoon Summer Splash',
    description: "Experience Port Antonio's magical Blue Lagoon like never before. Day party meets nature in this exclusive intimate event surrounded by lush rainforest and crystal-clear waters. Limited tickets available.",
    type: 'beach',
    typeLabel: 'Beach Parties',
    eventTypes: ['beach', 'party'],
    parish: 'Portland',
    date: '2026-08-16',
    startTime: '12:00 PM',
    endTime: '8:00 PM',
    venue: 'Blue Lagoon',
    address: 'Blue Lagoon, Port Antonio',
    coverImage: 'https://images.unsplash.com/photo-1571019613914-85f342c6a11e?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1571019613914-85f342c6a11e?w=800&q=80'],
    ticketPrice: 'JMD 6,000',
    ticketLink: 'https://example.com/tickets',
    dressCode: 'Swimwear',
    ageLimit: '18+',
    lineup: ['DJ Khrome', 'Selecta Massive'],
    recurring: false,
    promoterId: 'p8',
    promoterName: 'Portland Vibes',
    goingCount: 320,
    interestedCount: 980,
    featured: false,
    status: 'live',
    tags: ['portland', 'blue-lagoon', 'nature', 'exclusive'],
  },
  {
    id: '10',
    title: 'Mandeville Food & Culture Festival',
    description: "Manchester's premier cultural celebration showcasing the best of Jamaican cuisine, art, music, and heritage. Three days of family fun in the cool mountain city. Local artisans, street food champions, and live cultural performances.",
    type: 'culture',
    typeLabel: 'Cultural & Heritage',
    eventTypes: ['culture', 'community'],
    parish: 'Manchester',
    date: '2026-09-05',
    startTime: '10:00 AM',
    endTime: '8:00 PM',
    venue: 'Caledonia Sports Complex',
    address: 'Caledonia Rd, Mandeville',
    coverImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80'],
    ticketPrice: 'JMD 1,500',
    ticketLink: 'https://example.com/tickets',
    dressCode: 'Casual',
    ageLimit: 'All Ages',
    lineup: ['Various Local Artists', 'Cultural Performers'],
    recurring: false,
    promoterId: 'p9',
    promoterName: 'Manchester Parish Council',
    goingCount: 1100,
    interestedCount: 3400,
    featured: false,
    status: 'live',
    tags: ['culture', 'family', 'mandeville', 'festival'],
  },
  {
    id: '11',
    title: 'Road To Sumfest Block Party',
    description: "The official pre-Sumfest block party right in the heart of Montego Bay. Street food, local craft vendors, and a massive sound system clash featuring Jamaica's legendary selectors. Free entry, all vibes.",
    type: 'party',
    typeLabel: 'Parties/Fetes',
    eventTypes: ['party', 'dancehall'],
    parish: 'St. James',
    date: '2026-08-18',
    startTime: '6:00 PM',
    endTime: '2:00 AM',
    venue: 'Gloucester Ave',
    address: 'Hip Strip, Montego Bay',
    coverImage: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80'],
    ticketPrice: 'Free',
    ticketLink: '',
    dressCode: 'Casual',
    ageLimit: 'All Ages',
    lineup: ['Sound System Clash TBA'],
    recurring: false,
    promoterId: 'p2',
    promoterName: 'Summerfest Productions',
    goingCount: 2400,
    interestedCount: 5600,
    featured: false,
    status: 'live',
    tags: ['block-party', 'sound-clash', 'mobay', 'free'],
  },
  {
    id: '12',
    title: 'Ocho Rios Harbour Night',
    description: "Every Wednesday the Ocho Rios waterfront transforms into a vibrant street fair. Local food, craft, art, and live entertainment celebrating Jamaica's rich culture by the sea. Free and family-friendly.",
    type: 'culture',
    typeLabel: 'Cultural & Heritage',
    eventTypes: ['culture', 'community'],
    parish: 'St. Ann',
    date: '2026-08-12',
    startTime: '5:00 PM',
    endTime: '10:00 PM',
    venue: 'Ocho Rios Waterfront',
    address: 'Main St, Ocho Rios',
    coverImage: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    flyerImages: ['https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80'],
    ticketPrice: 'Free',
    ticketLink: '',
    dressCode: 'Casual',
    ageLimit: 'All Ages',
    lineup: ['Local Vendors and Performers'],
    recurring: true,
    recurringFrequency: 'Weekly',
    promoterId: 'p5',
    promoterName: 'OCN Events',
    goingCount: 780,
    interestedCount: 1900,
    featured: false,
    status: 'live',
    tags: ['ocho-rios', 'weekly', 'craft', 'waterfront'],
  },
];

// ─── Mock Promoter Social Links ───────────────────────────────────────────────
export const MOCK_PROMOTER_SOCIALS: Record<string, { verified: boolean; bio: string; socialLinks: SocialLinks; followerCount: number }> = {
  'p1': {
    verified: true,
    bio: 'Jamaica island fete specialists. Creating unforgettable beach experiences across Negril and the south coast since 2014.',
    followerCount: 8400,
    socialLinks: { instagram: 'islandfetecrew', facebook: 'IslandFeteCrew', tiktok: 'islandfete' },
  },
  'p2': {
    verified: true,
    bio: "Summerfest Productions is the home of Reggae Sumfest, the world's greatest reggae festival. Based in Montego Bay.",
    followerCount: 42000,
    socialLinks: { instagram: 'reggaesumfest', facebook: 'SummerfestProductions', twitter: 'SumfestJA', website: 'https://reggaesumfest.com' },
  },
  'p3': {
    verified: true,
    bio: 'Passa Passa Official. Authentic Kingston street dance, every Wednesday at Maxfield Park. The original.',
    followerCount: 18200,
    socialLinks: { instagram: 'passapassaofficial', tiktok: 'passapassa_jm' },
  },
  'p4': {
    verified: true,
    bio: 'Bacchanal Jamaica. Caribbean Carnival at its finest. Jouvert, road march, and the biggest fetes on the island.',
    followerCount: 31500,
    socialLinks: { instagram: 'bacchanaljm', facebook: 'BacchanaalJamaica', twitter: 'BacchanaalJA' },
  },
  'p5': {
    verified: false,
    bio: 'OCN Events — Ocho Rios event specialists. Bringing culture, music, and vibes to St. Ann.',
    followerCount: 3800,
    socialLinks: { instagram: 'ocnevents_ja', facebook: 'OCNEventsJamaica' },
  },
  'p6': {
    verified: false,
    bio: 'Kingston Food Scene — Celebrating Jamaican food culture, every Thursday at Emancipation Park.',
    followerCount: 6200,
    socialLinks: { instagram: 'kingstonfoodscene', tiktok: 'kingstonfood' },
  },
  'p7': {
    verified: false,
    bio: 'Island Vybz Productions. All-inclusive specialists in Montego Bay and beyond.',
    followerCount: 2900,
    socialLinks: { instagram: 'islandvybz_ja' },
  },
  'p8': {
    verified: false,
    bio: "Portland Vibes. Bringing exclusive day events to Jamaica's most beautiful parish.",
    followerCount: 1400,
    socialLinks: { instagram: 'portlandvibes_ja' },
  },
  'p9': {
    verified: true,
    bio: 'Manchester Parish Council official events page. Celebrating community and culture in Mandeville.',
    followerCount: 5100,
    socialLinks: { facebook: 'ManchesterParishCouncilJA', website: 'https://manchesterjm.gov.jm' },
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-JM', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}
