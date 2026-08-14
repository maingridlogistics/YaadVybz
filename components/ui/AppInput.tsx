// components/ui/AppInput.tsx
// Stage 4 — Reusable text input for the light theme design system.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  Pressable,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface AppInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorText?: string;
  leftIcon?: React.ComponentProps<typeof MaterialIcons>['name'];
  rightIcon?: React.ComponentProps<typeof MaterialIcons>['name'];
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  disabled?: boolean;
  password?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  accessibilityLabel?: string;
}

export function AppInput({
  label,
  helperText,
  errorText,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  disabled = false,
  password = false,
  multiline = false,
  numberOfLines = 4,
  accessibilityLabel,
  ...inputProps
}: AppInputProps) {
  const [focused, setFocused] = useState(false);
  const [secureText, setSecureText] = useState(password);

  const hasError = !!errorText;

  const borderColor = hasError
    ? Colors.error
    : focused
    ? Colors.primary
    : Colors.surfaceBorder;

  const borderWidth = focused || hasError ? 1.5 : 1;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      ) : null}

      <View
        style={[
          styles.inputWrap,
          { borderColor, borderWidth },
          focused && styles.inputWrapFocused,
          hasError && styles.inputWrapError,
          disabled && styles.inputWrapDisabled,
          multiline && styles.inputWrapMultiline,
        ]}
      >
        {leftIcon ? (
          <MaterialIcons
            name={leftIcon}
            size={18}
            color={hasError ? Colors.error : focused ? Colors.primary : Colors.textMuted}
            style={styles.leftIcon}
          />
        ) : null}

        <TextInput
          {...inputProps}
          editable={!disabled}
          secureTextEntry={secureText}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : undefined}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => { setFocused(true); inputProps.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); inputProps.onBlur?.(e); }}
          accessibilityLabel={accessibilityLabel ?? label}
          placeholderTextColor={Colors.textMuted}
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeft : null,
            (rightIcon || password) ? styles.inputWithRight : null,
            multiline && styles.inputMultiline,
            disabled && styles.inputDisabled,
          ]}
        />

        {password ? (
          <Pressable
            onPress={() => setSecureText(!secureText)}
            hitSlop={8}
            style={styles.rightIcon}
            accessibilityLabel={secureText ? 'Show password' : 'Hide password'}
          >
            <MaterialIcons
              name={secureText ? 'visibility-off' : 'visibility'}
              size={18}
              color={Colors.textMuted}
            />
          </Pressable>
        ) : rightIcon ? (
          <Pressable
            onPress={onRightIconPress}
            disabled={!onRightIconPress}
            hitSlop={8}
            style={styles.rightIcon}
          >
            <MaterialIcons
              name={rightIcon}
              size={18}
              color={focused ? Colors.primary : Colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      {(errorText || helperText) ? (
        <View style={styles.helperRow}>
          {hasError ? (
            <MaterialIcons name="error-outline" size={12} color={Colors.error} />
          ) : null}
          <Text style={[styles.helperText, hasError && styles.helperTextError]}>
            {errorText ?? helperText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs },

  label: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  labelDisabled: { color: Colors.textDisabled },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  inputWrapFocused: {
    backgroundColor: Colors.surface,
  },
  inputWrapError: {
    backgroundColor: Colors.errorSoft,
  },
  inputWrapDisabled: {
    backgroundColor: Colors.surfaceSecondary,
  },
  inputWrapMultiline: {
    alignItems: 'flex-start',
  },

  input: {
    flex: 1,
    height: 48,
    fontSize: Typography.base,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.base,
  },
  inputWithLeft: { paddingLeft: Spacing.xs },
  inputWithRight: { paddingRight: Spacing.xs },
  inputMultiline: {
    height: undefined,
    minHeight: 96,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  inputDisabled: { color: Colors.textDisabled },

  leftIcon: { marginLeft: Spacing.md },
  rightIcon: { marginRight: Spacing.md },

  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  helperText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    flex: 1,
  },
  helperTextError: { color: Colors.error },
});
