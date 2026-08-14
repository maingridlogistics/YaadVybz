// components/ui/SafeQRCode.tsx
// Safe wrapper around react-native-qrcode-svg.
//
// react-native-qrcode-svg throws (does not return null) when:
//   1. `value` is an empty string or undefined — internal validation error
//   2. react-native-svg Fabric bridge isn't ready on first mount
//
// This component:
//   - Guards against falsy/empty values (renders a placeholder instead)
//   - Wraps QRCode in a React error boundary so a crash in the SVG layer
//     never propagates to the parent tree
//   - Is a pure drop-in replacement: accepts the same props as QRCode

import React, { Component, ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

// ─── Error Boundary ────────────────────────────────────────────────────────────

interface BoundaryProps {
  children: ReactNode;
  size: number;
}

interface BoundaryState {
  crashed: boolean;
}

class QRErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { crashed: true };
  }

  render() {
    if (this.state.crashed) {
      return <QRPlaceholder size={this.props.size} />;
    }
    return this.props.children;
  }
}

// ─── Placeholder ───────────────────────────────────────────────────────────────

function QRPlaceholder({ size }: { size: number }) {
  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: 8 },
      ]}
    >
      <MaterialIcons name="qr-code-2" size={size * 0.4} color="#888" />
    </View>
  );
}

// ─── SafeQRCode ────────────────────────────────────────────────────────────────

interface SafeQRCodeProps {
  value: string | null | undefined;
  size?: number;
  color?: string;
  backgroundColor?: string;
  /** Extra padding inside the QR module cells */
  quietZone?: number;
}

export function SafeQRCode({
  value,
  size = 200,
  color = '#0A0A0A',
  backgroundColor = '#F8F8F0',
  quietZone,
}: SafeQRCodeProps) {
  // Guard: QRCode crashes on empty / falsy value
  if (!value || value.trim() === '') {
    return <QRPlaceholder size={size} />;
  }

  return (
    <QRErrorBoundary size={size}>
      <QRCode
        value={value}
        size={size}
        color={color}
        backgroundColor={backgroundColor}
        {...(quietZone !== undefined ? { quietZone } : {})}
      />
    </QRErrorBoundary>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#F0F0E8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
  },
});
