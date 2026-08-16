// ─── Business Categories — Local Constants ────────────────────────────────────
// Mirrors the business_categories DB seed data.
// Used for icon/color lookups when category data is already loaded,
// and as a fallback when the DB is unreachable.
// The DATABASE is the authoritative source — these constants are read-only UI metadata.

export interface BusinessCategoryItem {
  id?: string; // Set after DB fetch
  slug: string;
  label: string;
  icon: string; // MaterialIcons name
  color: string; // Hex accent color
  sortOrder: number;
}

export const BUSINESS_CATEGORY_SEEDS: BusinessCategoryItem[] = [
  { slug: 'restaurant',        label: 'Restaurants & Food',     icon: 'restaurant',            color: '#FF6B35', sortOrder: 1  },
  { slug: 'bar-nightlife',     label: 'Bars & Nightlife',        icon: 'local-bar',             color: '#9C27B0', sortOrder: 2  },
  { slug: 'barber',            label: 'Barbers',                 icon: 'content-cut',           color: '#FFD700', sortOrder: 3  },
  { slug: 'beauty-hair',       label: 'Beauty & Hair',           icon: 'face',                  color: '#E91E63', sortOrder: 4  },
  { slug: 'automotive',        label: 'Automotive',              icon: 'directions-car',        color: '#607D8B', sortOrder: 5  },
  { slug: 'hotel',             label: 'Hotels & Accommodation',  icon: 'hotel',                 color: '#00BCD4', sortOrder: 6  },
  { slug: 'shopping',          label: 'Shopping',                icon: 'shopping-bag',          color: '#FF9800', sortOrder: 7  },
  { slug: 'professional',      label: 'Professional Services',   icon: 'work',                  color: '#3F51B5', sortOrder: 8  },
  { slug: 'home-services',     label: 'Home Services',           icon: 'home-repair-service',   color: '#795548', sortOrder: 9  },
  { slug: 'transportation',    label: 'Transportation',          icon: 'local-taxi',            color: '#00897B', sortOrder: 10 },
  { slug: 'health-wellness',   label: 'Health & Wellness',       icon: 'local-hospital',        color: '#4CAF50', sortOrder: 11 },
  { slug: 'entertainment',     label: 'Entertainment',           icon: 'local-movies',          color: '#F44336', sortOrder: 12 },
  { slug: 'photography-media', label: 'Photography & Media',     icon: 'camera-alt',            color: '#5C6BC0', sortOrder: 13 },
  { slug: 'event-services',    label: 'Event Services',          icon: 'celebration',           color: '#FF5722', sortOrder: 14 },
  { slug: 'cleaning',          label: 'Cleaning Services',       icon: 'cleaning-services',     color: '#80CBC4', sortOrder: 15 },
  { slug: 'construction',      label: 'Construction & Trades',   icon: 'construction',          color: '#A1887F', sortOrder: 16 },
  { slug: 'technology',        label: 'Technology',              icon: 'computer',              color: '#29B6F6', sortOrder: 17 },
  { slug: 'education',         label: 'Education',               icon: 'school',                color: '#66BB6A', sortOrder: 18 },
  { slug: 'fitness',           label: 'Fitness',                 icon: 'fitness-center',        color: '#EF5350', sortOrder: 19 },
  { slug: 'sound-system',      label: 'Sound System Hire',       icon: 'speaker',               color: '#AB47BC', sortOrder: 20 },
  { slug: 'catering',          label: 'Catering',                icon: 'set-meal',              color: '#26A69A', sortOrder: 21 },
  { slug: 'other',             label: 'Other',                   icon: 'category',              color: '#78909C', sortOrder: 22 },
];

/** Lookup icon + color by slug — fast O(1) map built once. */
const SLUG_MAP = new Map(BUSINESS_CATEGORY_SEEDS.map((c) => [c.slug, c]));

export function getCategoryMeta(slug: string): Pick<BusinessCategoryItem, 'icon' | 'color'> {
  const found = SLUG_MAP.get(slug);
  return found
    ? { icon: found.icon, color: found.color }
    : { icon: 'category', color: '#78909C' };
}
