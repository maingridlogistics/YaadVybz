// components/ui/index.ts
// Stage 4 — Central export for all shared UI components.

// Legacy components (keep for backward compat with existing screens)
export { Button } from './Button';
export { Badge } from './Badge';
export { BannerAdCard } from './BannerAd';
export { PlacementAd } from './PlacementAd';
export { WeatherWidget } from './WeatherWidget';
export { SafeQRCode } from './SafeQRCode';
export { ParishSelector } from './ParishSelector';
export { PhoneInput, parseE164, validatePhone, toE164, formatNationalDisplay } from './PhoneInput';

// Stage 4 — New light-theme design system components
export { AppButton } from './AppButton';
export type { ButtonVariant, ButtonSize } from './AppButton';

export { AppInput } from './AppInput';

export { AppCard, StatCard, ActionCard } from './AppCard';

export { MenuRow, MenuSection } from './MenuRow';

export { AppBadge } from './AppBadge';
export type { BadgeVariant, BadgeSize } from './AppBadge';

export { AppAvatar } from './AppAvatar';
export type { AvatarSize } from './AppAvatar';

export { AppScreen, AppScreenHeader } from './AppScreen';

export { EmptyState } from './EmptyState';

export { LoadingState, SkeletonBlock, SkeletonCard, SkeletonRow } from './LoadingState';

export { ErrorState, InlineError, ErrorBanner } from './ErrorState';

export { ConfirmModal, InfoModal } from './ConfirmModal';

export { Section, Divider } from './Section';
