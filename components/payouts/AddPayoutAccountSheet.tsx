/**
 * AddPayoutAccountSheet
 *
 * Reusable bottom-sheet modal for adding a payout account.
 * Used by both app/(promoter)/payouts.tsx and app/ticketing/finance/[eventId].tsx.
 *
 * Flow:
 *   Step 1 — Choose payout method (wire_transfer | ncb_lynk)
 *   Step 2 — Fill banking details (conditional fields based on method + country)
 *
 * UX:
 *   - Backdrop tap → keyboard dismiss + close sheet
 *   - Sheet content tap → keyboard dismiss only
 *   - Visible X close button in header
 *   - Android Back → close sheet
 *   - KeyboardAvoidingView keeps button accessible
 *   - keyboardShouldPersistTaps="handled" on scroll
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  Platform,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { addPayoutAccount, type CreatePayoutAccountInput } from '../../services/payoutService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { KeyboardSafeSheet } from '../ui/KeyboardSafeSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

type PayoutMethod = 'wire_transfer' | 'ncb_lynk';
type AccountType = 'checking' | 'savings' | 'current' | 'other';
type Country = 'Jamaica' | 'United States' | 'Other';
type Currency = 'USD' | 'JMD';

interface FormState {
  payoutMethod: PayoutMethod | null;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  accountType: AccountType | null;
  country: Country;
  currency: Currency;
  branchName: string;
  branchCode: string;
  routingNumber: string;
  swiftBic: string;
  lynkReference: string; // for ncb_lynk: phone or lynk name
}

const INITIAL_FORM: FormState = {
  payoutMethod: null,
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  accountType: null,
  country: 'Jamaica',
  currency: 'JMD',
  branchName: '',
  branchCode: '',
  routingNumber: '',
  swiftBic: '',
  lynkReference: '',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <Text style={s.fieldLabel}>
      {children}
      {required ? <Text style={{ color: Colors.error }}> *</Text> : null}
    </Text>
  );
}

function StyledInput({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  returnKeyType,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  returnKeyType?: 'done' | 'next';
  accessibilityLabel: string;
}) {
  return (
    <TextInput
      style={s.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      keyboardType={keyboardType ?? 'default'}
      autoCapitalize={autoCapitalize ?? 'words'}
      returnKeyType={returnKeyType ?? 'next'}
      onSubmitEditing={returnKeyType === 'done' ? () => Keyboard.dismiss() : undefined}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

function OptionRow<T extends string>({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: T;
  selected: boolean;
  onSelect: (v: T) => void;
}) {
  return (
    <Pressable
      onPress={() => { Keyboard.dismiss(); onSelect(value); }}
      style={({ pressed }) => [s.optionRow, selected && s.optionRowActive, pressed && { opacity: 0.8 }]}
    >
      <Text style={[s.optionText, selected && s.optionTextActive]}>{label}</Text>
      {selected ? <MaterialIcons name="check" size={16} color={Colors.gold} /> : null}
    </Pressable>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  promoterId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddPayoutAccountSheet({ visible, promoterId, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'method' | 'details'>('method');
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
    // Reset after close animation
    setTimeout(() => {
      setStep('method');
      setForm(INITIAL_FORM);
      setError(null);
    }, 300);
  }, [onClose]);

  const handleSelectMethod = useCallback((method: PayoutMethod) => {
    update('payoutMethod', method);
    // Pre-set sensible defaults per method
    if (method === 'ncb_lynk') {
      update('currency', 'JMD');
      update('country', 'Jamaica');
    }
    setStep('details');
  }, [update]);

  const validate = (): string | null => {
    const m = form.payoutMethod;
    if (m === 'wire_transfer') {
      if (!form.bankName.trim()) return 'Bank name is required.';
      if (!form.accountHolderName.trim()) return 'Account holder name is required.';
      if (!form.accountNumber.trim()) return 'Account number is required.';
      if (form.accountNumber.trim().length < 4) return 'Account number must be at least 4 digits.';
      if (!form.accountType) return 'Please select an account type.';
      if (!form.country) return 'Please select a country.';
      if (!form.currency) return 'Please select a currency.';
      // US requires routing number
      if (form.country === 'United States' && !form.routingNumber.trim()) {
        return 'Routing number is required for US bank accounts.';
      }
    }
    if (m === 'ncb_lynk') {
      if (!form.lynkReference.trim()) return 'Lynk phone number or reference is required.';
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    Keyboard.dismiss();
    setLoading(true);
    setError(null);

    const m = form.payoutMethod!;
    const accountLast4 = form.accountNumber.trim().slice(-4) || null;

    // Auto-generate display_name for masked display in account list
    let displayName = '';
    if (m === 'wire_transfer') {
      displayName = form.bankName.trim()
        ? `${form.bankName.trim()}${accountLast4 ? ` ••••${accountLast4}` : ''}`
        : `Wire Transfer${accountLast4 ? ` ••••${accountLast4}` : ''}`;
    } else if (m === 'ncb_lynk') {
      displayName = `NCB Lynk — ${form.lynkReference.trim()}`;
    }

    const bankCountry =
      form.country === 'Jamaica' ? 'JM'
      : form.country === 'United States' ? 'US'
      : 'OTHER';

    const input: CreatePayoutAccountInput = {
      promoterId,
      payoutMethod: m,
      currency: form.currency,
      bankCountry,
      displayName,
      bankName: m === 'wire_transfer' ? form.bankName.trim() || undefined : undefined,
      accountHolderName: form.accountHolderName.trim() || undefined,
      accountNumber: m === 'wire_transfer' ? form.accountNumber.trim() : undefined,
      accountType: m === 'wire_transfer' ? form.accountType ?? undefined : undefined,
      branchName: form.branchName.trim() || undefined,
      branchCode: form.branchCode.trim() || undefined,
      routingNumber: form.routingNumber.trim() || undefined,
      swiftBic: form.swiftBic.trim() || undefined,
      lynkReference: m === 'ncb_lynk' ? form.lynkReference.trim() : undefined,
    };

    const { error: serviceError } = await addPayoutAccount(input);
    setLoading(false);

    if (serviceError) {
      const msg = serviceError.toLowerCase();
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already exists')) {
        setError(`You already have a pending ${form.currency} ${m === 'ncb_lynk' ? 'NCB Lynk' : 'wire transfer'} account. Wait for admin verification or contact support.`);
      } else if (msg.includes('payout_method_check') || msg.includes('check constraint')) {
        setError('Account configuration error. Please contact support.');
      } else {
        setError("We couldn't add this payout account. Please check the details and try again.");
      }
      return;
    }

    handleClose();
    onSuccess();
    Alert.alert(
      'Account Added',
      'Your payout account has been submitted and is pending verification by Vybz Hub admin.',
    );
  };

  const showBranch = form.country === 'Jamaica';
  const showRouting = form.country === 'United States';
  const showSwift = form.country !== 'United States';

  return (
    <KeyboardSafeSheet visible={visible} onClose={handleClose}>
          {/* Handle + Header */}
          <View style={s.handleWrap}>
            <View style={s.handle} />
          </View>

          <View style={s.sheetHeader}>
            {step === 'details' ? (
              <Pressable
                onPress={() => { setStep('method'); setError(null); }}
                style={({ pressed }) => [s.headerNavBtn, pressed && { opacity: 0.7 }]}
                hitSlop={8}
              >
                <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
              </Pressable>
            ) : (
              <View style={s.headerNavBtn} />
            )}
            <Text style={s.sheetTitle}>
              {step === 'method' ? 'Add Payout Account' : 'Bank Details'}
            </Text>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [s.headerNavBtn, s.closeBtn, pressed && { opacity: 0.7 }]}
              hitSlop={8}
              accessibilityLabel="Close"
            >
              <MaterialIcons name="close" size={20} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {/* ── Step 1: Method Selection ── */}
          {step === 'method' ? (
            <View style={s.methodStep}>
              <Text style={s.stepDescription}>
                Choose how you want to receive payouts. Account details will be verified by Vybz Hub admin.
              </Text>

              <Pressable
                onPress={() => handleSelectMethod('wire_transfer')}
                style={({ pressed }) => [s.methodCard, pressed && { opacity: 0.85 }]}
              >
                <View style={[s.methodIconWrap, { backgroundColor: 'rgba(33,150,243,0.1)' }]}>
                  <MaterialIcons name="account-balance" size={24} color="#2196F3" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.methodTitle}>Bank / Wire Transfer</Text>
                  <Text style={s.methodSub}>
                    NCB, Scotiabank, JMMB, Sagicor, BOJ, international banks — USD or JMD
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
              </Pressable>

              <Pressable
                onPress={() => handleSelectMethod('ncb_lynk')}
                style={({ pressed }) => [s.methodCard, pressed && { opacity: 0.85 }]}
              >
                <View style={[s.methodIconWrap, { backgroundColor: 'rgba(255,193,7,0.1)' }]}>
                  <MaterialIcons name="smartphone" size={24} color="#FFC107" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.methodTitle}>NCB Lynk</Text>
                  <Text style={s.methodSub}>Receive payouts via NCB Lynk mobile wallet — JMD</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
              </Pressable>

              <Text style={s.methodNote}>
                More methods (Stripe Connect, ACH) will be available for verified Elite creators.
              </Text>
            </View>
          ) : null}

          {/* ── Step 2: Bank Details ── */}
          {step === 'details' ? (
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.formScroll}
            >
              {/* NCB Lynk Form */}
              {form.payoutMethod === 'ncb_lynk' ? (
                <>
                  <Text style={s.stepDescription}>
                    Enter your NCB Lynk phone number or registered Lynk name.
                  </Text>

                  <FieldLabel required>Lynk Phone Number / Reference</FieldLabel>
                  <StyledInput
                    value={form.lynkReference}
                    onChangeText={(v) => update('lynkReference', v)}
                    placeholder="e.g. 876-555-0000"
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    returnKeyType="next"
                    accessibilityLabel="Lynk phone or reference"
                  />

                  <FieldLabel>Account Holder Name</FieldLabel>
                  <StyledInput
                    value={form.accountHolderName}
                    onChangeText={(v) => update('accountHolderName', v)}
                    placeholder="Name on the Lynk account"
                    autoCapitalize="words"
                    returnKeyType="done"
                    accessibilityLabel="Account holder name"
                  />

                  <FieldLabel required>Currency</FieldLabel>
                  <View style={s.chipRow}>
                    {(['JMD', 'USD'] as Currency[]).map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => { Keyboard.dismiss(); update('currency', c); }}
                        style={({ pressed }) => [
                          s.chip,
                          form.currency === c && s.chipActive,
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <Text style={[s.chipText, form.currency === c && s.chipTextActive]}>{c}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {/* Wire Transfer Form */}
              {form.payoutMethod === 'wire_transfer' ? (
                <>
                  <Text style={s.stepDescription}>
                    Enter your bank account details. This information is private and only visible to you and Vybz Hub admin.
                  </Text>

                  <FieldLabel required>Bank Name</FieldLabel>
                  <StyledInput
                    value={form.bankName}
                    onChangeText={(v) => update('bankName', v)}
                    placeholder="e.g. National Commercial Bank Jamaica"
                    autoCapitalize="words"
                    returnKeyType="next"
                    accessibilityLabel="Bank name"
                  />

                  <FieldLabel required>Account Holder Name</FieldLabel>
                  <StyledInput
                    value={form.accountHolderName}
                    onChangeText={(v) => update('accountHolderName', v)}
                    placeholder="Full name on the account"
                    autoCapitalize="words"
                    returnKeyType="next"
                    accessibilityLabel="Account holder name"
                  />

                  <FieldLabel required>Account Number</FieldLabel>
                  <StyledInput
                    value={form.accountNumber}
                    onChangeText={(v) => update('accountNumber', v.replace(/\s/g, ''))}
                    placeholder="Account number (last 4 shown publicly)"
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    returnKeyType="next"
                    accessibilityLabel="Account number"
                  />
                  <Text style={s.fieldNote}>Only the last 4 digits will be displayed in your account list.</Text>

                  <FieldLabel required>Account Type</FieldLabel>
                  <View style={s.optionGroup}>
                    {([
                      { value: 'checking', label: 'Checking' },
                      { value: 'savings', label: 'Savings' },
                      { value: 'current', label: 'Current' },
                      { value: 'other', label: 'Other' },
                    ] as { value: AccountType; label: string }[]).map((opt) => (
                      <OptionRow
                        key={opt.value}
                        label={opt.label}
                        value={opt.value}
                        selected={form.accountType === opt.value}
                        onSelect={(v) => update('accountType', v)}
                      />
                    ))}
                  </View>

                  <FieldLabel required>Country</FieldLabel>
                  <View style={s.optionGroup}>
                    {(['Jamaica', 'United States', 'Other'] as Country[]).map((c) => (
                      <OptionRow
                        key={c}
                        label={c}
                        value={c}
                        selected={form.country === c}
                        onSelect={(v) => {
                          update('country', v);
                          // Auto-adjust currency defaults
                          if (v === 'United States') update('currency', 'USD');
                          if (v === 'Jamaica') update('currency', 'JMD');
                        }}
                      />
                    ))}
                  </View>

                  <FieldLabel required>Currency</FieldLabel>
                  <View style={s.chipRow}>
                    {(['USD', 'JMD'] as Currency[]).map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => { Keyboard.dismiss(); update('currency', c); }}
                        style={({ pressed }) => [
                          s.chip,
                          form.currency === c && s.chipActive,
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <Text style={[s.chipText, form.currency === c && s.chipTextActive]}>{c}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Jamaica-specific fields */}
                  {showBranch ? (
                    <>
                      <FieldLabel>Branch Name</FieldLabel>
                      <StyledInput
                        value={form.branchName}
                        onChangeText={(v) => update('branchName', v)}
                        placeholder="e.g. Half Way Tree Branch"
                        autoCapitalize="words"
                        returnKeyType="next"
                        accessibilityLabel="Branch name"
                      />

                      <FieldLabel>Branch Code</FieldLabel>
                      <StyledInput
                        value={form.branchCode}
                        onChangeText={(v) => update('branchCode', v)}
                        placeholder="e.g. 001"
                        keyboardType="number-pad"
                        autoCapitalize="none"
                        returnKeyType="next"
                        accessibilityLabel="Branch code"
                      />
                    </>
                  ) : null}

                  {/* US-specific routing */}
                  {showRouting ? (
                    <>
                      <FieldLabel required>Routing Number (ABA)</FieldLabel>
                      <StyledInput
                        value={form.routingNumber}
                        onChangeText={(v) => update('routingNumber', v.replace(/\s/g, ''))}
                        placeholder="9-digit ABA routing number"
                        keyboardType="number-pad"
                        autoCapitalize="none"
                        returnKeyType="next"
                        accessibilityLabel="Routing number"
                      />
                    </>
                  ) : null}

                  {/* SWIFT/BIC for non-US or international */}
                  {showSwift ? (
                    <>
                      <FieldLabel>SWIFT / BIC Code</FieldLabel>
                      <StyledInput
                        value={form.swiftBic}
                        onChangeText={(v) => update('swiftBic', v.toUpperCase())}
                        placeholder="e.g. NCOBJMKX"
                        keyboardType="default"
                        autoCapitalize="characters"
                        returnKeyType="done"
                        accessibilityLabel="SWIFT or BIC code"
                      />
                    </>
                  ) : null}
                </>
              ) : null}

              {/* Error */}
              {error ? (
                <View style={s.errorRow}>
                  <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Privacy note */}
              <View style={s.privacyRow}>
                <MaterialIcons name="lock" size={12} color={Colors.textMuted} />
                <Text style={s.privacyText}>
                  Banking details are encrypted and only visible to you and Vybz Hub admin. Account numbers are never displayed publicly.
                </Text>
              </View>

              {/* Submit */}
              <Pressable
                onPress={handleSubmit}
                disabled={loading}
                style={({ pressed }) => [s.submitBtn, loading && { opacity: 0.5 }, pressed && { opacity: 0.88 }]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.submitBtnInner}>
                  {loading
                    ? <ActivityIndicator color={Colors.textOnGold} size="small" />
                    : (
                      <>
                        <MaterialIcons name="check" size={16} color={Colors.textOnGold} />
                        <Text style={s.submitBtnText}>Submit Payout Account</Text>
                      </>
                    )}
                </LinearGradient>
              </Pressable>

              <View style={{ height: Spacing.xl }} />
            </ScrollView>
          ) : null}
    </KeyboardSafeSheet>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // outerContainer and sheet are now provided by KeyboardSafeSheet
  handleWrap: {
    alignItems: 'center',
    paddingTop: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: Spacing.sm,
  },
  headerNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    backgroundColor: Colors.surfaceElevated,
  },
  sheetTitle: {
    flex: 1,
    fontSize: Typography.md,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },

  // ── Method Step ──────────────────────────────────────────────────────────
  methodStep: {
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  stepDescription: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  methodIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  methodTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  methodSub: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  methodNote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },

  // ── Form Step ────────────────────────────────────────────────────────────
  formScroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  fieldLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  fieldNote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: -Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Platform.OS === 'ios' ? Spacing.md : Spacing.sm + 2,
    fontSize: Typography.base,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },

  // Option group (account type, country)
  optionGroup: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  optionRowActive: {
    backgroundColor: Colors.goldSurface,
  },
  optionText: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
  },
  optionTextActive: {
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },

  // Currency chips
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  chipActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  chipText: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
  },
  chipTextActive: {
    color: Colors.textOnGold,
  },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.2)',
    marginTop: Spacing.xs,
  },
  errorText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.error,
    lineHeight: 18,
  },

  // Privacy
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginTop: Spacing.xs,
  },
  privacyText: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 17,
  },

  // Submit
  submitBtn: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.md,
  },
  submitBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  submitBtnText: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
});
