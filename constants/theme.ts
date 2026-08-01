// Yaad Vybz — Design System Tokens
// Physical Metaphor: Stage (dark base, gold emphasis, layered depth)

export const Colors = {
  // Base
  background: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1C1C1C',
  surfaceBorder: '#2A2A2A',

  // Brand
  gold: '#FFD700',
  goldDim: '#B8A000',
  goldSurface: '#1A1700',
  green: '#007A33',
  greenLight: '#00A846',
  greenSurface: '#001A0D',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#AAAAAA',
  textMuted: '#666666',
  textOnGold: '#0A0A0A',

  // Semantic
  success: '#00C853',
  error: '#FF4444',
  warning: '#FFD700',
  info: '#2196F3',

  // Overlay
  overlay: 'rgba(0,0,0,0.7)',
  overlayLight: 'rgba(0,0,0,0.4)',
};

export const Typography = {
  // Sizes
  xs: 11,
  sm: 13,
  base: 16,
  md: 18,
  lg: 20,
  xl: 24,
  xxl: 28,
  xxxl: 34,

  // Weights
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,
};

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

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const Shadows = {
  gold: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
};
