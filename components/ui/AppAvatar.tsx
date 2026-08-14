// components/ui/AppAvatar.tsx
// Stage 4 — Reusable Avatar component for the light theme design system.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants/theme';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarBadge {
  variant: 'admin' | 'promoter' | 'verified' | 'online';
}

interface AppAvatarProps {
  uri?: string | null;
  initials?: string;
  size?: AvatarSize;
  badge?: AvatarBadge;
  showEditOverlay?: boolean;
  uploading?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const SIZE_MAP: Record<AvatarSize, { container: number; text: number; badge: number; edit: number }> = {
  xs: { container: 28, text: 11, badge: 10, edit: 14 },
  sm: { container: 36, text: 14, badge: 12, edit: 16 },
  md: { container: 48, text: 18, badge: 14, edit: 18 },
  lg: { container: 64, text: 24, badge: 16, edit: 20 },
  xl: { container: 88, text: 32, badge: 18, edit: 22 },
};

const BADGE_COLORS: Record<AvatarBadge['variant'], string> = {
  admin: Colors.primary,
  promoter: Colors.gold,
  verified: Colors.primary,
  online: Colors.success,
};

const BADGE_ICONS: Record<AvatarBadge['variant'], React.ComponentProps<typeof MaterialIcons>['name']> = {
  admin: 'admin-panel-settings',
  promoter: 'campaign',
  verified: 'verified',
  online: 'circle',
};

export function AppAvatar({
  uri,
  initials,
  size = 'md',
  badge,
  showEditOverlay = false,
  uploading = false,
  onPress,
  style,
  accessibilityLabel,
}: AppAvatarProps) {
  const dim = SIZE_MAP[size];
  const radius = dim.container / 2;

  const inner = (
    <View
      style={[
        styles.container,
        {
          width: dim.container,
          height: dim.container,
          borderRadius: radius,
        },
        style,
      ]}
    >
      {/* Image or initials */}
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { borderRadius: radius }]}
          contentFit="cover"
          transition={200}
          accessibilityLabel={accessibilityLabel ?? 'Avatar'}
        />
      ) : (
        <View style={[styles.placeholder, { borderRadius: radius }]}>
          <Text style={[styles.initialsText, { fontSize: dim.text }]}>
            {initials?.slice(0, 2).toUpperCase() ?? '?'}
          </Text>
        </View>
      )}

      {/* Edit overlay */}
      {showEditOverlay ? (
        <View style={[styles.editOverlay, { borderRadius: radius, width: dim.container, height: dim.container }]}>
          {uploading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialIcons name="photo-camera" size={dim.edit} color="#FFFFFF" />
          )}
        </View>
      ) : null}

      {/* Badge */}
      {badge ? (
        <View
          style={[
            styles.badge,
            {
              width: dim.badge + 4,
              height: dim.badge + 4,
              borderRadius: (dim.badge + 4) / 2,
              backgroundColor: BADGE_COLORS[badge.variant],
            },
          ]}
        >
          <MaterialIcons name={BADGE_ICONS[badge.variant]} size={dim.badge} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={accessibilityLabel ?? 'Avatar'}
        accessibilityRole="button"
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        {inner}
      </Pressable>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primaryBorder,
  },
  initialsText: {
    fontWeight: Typography.bold,
    color: Colors.primary,
  },
  editOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
});
