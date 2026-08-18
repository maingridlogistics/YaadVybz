/**
 * KeyboardSafeSheet
 *
 * A reusable bottom-sheet container for Modal-based forms that need to coexist
 * with the soft keyboard on iOS and Android.
 *
 * Architecture:
 *   Modal
 *   └── root View (flex: 1, justifyContent: flex-end)        ← fills screen
 *       ├── Pressable (absoluteFillObject)                    ← backdrop tap → close
 *       └── KeyboardAvoidingView                              ← lifts sheet when keyboard opens
 *           └── Pressable (sheet surface, stopPropagation)   ← inner tap → Keyboard.dismiss only
 *               └── children                                  ← caller's header + scroll content
 *
 * Why this works:
 *   - Backdrop is absolutely-positioned so its flex:1 does NOT push the sheet offscreen.
 *   - KAV wraps only the sheet — not the backdrop — so it pushes correctly.
 *   - Sheet uses maxHeight to stay within the visible viewport.
 *   - Inner taps dismiss the keyboard but keep the sheet open.
 *   - Outer/backdrop taps both dismiss the keyboard AND close the sheet.
 *
 * Usage:
 *   <KeyboardSafeSheet visible={...} onClose={...} maxHeight={0.9}>
 *     {your handle, header, ScrollView, buttons…}
 *   </KeyboardSafeSheet>
 */

import React from 'react';
import {
  View,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '../../constants/theme';

interface Props {
  /** Whether the sheet is visible */
  visible: boolean;
  /** Called when the backdrop is tapped or the Android Back button is pressed */
  onClose: () => void;
  /** Maximum sheet height as a fraction of the window (default 0.92) */
  maxHeightFraction?: number;
  /** Minimum sheet height as a fraction of the window (default 0.45) — prevents tiny-strip rendering */
  minHeightFraction?: number;
  /** Extra bottom padding inside the sheet to respect the home indicator (default: safe-area bottom) */
  extraBottomPad?: number;
  /** Content rendered inside the sheet */
  children: React.ReactNode;
}

export function KeyboardSafeSheet({
  visible,
  onClose,
  maxHeightFraction = 0.92,
  minHeightFraction = 0.45,
  extraBottomPad,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = Dimensions.get('window');
  const maxHeight = windowHeight * maxHeightFraction;
  const minHeight = windowHeight * minHeightFraction;
  const bottomPad =
    extraBottomPad !== undefined
      ? extraBottomPad
      : Math.max(Spacing.xxl, insets.bottom + Spacing.base);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Root: fills the entire screen, aligns sheet to bottom */}
      <View style={styles.root}>
        {/* Backdrop — absolutely positioned so it NEVER pushes the sheet */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
          accessible={false}
        />

        {/* KAV wraps the sheet only — lifts it when keyboard appears */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Sheet surface — inner taps dismiss keyboard but keep sheet open */}
          <Pressable
            style={[styles.sheet, { maxHeight, minHeight, paddingBottom: bottomPad }]}
            onPress={() => Keyboard.dismiss()}
          >
            {children}
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderColor: Colors.surfaceBorder,
    // Do NOT set a fixed height — the sheet grows to fit its content
    // and the KAV shifts it up when the keyboard opens.
  },
});
