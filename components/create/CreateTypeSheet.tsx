/**
 * CreateTypeSheet
 *
 * Shared bottom-sheet selector shown whenever a general-purpose "Create"
 * action is triggered. Lets the user choose between:
 *   - Promote an Event  → /post (event wizard)
 *   - List a Business   → /business/create (business wizard)
 *
 * Rules:
 *   - Only shown for GENERAL create actions (the + tab button, generic shortcuts).
 *   - Explicitly-labelled buttons ("Create Event", "List Business") route directly.
 *   - Backdrop tap, X button, and Android Back all close the sheet.
 *   - No keyboard involved — no KeyboardAvoidingView needed.
 *   - Safe-area insets respected at the bottom.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectEvent: () => void;
  onSelectBusiness: () => void;
}

export function CreateTypeSheet({ visible, onClose, onSelectEvent, onSelectBusiness }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />

      {/* Sheet */}
      <View style={[styles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Create</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]} hitSlop={12} accessibilityLabel="Close">
            <MaterialIcons name="close" size={20} color={Colors.textPrimary} />
          </Pressable>
        </View>

        <Text style={styles.subtitle}>What would you like to add to Vybz Hub?</Text>

        {/* Event option */}
        <Pressable
          onPress={onSelectEvent}
          style={({ pressed }) => [styles.optionCard, pressed && { opacity: 0.88 }]}
          accessibilityLabel="Promote an Event"
        >
          <LinearGradient
            colors={[Colors.goldSurface, Colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.optionGradient}
          >
            <View style={[styles.optionIconWrap, { backgroundColor: `${Colors.gold}18`, borderColor: `${Colors.gold}33` }]}>
              <MaterialIcons name="campaign" size={28} color={Colors.gold} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Promote an Event</Text>
              <Text style={styles.optionSub}>Create and promote an event on Vybz Hub.</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color={Colors.gold} />
          </LinearGradient>
        </Pressable>

        {/* Business option */}
        <Pressable
          onPress={onSelectBusiness}
          style={({ pressed }) => [styles.optionCard, pressed && { opacity: 0.88 }]}
          accessibilityLabel="List a Business"
        >
          <View style={[styles.optionGradient, styles.optionGradientFlat]}>
            <View style={[styles.optionIconWrap, { backgroundColor: 'rgba(0,188,212,0.1)', borderColor: 'rgba(0,188,212,0.25)' }]}>
              <MaterialIcons name="add-business" size={28} color="#00BCD4" />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: Colors.textPrimary }]}>List a Business</Text>
              <Text style={styles.optionSub}>Add your shop, service, venue, or brand to the business directory.</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color={Colors.textMuted} />
          </View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  subtitle: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: -Spacing.xs,
  },
  optionCard: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  optionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.base,
  },
  optionGradientFlat: {
    backgroundColor: Colors.surfaceElevated,
  },
  optionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  optionText: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.gold,
  },
  optionSub: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },
});
