// ─── PhoneInput ───────────────────────────────────────────────────────────────
// Reusable phone input component with country code picker.
//
// Features:
// - Default country: Jamaica (+1, area codes 876 and 658)
// - Searchable country picker modal (dark-themed)
// - E.164-style normalized output (+[code][national number])
// - Jamaica-aware validation (accepts both 876 and 658 area codes)
// - International number support with sensible validation
// - Displays existing saved values correctly
// - Disabled/loading state
// - Inline error display
//
// Usage:
//   <PhoneInput
//     value="+18765551234"
//     onChange={(e164) => setPhone(e164)}
//     error="Phone number is required"
//     disabled={loading}
//   />

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  TextInput as SearchInput,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

// ─── Country Data ─────────────────────────────────────────────────────────────
export interface CountryCode {
  code: string;     // e.g. "JM"
  name: string;     // e.g. "Jamaica"
  dialCode: string; // e.g. "+1"
  flag: string;     // e.g. "🇯🇲"
  // For NANP countries (+1), we need area code ranges to disambiguate
  areaCodePrefix?: string[]; // e.g. ['876', '658'] for Jamaica
  minLength: number; // national number length (digits after dial code)
  maxLength: number;
}

// Curated list ordered by Caribbean/Jamaica-first, then alphabetical
export const COUNTRY_CODES: CountryCode[] = [
  // ── Caribbean first ───────────────────────────────────────────────────────
  { code: 'JM', name: 'Jamaica',                  dialCode: '+1',   flag: '🇯🇲', areaCodePrefix: ['876', '658'], minLength: 10, maxLength: 10 },
  { code: 'BB', name: 'Barbados',                 dialCode: '+1',   flag: '🇧🇧', areaCodePrefix: ['246'],         minLength: 10, maxLength: 10 },
  { code: 'TT', name: 'Trinidad and Tobago',      dialCode: '+1',   flag: '🇹🇹', areaCodePrefix: ['868'],         minLength: 10, maxLength: 10 },
  { code: 'BS', name: 'Bahamas',                  dialCode: '+1',   flag: '🇧🇸', areaCodePrefix: ['242'],         minLength: 10, maxLength: 10 },
  { code: 'GD', name: 'Grenada',                  dialCode: '+1',   flag: '🇬🇩', areaCodePrefix: ['473'],         minLength: 10, maxLength: 10 },
  { code: 'AG', name: 'Antigua and Barbuda',      dialCode: '+1',   flag: '🇦🇬', areaCodePrefix: ['268'],         minLength: 10, maxLength: 10 },
  { code: 'DM', name: 'Dominica',                 dialCode: '+1',   flag: '🇩🇲', areaCodePrefix: ['767'],         minLength: 10, maxLength: 10 },
  { code: 'LC', name: 'Saint Lucia',              dialCode: '+1',   flag: '🇱🇨', areaCodePrefix: ['758'],         minLength: 10, maxLength: 10 },
  { code: 'VC', name: 'Saint Vincent',            dialCode: '+1',   flag: '🇻🇨', areaCodePrefix: ['784'],         minLength: 10, maxLength: 10 },
  { code: 'KN', name: 'Saint Kitts and Nevis',    dialCode: '+1',   flag: '🇰🇳', areaCodePrefix: ['869'],         minLength: 10, maxLength: 10 },
  { code: 'HT', name: 'Haiti',                    dialCode: '+509', flag: '🇭🇹', minLength: 8,  maxLength: 8  },
  { code: 'CU', name: 'Cuba',                     dialCode: '+53',  flag: '🇨🇺', minLength: 8,  maxLength: 8  },
  { code: 'DO', name: 'Dominican Republic',       dialCode: '+1',   flag: '🇩🇴', areaCodePrefix: ['809','829','849'], minLength: 10, maxLength: 10 },
  { code: 'PR', name: 'Puerto Rico',              dialCode: '+1',   flag: '🇵🇷', areaCodePrefix: ['787','939'],   minLength: 10, maxLength: 10 },
  // ── Major international ────────────────────────────────────────────────────
  { code: 'US', name: 'United States',            dialCode: '+1',   flag: '🇺🇸', minLength: 10, maxLength: 10 },
  { code: 'CA', name: 'Canada',                   dialCode: '+1',   flag: '🇨🇦', minLength: 10, maxLength: 10 },
  { code: 'GB', name: 'United Kingdom',           dialCode: '+44',  flag: '🇬🇧', minLength: 10, maxLength: 11 },
  { code: 'DE', name: 'Germany',                  dialCode: '+49',  flag: '🇩🇪', minLength: 9,  maxLength: 11 },
  { code: 'FR', name: 'France',                   dialCode: '+33',  flag: '🇫🇷', minLength: 9,  maxLength: 9  },
  { code: 'ES', name: 'Spain',                    dialCode: '+34',  flag: '🇪🇸', minLength: 9,  maxLength: 9  },
  { code: 'IT', name: 'Italy',                    dialCode: '+39',  flag: '🇮🇹', minLength: 9,  maxLength: 11 },
  { code: 'NL', name: 'Netherlands',              dialCode: '+31',  flag: '🇳🇱', minLength: 9,  maxLength: 9  },
  { code: 'AU', name: 'Australia',                dialCode: '+61',  flag: '🇦🇺', minLength: 9,  maxLength: 9  },
  { code: 'NZ', name: 'New Zealand',              dialCode: '+64',  flag: '🇳🇿', minLength: 8,  maxLength: 10 },
  { code: 'IN', name: 'India',                    dialCode: '+91',  flag: '🇮🇳', minLength: 10, maxLength: 10 },
  { code: 'CN', name: 'China',                    dialCode: '+86',  flag: '🇨🇳', minLength: 11, maxLength: 11 },
  { code: 'JP', name: 'Japan',                    dialCode: '+81',  flag: '🇯🇵', minLength: 10, maxLength: 11 },
  { code: 'BR', name: 'Brazil',                   dialCode: '+55',  flag: '🇧🇷', minLength: 10, maxLength: 11 },
  { code: 'MX', name: 'Mexico',                   dialCode: '+52',  flag: '🇲🇽', minLength: 10, maxLength: 10 },
  { code: 'CO', name: 'Colombia',                 dialCode: '+57',  flag: '🇨🇴', minLength: 10, maxLength: 10 },
  { code: 'VE', name: 'Venezuela',                dialCode: '+58',  flag: '🇻🇪', minLength: 7,  maxLength: 7  },
  { code: 'GT', name: 'Guatemala',                dialCode: '+502', flag: '🇬🇹', minLength: 8,  maxLength: 8  },
  { code: 'PA', name: 'Panama',                   dialCode: '+507', flag: '🇵🇦', minLength: 7,  maxLength: 8  },
  { code: 'NG', name: 'Nigeria',                  dialCode: '+234', flag: '🇳🇬', minLength: 10, maxLength: 10 },
  { code: 'GH', name: 'Ghana',                    dialCode: '+233', flag: '🇬🇭', minLength: 9,  maxLength: 9  },
  { code: 'KE', name: 'Kenya',                    dialCode: '+254', flag: '🇰🇪', minLength: 9,  maxLength: 9  },
  { code: 'ZA', name: 'South Africa',             dialCode: '+27',  flag: '🇿🇦', minLength: 9,  maxLength: 9  },
  { code: 'SG', name: 'Singapore',                dialCode: '+65',  flag: '🇸🇬', minLength: 8,  maxLength: 8  },
  { code: 'AE', name: 'United Arab Emirates',     dialCode: '+971', flag: '🇦🇪', minLength: 9,  maxLength: 9  },
];

