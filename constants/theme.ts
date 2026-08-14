// Vybz Hub — Design System Tokens
// Stage 4: Light Theme Foundation
// Physical Metaphor: Stage (warm light base, pink/magenta energy, gold premium accents)

// ─── LIGHT THEME PALETTE ─────────────────────────────────────────────────────

export const Colors = {
  // ── Base surfaces ──────────────────────────────────────────────────────────
  background: '#F7F5F2',           // Soft warm off-white — never harsh pure white
  surface: '#FFFFFF',              // Cards, sheets, elevated panels
  surfaceSecondary: '#F0EDE9',     // Slightly deeper tint for nested surfaces
  surfaceElevated: '#FAFAF8',      // Barely-there lift
  surfaceBorder: '#E8E4DF',        // Subtle neutral dividers
  surfaceOverlay: 'rgba(0,0,0,0.04)', // Hover/pressed state overlay

  // ── Brand — Pink/Magenta primary ──────────────────────────────────────────
  primary: '#E91E8C',              // Vybz Hub pink — CTAs, active nav, highlights
  primaryDark: '#C0176F',          // Pressed/active state
  primaryLight: '#F06ABC',         // Softer tint for chips/tags
  primarySoft: '#FDE8F3',          // Very light pink for subtle backgrounds
  primaryBorder: '#F2A8D3',        // Border color for pink-tinted surfaces

  // ── Secondary accent — Purple ─────────────────────────────────────────────
  secondary: '#7C3AED',            // Purple — squad, social features
  secondaryLight: '#A78BFA',
  secondarySoft: '#F3EDFF',

  // ── Premium accent — Gold ─────────────────────────────────────────────────
  // Retained for featured / boosted / premium states
  gold: '#F59E0B',                 // Warm amber-gold (lighter, works on white)
  goldDark: '#B45309',             // Pressed gold
  goldSoft: '#FEF3C7',             // Very light gold bg
  goldBorder: '#FCD34D',           // Gold border
  // Legacy aliases (keep for backward compat with existing screens)
  goldDim: '#B45309',
  goldSurface: '#FEF3C7',

  // ── Success — Green ───────────────────────────────────────────────────────
  success: '#059669',
  successLight: '#10B981',
  successSoft: '#ECFDF5',
  successBorder: '#6EE7B7',
  // Legacy aliases
  green: '#059669',
  greenLight: '#10B981',
  greenSurface: '#ECFDF5',

  // ── Error ─────────────────────────────────────────────────────────────────
  error: '#DC2626',
  errorLight: '#EF4444',
  errorSoft: '#FEF2F2',
  errorBorder: '#FCA5A5',

  // ── Warning ───────────────────────────────────────────────────────────────
  warning: '#D97706',
  warningSoft: '#FFFBEB',
  warningBorder: '#FCD34D',

  // ── Info ──────────────────────────────────────────────────────────────────
  info: '#0284C7',
  infoSoft: '#E0F2FE',
  infoBorder: '#7DD3FC',

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary: '#1A1614',          // Near-black charcoal — crisp on white
  textSecondary: '#4B4440',        // Dark warm gray
  textMuted: '#9B928A',            // Medium gray for captions/helpers
  textDisabled: '#C4BDBA',         // Clearly disabled
  textOnPrimary: '#FFFFFF',        // White on pink
  textOnGold: '#1A1614',           // Dark on gold (preserved for legacy compatibility)
  textInverse: '#FFFFFF',          // White for dark surfaces

  // ── Overlay / scrim ───────────────────────────────────────────────────────
  overlay: 'rgba(26,22,20,0.6)',
  overlayLight: 'rgba(26,22,20,0.25)',
  overlayStrong: 'rgba(26,22,20,0.8)',

  // ── Disabled ──────────────────────────────────────────────────────────────
  disabled: '#E8E4DF',
  disabledText: '#C4BDBA',

  // ── Navigation ────────────────────────────────────────────────────────────
  tabBarBackground: '#FFFFFF',
  tabBarBorder: '#E8E4DF',
  tabBarActive: '#E91E8C',
  tabBarInactive: '#9B928A',

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: '#EDE9E5',
};

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────

export const Typography = {
  // Sizes (px — using 1.25 scale from 16 base)
  xs: 11,
  sm: 13,
  base: 16,
  md: 18,
  lg: 20,
  xl: 24,
  xxl: 28,
  xxxl: 34,
  display: 40,

  // Semantic aliases
  caption: 11,
  bodySmall: 13,
  body: 16,
  title: 20,
  h3: 20,
  h2: 24,
  h1: 28,

  // Weights
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,

  // Line heights
  lineHeightTight: 1.2,
  lineHeightNormal: 1.5,
  lineHeightRelaxed: 1.7,
};

// ─── SPACING ──────────────────────────────────────────────────────────────────

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// ─── RADIUS ───────────────────────────────────────────────────────────────────

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 999,
  // Semantic aliases
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 24,
  pill: 999,
};

// ─── SHADOWS ──────────────────────────────────────────────────────────────────
// Light-theme appropriate — restrained and clean

export const Shadows = {
  // Subtle card lift
  card: {
    shadowColor: '#1A1614',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  // Modal / sheet
  modal: {
    shadowColor: '#1A1614',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  // Floating button / FAB
  float: {
    shadowColor: '#E91E8C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  // Navigation bar
  tabBar: {
    shadowColor: '#1A1614',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  // Gold premium
  gold: {
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  // Header / top bar
  header: {
    shadowColor: '#1A1614',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
};

// ─── ICON SIZES ───────────────────────────────────────────────────────────────

export const IconSize = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
  xxl: 36,
};

// ─── NAVIGATION TOKENS ────────────────────────────────────────────────────────

export const NavTokens = {
  tabBarBackground: Colors.tabBarBackground,
  tabBarBorder: Colors.tabBarBorder,
  tabBarActive: Colors.tabBarActive,
  tabBarInactive: Colors.tabBarInactive,
  tabBarHeight: 64,
  tabBarLabelSize: 11,
  headerBackground: Colors.surface,
  headerBorder: Colors.surfaceBorder,
  headerTitleSize: Typography.lg,
};
