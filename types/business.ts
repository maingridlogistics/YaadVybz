// ─── Vybz Hub — Business Directory Types ──────────────────────────────────────

export type BusinessStatus = 'pending' | 'live' | 'rejected' | 'flagged';
export type RevisionStatus = 'pending' | 'approved' | 'rejected';

export interface BusinessCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DayHours {
  closed: boolean;
  open: string;   // "09:00"
  close: string;  // "17:00"
}

export type WeeklyHours = {
  monday:    DayHours;
  tuesday:   DayHours;
  wednesday: DayHours;
  thursday:  DayHours;
  friday:    DayHours;
  saturday:  DayHours;
  sunday:    DayHours;
};

export const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DayName = typeof DAY_NAMES[number];

export const DAY_LABELS: Record<DayName, string> = {
  monday:    'Monday',
  tuesday:   'Tuesday',
  wednesday: 'Wednesday',
  thursday:  'Thursday',
  friday:    'Friday',
  saturday:  'Saturday',
  sunday:    'Sunday',
};

export const DEFAULT_WEEK_HOURS: WeeklyHours = {
  monday:    { closed: false, open: '09:00', close: '17:00' },
  tuesday:   { closed: false, open: '09:00', close: '17:00' },
  wednesday: { closed: false, open: '09:00', close: '17:00' },
  thursday:  { closed: false, open: '09:00', close: '17:00' },
  friday:    { closed: false, open: '09:00', close: '17:00' },
  saturday:  { closed: false, open: '09:00', close: '14:00' },
  sunday:    { closed: true,  open: '10:00', close: '14:00' },
};

export interface BusinessLocation {
  id: string;
  businessId: string;
  ownerId: string;
  branchName: string;
  parish: string;
  address: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  phone: string;
  whatsapp: string;
  email: string;
  openingHours: WeeklyHours;
  notes?: string;
  isPrimary: boolean;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BusinessService {
  id: string;
  businessId: string;
  ownerId: string;
  name: string;
  description: string;
  startingPrice?: string;
  imageUrl?: string;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
}

export interface BusinessPromotion {
  id: string;
  businessId: string;
  ownerId: string;
  title: string;
  description: string;
  imageUrl?: string;
  promoCode?: string;
  startDate: string;   // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD
  active: boolean;
  status: 'live' | 'flagged' | 'rejected';
  createdAt?: string;
  updatedAt?: string;
}

export interface BusinessRevision {
  id: string;
  businessId: string;
  ownerId: string;
  revisionData: Partial<BusinessData>;
  status: RevisionStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface BusinessAnalyticsEvent {
  businessId: string;
  eventType:
    | 'profile_view'
    | 'phone_click'
    | 'whatsapp_click'
    | 'email_click'
    | 'website_click'
    | 'directions_click'
    | 'promotion_view'
    | 'business_event_view';
  locationId?: string;
  promotionId?: string;
  sessionId?: string;
}

/** The editable fields of a business (used in creation wizard & revisions) */
export interface BusinessData {
  name: string;
  categoryId: string;
  secondaryCategoryIds: string[];
  description: string;
  logoUrl: string;
  coverUrl: string;
  galleryUrls: string[];
  featuredImageUrl: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  otherSocialLinks: Record<string, string>;
  priceRange: string;
}

export interface Business extends BusinessData {
  id: string;
  ownerId: string;
  slug?: string;
  status: BusinessStatus;
  flagReason?: string;
  rejectedReason?: string;
  approvedAt?: string;
  approvedBy?: string;
  pendingRevisionId?: string;
  featured: boolean;
  featuredPriority: number;
  verified: boolean;
  viewCount: number;
  phoneClickCount: number;
  whatsappClickCount: number;
  emailClickCount: number;
  websiteClickCount: number;
  directionsClickCount: number;
  createdAt: string;
  updatedAt: string;
  // Joined data (optional — present when fetched with relations)
  category?: BusinessCategory;
  locations?: BusinessLocation[];
  services?: BusinessService[];
  promotions?: BusinessPromotion[];
}

// ─── Price range labels ───────────────────────────────────────────────────────
export const PRICE_RANGES = [
  { value: '$',    label: '$ · Budget-friendly' },
  { value: '$$',   label: '$$ · Moderate' },
  { value: '$$$',  label: '$$$ · Upscale' },
  { value: '$$$$', label: '$$$$ · Premium' },
];

// ─── Jamaica time helpers for hours display ───────────────────────────────────
// Jamaica is UTC-5 with no DST
const JM_OFFSET_MS = 5 * 60 * 60 * 1000;

function jamaicaNow(): Date {
  return new Date(Date.now() - JM_OFFSET_MS);
}

export type HoursStatus =
  | { type: 'open';      closesAt: string }
  | { type: 'closed';    opensAt?: string }
  | { type: 'no_hours' };

export function getLocationHoursStatus(hours: WeeklyHours | null | undefined): HoursStatus {
  if (!hours) return { type: 'no_hours' };
  const now = jamaicaNow();
  const dayIndex = now.getUTCDay(); // 0=Sun…6=Sat in Jamaica time
  const jmDays: DayName[] = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const todayKey = jmDays[dayIndex];
  const todayH = hours[todayKey];
  if (!todayH || todayH.closed) {
    // Find next open day
    for (let d = 1; d <= 7; d++) {
      const nextKey = jmDays[(dayIndex + d) % 7];
      const nextH = hours[nextKey];
      if (nextH && !nextH.closed) {
        return { type: 'closed', opensAt: `${DAY_LABELS[nextKey]} ${nextH.open}` };
      }
    }
    return { type: 'closed' };
  }

  // Parse open/close times
  const [openH, openM] = todayH.open.split(':').map(Number);
  const [closeH, closeM] = todayH.close.split(':').map(Number);
  const nowH = now.getUTCHours();
  const nowM = now.getUTCMinutes();
  const nowMins = nowH * 60 + nowM;
  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;

  if (nowMins >= openMins && nowMins < closeMins) {
    return { type: 'open', closesAt: todayH.close };
  }
  if (nowMins < openMins) {
    return { type: 'closed', opensAt: todayH.open };
  }
  // After closing — find tomorrow
  for (let d = 1; d <= 7; d++) {
    const nextKey = jmDays[(dayIndex + d) % 7];
    const nextH = hours[nextKey];
    if (nextH && !nextH.closed) {
      return { type: 'closed', opensAt: `${DAY_LABELS[nextKey]} ${nextH.open}` };
    }
  }
  return { type: 'closed' };
}