const JAMAICA = COUNTRY_CODES[0]; // Always Jamaica by index

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses an E.164 phone number into its country and national number components.
 * Falls back to Jamaica if no match is found.
 */
export function parseE164(e164: string): { country: CountryCode; national: string } {
  if (!e164) return { country: JAMAICA, national: '' };

  const digits = e164.replace(/^\+/, '');

  // Try NANP (+1) with area code match first
  if (digits.startsWith('1') && digits.length >= 4) {
    const area = digits.slice(1, 4);
    const nanpCountry = COUNTRY_CODES.find(
      (c) => c.dialCode === '+1' && c.areaCodePrefix?.includes(area)
    );
    if (nanpCountry) {
      return { country: nanpCountry, national: digits.slice(1) };
    }
  }

  // Try longest match on dial code
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const country of sorted) {
    const code = country.dialCode.replace('+', '');
    if (digits.startsWith(code)) {
      return { country, national: digits.slice(code.length) };
    }
  }

  return { country: JAMAICA, national: e164 };
}

/**
 * Converts a country + national number into E.164 format.
 * Strips all non-digit characters from the national number.
 */
export function toE164(country: CountryCode, national: string): string {
  const clean = national.replace(/\D/g, '');
  if (!clean) return '';
  return `${country.dialCode}${clean}`;
}

/**
 * Validates a phone number.
 * For Jamaica: accepts 876 and 658 area codes, 10-digit total.
 * For other countries: validates by length range.
 */
export function validatePhone(country: CountryCode, national: string): boolean {
  const clean = national.replace(/\D/g, '');
  if (!clean) return false;

  // Jamaica: must be exactly 10 digits starting with 876 or 658
  if (country.code === 'JM') {
    if (clean.length !== 10) return false;
    return clean.startsWith('876') || clean.startsWith('658');
  }

  // NANP countries with area code prefix validation
  if (country.dialCode === '+1' && country.areaCodePrefix?.length) {
    if (clean.length !== 10) return false;
    return country.areaCodePrefix.some((prefix) => clean.startsWith(prefix));
  }

  // Generic: validate by length range
  return clean.length >= country.minLength && clean.length <= country.maxLength;
}

/**
 * Formats a national number for display (e.g. 8765551234 → (876) 555-1234 for NANP).
 */
export function formatNationalDisplay(country: CountryCode, national: string): string {
  const clean = national.replace(/\D/g, '');
  if (country.dialCode === '+1' && clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return clean;
}

// ─── Country Picker Modal ─────────────────────────────────────────────────────
interface CountryPickerModalProps {
  visible: boolean;
  selected: CountryCode;
  onSelect: (country: CountryCode) => void;
  onClose: () => void;
}

function CountryPickerModal({ visible, selected, onSelect, onClose }: CountryPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRY_CODES;
    return COUNTRY_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [search]);

  const handleSelect = (country: CountryCode) => {
    onSelect(country);
    setSearch('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={pickerStyles.overlay}>
        <Pressable style={pickerStyles.backdrop} onPress={() => { setSearch(''); onClose(); }} />
        <View style={[pickerStyles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={pickerStyles.handle} />
          <Text style={pickerStyles.title}>Select Country</Text>

          {/* Search */}
          <View style={pickerStyles.searchRow}>
            <MaterialIcons name="search" size={16} color={Colors.textMuted} />
            <SearchInput
              style={pickerStyles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search countries..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search countries"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialIcons name="close" size={14} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Country list */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => `${item.code}-${item.dialCode}`}
            showsVerticalScrollIndicator={false}
            style={pickerStyles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item.code === selected.code &&
                (item.dialCode === selected.dialCode || item.code === selected.code);
              return (
                <Pressable
                  onPress={() => handleSelect(item)}
                  style={({ pressed }) => [
                    pickerStyles.countryRow,
                    isSelected && pickerStyles.countryRowSelected,
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} ${item.dialCode}`}
                >
                  <Text style={pickerStyles.flag}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[pickerStyles.countryName, isSelected && { color: Colors.gold }]}>
                      {item.name}
                    </Text>
                  </View>
                  <Text style={[pickerStyles.dialCode, isSelected && { color: Colors.gold }]}>
                    {item.dialCode}
                  </Text>
                  {isSelected && (
                    <MaterialIcons name="check" size={16} color={Colors.gold} style={{ marginLeft: 4 }} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={pickerStyles.emptyState}>
                <MaterialIcons name="search-off" size={28} color={Colors.textMuted} />
                <Text style={pickerStyles.emptyText}>No countries found</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    maxHeight: '80%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: 'center', marginBottom: Spacing.base,
  },
  title: {
    fontSize: Typography.lg, fontWeight: Typography.black,
    color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.md,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 46, marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1, fontSize: Typography.base, color: Colors.textPrimary, height: '100%',
  },
  list: { flex: 1 },
  countryRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  countryRowSelected: { backgroundColor: `${Colors.gold}08` },
  flag: { fontSize: 22, width: 32, textAlign: 'center' },
  countryName: { fontSize: Typography.base, color: Colors.textPrimary, fontWeight: Typography.medium },
  dialCode: { fontSize: Typography.sm, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  emptyState: {
    alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm,
  },
  emptyText: { fontSize: Typography.sm, color: Colors.textMuted },
});

// ─── PhoneInput Component ─────────────────────────────────────────────────────
interface PhoneInputProps {
  /** E.164 value (e.g. "+18765551234"). Empty string for no value. */
  value: string;
  /** Called with normalized E.164 value whenever the number changes. */
  onChange: (e164: string) => void;
  /** Inline error message to display below the input. */
  error?: string;
  /** Disabled state — disables all interaction. */
  disabled?: boolean;
  /** Optional placeholder for the national number field. */
  placeholder?: string;
  /** Optional label shown above the input. */
  label?: string;
  /** Whether this field is required — shows * on label. */
  required?: boolean;
  /** Additional container style. */
  style?: any;
}

export function PhoneInput({
  value,
  onChange,
  error,
  disabled,
  placeholder,
  label,
  required,
  style,
}: PhoneInputProps) {
  // Parse the incoming E.164 value into country + national number
  const parsed = useMemo(() => parseE164(value), [value]);
  const [country, setCountry] = useState<CountryCode>(parsed.country);
  const [national, setNational] = useState<string>(parsed.national);
  const [showPicker, setShowPicker] = useState(false);

  // Sync state when the external `value` prop changes (e.g. loading saved profile)
  React.useEffect(() => {
    const p = parseE164(value);
    setCountry(p.country);
    setNational(p.national);
  }, [value]);

  const handleNationalChange = (text: string) => {
    // Only allow digits and common formatting characters
    const clean = text.replace(/[^0-9\s\-()]/g, '');
    setNational(clean);
    onChange(toE164(country, clean));
  };

  const handleCountrySelect = (c: CountryCode) => {
    setCountry(c);
    // Re-emit with new country code
    onChange(toE164(c, national));
  };

  return (
    <View style={[phoneStyles.container, style]}>
      {label ? (
        <Text style={phoneStyles.label}>
          {label}
          {required ? <Text style={phoneStyles.required}> *</Text> : null}
        </Text>
      ) : null}

      <View style={[
        phoneStyles.inputRow,
        error ? phoneStyles.inputRowError : null,
        disabled ? phoneStyles.inputRowDisabled : null,
      ]}>
        {/* Country code button */}
        <Pressable
          onPress={() => !disabled && setShowPicker(true)}
          disabled={disabled}
          style={({ pressed }) => [
            phoneStyles.countryBtn,
            pressed && !disabled && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Country: ${country.name} ${country.dialCode}`}
          hitSlop={4}
        >
          <Text style={phoneStyles.flag}>{country.flag}</Text>
          <Text style={[phoneStyles.dialCode, disabled && phoneStyles.disabledText]}>
            {country.dialCode}
          </Text>
          {!disabled && (
            <MaterialIcons name="keyboard-arrow-down" size={16} color={Colors.textMuted} />
          )}
        </Pressable>

        {/* Divider */}
        <View style={phoneStyles.divider} />

        {/* National number input */}
        <TextInput
          style={[phoneStyles.input, disabled && phoneStyles.disabledText]}
          value={national}
          onChangeText={handleNationalChange}
          placeholder={placeholder ?? (country.code === 'JM' ? '876 000 0000' : 'Phone number')}
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
          editable={!disabled}
          accessibilityLabel="Phone number"
          maxLength={15}
        />
      </View>

      {/* Error message */}
      {error ? (
        <View style={phoneStyles.errorRow}>
          <MaterialIcons name="error-outline" size={12} color={Colors.error} />
          <Text style={phoneStyles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Country picker modal */}
      <CountryPickerModal
        visible={showPicker}
        selected={country}
        onSelect={handleCountrySelect}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}

const phoneStyles = StyleSheet.create({
  container: { gap: Spacing.xs },
  label: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.semibold,
  },
  required: { color: Colors.error },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    minHeight: 52,
  },
  inputRowError: { borderColor: Colors.error },
  inputRowDisabled: { opacity: 0.5 },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 90,
    flexShrink: 0,
  },
  flag: { fontSize: 18 },
  dialCode: {
    fontSize: Typography.sm,
    color: Colors.textPrimary,
    fontWeight: Typography.semibold,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.surfaceBorder,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.base,
    color: Colors.textPrimary,
  },
  disabledText: { color: Colors.textMuted },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  errorText: {
    fontSize: Typography.xs,
    color: Colors.error,
    flex: 1,
  },
});
