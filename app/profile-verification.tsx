/**
 * Vybz Hub — Profile Verification Screen
 *
 * Allows Pro/Elite users to submit a Profile Verification request.
 * Verification is NOT automatic on subscription — it requires admin approval.
 *
 * Evidence collected:
 *   1. Legal Name
 *   2. Government ID Type (passport | drivers_license | other_govt_id)
 *   3. Government ID image (uploaded to private profile-verification bucket)
 *   4. Selfie image (uploaded to private profile-verification bucket)
 *   5. Optional notes
 *   6. Consent acknowledgement
 *
 * Submission path: submit_profile_verification() SECURITY DEFINER RPC
 * Resubmission path: resubmit_profile_verification() SECURITY DEFINER RPC
 * verified_promoter is ONLY changed by admin_review_profile_verification() RPC.
 *
 * States: not_requested → form → pending → approved | rejected → resubmit form
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

interface VerificationRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string;
  legal_name: string | null;
  id_type: string | null;
  id_document_path: string | null;
  selfie_path: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

type IdType = 'passport' | 'drivers_license' | 'other_govt_id';

const ID_TYPE_LABELS: Record<IdType, string> = {
  passport: 'Passport',
  drivers_license: "Driver's License",
  other_govt_id: 'Other Government-Issued Photo ID',
};

// ── Upload a picked image to Supabase Storage ─────────────────────────────────
async function uploadVerificationImage(
  uri: string,
  userId: string,
  folder: string,
  filename: string,
): Promise<string> {
  // Read file as base64 (works on iOS, Android, and Web)
  const response = await fetch(uri);
  const blob = await response.blob();

  // Convert blob to ArrayBuffer
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });

  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    ext === 'heic' ? 'image/heic' :
    ext === 'heif' ? 'image/heif' :
    'image/jpeg';

  const path = `${userId}/${folder}/${filename}.${ext}`;

  const { error } = await supabase.storage
    .from('profile-verification')
    .upload(path, arrayBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

// ── Image Picker Helper ────────────────────────────────────────────────────────
async function pickImage(allowCamera = true): Promise<string | null> {
  const choice = await new Promise<'library' | 'camera' | 'cancel'>((resolve) => {
    if (!allowCamera || Platform.OS === 'web') {
      resolve('library');
      return;
    }
    Alert.alert(
      'Choose Source',
      'Select how to provide the image',
      [
        { text: 'Photo Library', onPress: () => resolve('library') },
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
      ],
    );
  });

  if (choice === 'cancel') return null;

  if (choice === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is required to take a photo.');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return null;
    return result.assets[0].uri;
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is required to select an image.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return null;
    return result.assets[0].uri;
  }
}

// ── Top Bar ───────────────────────────────────────────────────────────────────
function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.topBar}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
        hitSlop={8}
      >
        <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
      </Pressable>
      <Text style={s.topBarTitle}>Profile Verification</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

// ── Image Upload Field ────────────────────────────────────────────────────────
function ImageField({
  label,
  hint,
  uri,
  uploading,
  onPick,
}: {
  label: string;
  hint: string;
  uri: string | null;
  uploading: boolean;
  onPick: () => void;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldHint}>{hint}</Text>
      <Pressable
        onPress={onPick}
        disabled={uploading}
        style={({ pressed }) => [s.imageUploadBox, uri && s.imageUploadBoxFilled, pressed && { opacity: 0.8 }]}
      >
        {uploading ? (
          <View style={s.imageUploadContent}>
            <ActivityIndicator color={Colors.gold} />
            <Text style={s.imageUploadText}>Uploading…</Text>
          </View>
        ) : uri ? (
          <View style={s.imagePreviewWrap}>
            <Image
              source={{ uri }}
              style={s.imagePreview}
              contentFit="cover"
            />
            <View style={s.imageChangeOverlay}>
              <MaterialIcons name="edit" size={16} color="#fff" />
              <Text style={s.imageChangeText}>Change</Text>
            </View>
          </View>
        ) : (
          <View style={s.imageUploadContent}>
            <View style={s.imageUploadIcon}>
              <MaterialIcons name="add-photo-alternate" size={28} color={Colors.gold} />
            </View>
            <Text style={s.imageUploadText}>Tap to upload</Text>
            <Text style={s.imageUploadHint}>JPG, PNG, WEBP or HEIC</Text>
          </View>
        )}
      </Pressable>
      {uri && !uploading && (
        <View style={s.uploadedRow}>
          <MaterialIcons name="check-circle" size={14} color={Colors.greenLight} />
          <Text style={s.uploadedText}>Uploaded successfully</Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ProfileVerificationScreen() {
  const { user, verifiedPromoter, refreshProfile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [legalName, setLegalName] = useState('');
  const [selectedIdType, setSelectedIdType] = useState<IdType | null>(null);
  const [idDocUri, setIdDocUri] = useState<string | null>(null);
  const [idDocPath, setIdDocPath] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [uploadingId, setUploadingId] = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);

  const tier = user?.subscriptionTier ?? 'free';
  const isEligible = tier === 'pro' || tier === 'elite';

  const loadRequest = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('profile_verification_requests')
      .select('id, status, notes, legal_name, id_type, id_document_path, selfie_path, rejection_reason, created_at, reviewed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRequest(data as VerificationRequest | null);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadRequest(); }, [loadRequest]);

  const resetForm = () => {
    setLegalName('');
    setSelectedIdType(null);
    setIdDocUri(null);
    setIdDocPath(null);
    setSelfieUri(null);
    setSelfiePath(null);
    setNotes('');
    setConsent(false);
  };

  const populateFormFromRequest = (req: VerificationRequest) => {
    setLegalName(req.legal_name ?? '');
    setSelectedIdType((req.id_type as IdType) ?? null);
    setIdDocPath(req.id_document_path);
    setSelfiePath(req.selfie_path);
    setNotes(req.notes ?? '');
  };

  const handlePickId = async () => {
    if (!user) return;
    const uri = await pickImage(true);
    if (!uri) return;
    setIdDocUri(uri);
    setIdDocPath(null);
    setUploadingId(true);
    try {
      const folder = Date.now().toString();
      const path = await uploadVerificationImage(uri, user.id, folder, 'id');
      setIdDocPath(path);
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not upload ID image. Please try again.');
      setIdDocUri(null);
    } finally {
      setUploadingId(false);
    }
  };

  const handlePickSelfie = async () => {
    if (!user) return;
    const uri = await pickImage(true);
    if (!uri) return;
    setSelfieUri(uri);
    setSelfiePath(null);
    setUploadingSelfie(true);
    try {
      // Use same folder derived from a timestamp so both files are co-located
      const folder = idDocPath?.split('/')[1] ?? Date.now().toString();
      const path = await uploadVerificationImage(uri, user.id, folder, 'selfie');
      setSelfiePath(path);
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not upload selfie. Please try again.');
      setSelfieUri(null);
    } finally {
      setUploadingSelfie(false);
    }
  };

  const validate = (): string | null => {
    if (!legalName.trim() || legalName.trim().length < 2) return 'Please enter your legal name.';
    if (!selectedIdType) return 'Please select an ID type.';
    if (!idDocPath) return 'Please upload your government ID document.';
    if (!selfiePath) return 'Please upload a selfie.';
    if (!consent) return 'Please accept the consent statement to proceed.';
    return null;
  };

  const handleSubmit = async () => {
    if (!user || submitting) return;
    const err = validate();
    if (err) { Alert.alert('Required', err); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('submit_profile_verification', {
        p_legal_name: legalName.trim(),
        p_id_type: selectedIdType,
        p_id_document_path: idDocPath,
        p_selfie_path: selfiePath,
        p_notes: notes.trim(),
      });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'Submission failed.');

      resetForm();
      setShowForm(false);
      await loadRequest();
      Alert.alert(
        'Request Submitted',
        'Your Profile Verification request is now pending review by the Vybz Hub team. You will be notified when a decision is made.',
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmit = async () => {
    if (!user || submitting) return;
    const err = validate();
    if (err) { Alert.alert('Required', err); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('resubmit_profile_verification', {
        p_legal_name: legalName.trim(),
        p_id_type: selectedIdType,
        p_id_document_path: idDocPath,
        p_selfie_path: selfiePath,
        p_notes: notes.trim(),
      });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'Resubmission failed.');

      resetForm();
      setShowForm(false);
      await loadRequest();
      Alert.alert(
        'Resubmitted',
        'Your updated verification request has been submitted for review.',
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to resubmit.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' });

  // ── Verified state ────────────────────────────────────────────────────────
  if (!loading && verifiedPromoter) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <TopBar onBack={() => router.back()} />
        </SafeAreaView>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.statusCard}>
            <LinearGradient
              colors={[`${Colors.gold}18`, `${Colors.gold}06`]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[s.statusIconWrap, { backgroundColor: Colors.goldSurface }]}>
              <MaterialIcons name="verified" size={48} color={Colors.gold} />
            </View>
            <Text style={s.statusTitle}>Verified Profile</Text>
            <Text style={s.statusDesc}>
              Your profile has been verified by the Vybz Hub team. The verified badge is displayed on your public promoter profile and event listings.
            </Text>
            <View style={s.verifiedBadgeRow}>
              <MaterialIcons name="verified" size={16} color={Colors.gold} />
              <Text style={s.verifiedBadgeText}>Verified Promoter</Text>
            </View>
          </View>
          <View style={s.infoCard}>
            <MaterialIcons name="info-outline" size={16} color={Colors.textMuted} />
            <Text style={s.infoText}>
              Your verified status is tied to your identity, not your subscription. It persists even if you change plans.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Not eligible (free tier) ────────────────────────────────────────────────
  if (!loading && !isEligible) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <TopBar onBack={() => router.back()} />
        </SafeAreaView>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.statusCard}>
            <View style={[s.statusIconWrap, { backgroundColor: Colors.surfaceElevated }]}>
              <MaterialIcons name="lock" size={40} color={Colors.textMuted} />
            </View>
            <Text style={s.statusTitle}>Profile Verification Included</Text>
            <Text style={s.statusDesc}>
              Profile Verification is included with Pro and Elite subscriptions. Upgrade to unlock the ability to request a Verified Profile badge.
            </Text>
            <Pressable
              onPress={() => router.push('/monetization/upgrade' as any)}
              style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.ctaBtnInner}
              >
                <MaterialIcons name="workspace-premium" size={16} color={Colors.textOnGold} />
                <Text style={s.ctaBtnText}>Upgrade to Pro</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  const isResubmitting = request?.status === 'rejected' && showForm;
  const isFirstSubmission = request === null && showForm;
  const showFormView = isFirstSubmission || isResubmitting;

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <TopBar onBack={() => { if (showForm) setShowForm(false); else router.back(); }} />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={Colors.gold} size="large" />
          </View>
        ) : showFormView ? (
          // ── SUBMISSION FORM ────────────────────────────────────────────────
          <>
            <View style={s.headerSection}>
              <View style={s.headerIcon}>
                <MaterialIcons name="verified-user" size={32} color={Colors.gold} />
              </View>
              <Text style={s.headerTitle}>
                {isResubmitting ? 'Update Your Request' : 'Verify Your Profile'}
              </Text>
              <Text style={s.headerDesc}>
                {isResubmitting
                  ? 'Update your submission with the correct information and resubmit for review.'
                  : `As a ${tier === 'elite' ? 'Elite' : 'Pro'} member, complete the form below to request a Verified Profile badge.`}
              </Text>
            </View>

            {/* Legal Name */}
            <View style={s.field}>
              <Text style={s.fieldLabel}>Legal Name <Text style={s.required}>*</Text></Text>
              <Text style={s.fieldHint}>Your full name as it appears on your government ID.</Text>
              <TextInput
                style={s.input}
                placeholder="Full legal name"
                placeholderTextColor={Colors.textMuted}
                value={legalName}
                onChangeText={setLegalName}
                autoCorrect={false}
                accessibilityLabel="Legal name"
              />
            </View>

            {/* ID Type */}
            <View style={s.field}>
              <Text style={s.fieldLabel}>Government ID Type <Text style={s.required}>*</Text></Text>
              <Text style={s.fieldHint}>Select the type of ID you are providing.</Text>
              <View style={s.idTypeRow}>
                {(['passport', 'drivers_license', 'other_govt_id'] as IdType[]).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setSelectedIdType(type)}
                    style={({ pressed }) => [
                      s.idTypeBtn,
                      selectedIdType === type && s.idTypeBtnSelected,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <MaterialIcons
                      name={type === 'passport' ? 'book' : type === 'drivers_license' ? 'drive-eta' : 'badge'}
                      size={16}
                      color={selectedIdType === type ? Colors.textOnGold : Colors.textMuted}
                    />
                    <Text style={[s.idTypeBtnText, selectedIdType === type && s.idTypeBtnTextSelected]}>
                      {ID_TYPE_LABELS[type]}
                    </Text>
                    {selectedIdType === type && (
                      <MaterialIcons name="check-circle" size={14} color={Colors.textOnGold} />
                    )}
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Government ID Upload */}
            <ImageField
              label={`Government ID Photo *`}
              hint="Upload a clear photo of the front of your government-issued ID. Ensure all text is legible."
              uri={idDocUri}
              uploading={uploadingId}
              onPick={handlePickId}
            />

            {/* Selfie Upload */}
            <ImageField
              label="Selfie *"
              hint="Take a clear selfie of your face. This will be compared with your submitted ID to verify your identity."
              uri={selfieUri}
              uploading={uploadingSelfie}
              onPick={handlePickSelfie}
            />

            {/* Optional Notes */}
            <View style={s.field}>
              <Text style={s.fieldLabel}>Optional Notes</Text>
              <Text style={s.fieldHint}>
                Any additional context for our review team (social links, business name, years of experience, etc.)
              </Text>
              <TextInput
                style={s.textarea}
                placeholder="e.g. I promote events under @VybzKing on Instagram..."
                placeholderTextColor={Colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                accessibilityLabel="Optional notes"
                maxLength={500}
              />
              <Text style={s.charCount}>{notes.length}/500</Text>
            </View>

            {/* Consent */}
            <Pressable
              onPress={() => setConsent((c) => !c)}
              style={s.consentRow}
            >
              <View style={[s.checkbox, consent && s.checkboxChecked]}>
                {consent && <MaterialIcons name="check" size={14} color={Colors.textOnGold} />}
              </View>
              <Text style={s.consentText}>
                I confirm that the information and documents I am providing are genuine, accurate, and belong to me. I consent to Vybz Hub retaining this information for the purpose of identity verification, and understand that submitted evidence will be deleted approximately 30 days after a final decision is reached.
              </Text>
            </Pressable>

            {/* Privacy Notice */}
            <View style={s.privacyCard}>
              <MaterialIcons name="lock" size={14} color={Colors.textMuted} />
              <Text style={s.privacyText}>
                Your documents are stored in a private, encrypted bucket. They are only accessible to authorized Vybz Hub staff for the purpose of identity verification and are never shared publicly.
              </Text>
            </View>

            {/* Submit / Resubmit */}
            <Pressable
              onPress={isResubmitting ? handleResubmit : handleSubmit}
              disabled={submitting || uploadingId || uploadingSelfie}
              style={({ pressed }) => [
                s.ctaBtn,
                (submitting || uploadingId || uploadingSelfie) && { opacity: 0.5 },
                pressed && !(submitting || uploadingId || uploadingSelfie) && { opacity: 0.85 },
              ]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.ctaBtnInner}
              >
                {submitting
                  ? <ActivityIndicator size="small" color={Colors.textOnGold} />
                  : <MaterialIcons name={isResubmitting ? 'refresh' : 'send'} size={16} color={Colors.textOnGold} />
                }
                <Text style={s.ctaBtnText}>
                  {submitting
                    ? (isResubmitting ? 'Resubmitting…' : 'Submitting…')
                    : (isResubmitting ? 'Resubmit Request' : 'Submit Verification Request')}
                </Text>
              </LinearGradient>
            </Pressable>
          </>
        ) : request === null ? (
          // ── NOT REQUESTED ──────────────────────────────────────────────────
          <>
            <View style={s.headerSection}>
              <View style={s.headerIcon}>
                <MaterialIcons name="verified-user" size={32} color={Colors.gold} />
              </View>
              <Text style={s.headerTitle}>Verify Your Profile</Text>
              <Text style={s.headerDesc}>
                As a {tier === 'elite' ? 'Elite' : 'Pro'} member, you can request a Verified Profile badge. Our team reviews each submission individually.
              </Text>
            </View>

            <View style={s.benefitsCard}>
              <Text style={s.benefitsTitle}>What Verification Means</Text>
              {[
                ['verified', 'Verified badge on your public promoter profile'],
                ['visibility', 'Increased trust with event attendees'],
                ['check-circle', 'Badge appears on your event listings'],
                ['lock', 'Persists even if you change or cancel your plan'],
              ].map(([icon, text]) => (
                <View key={text} style={s.benefitRow}>
                  <MaterialIcons name={icon as any} size={14} color={Colors.gold} />
                  <Text style={s.benefitText}>{text}</Text>
                </View>
              ))}
            </View>

            <View style={s.requirementsCard}>
              <Text style={s.requirementsTitle}>What You Will Need</Text>
              {[
                ['person', 'Your legal full name'],
                ['badge', 'Government-issued photo ID (passport, driver\'s license, or other)'],
                ['face', 'A clear selfie to confirm your identity'],
              ].map(([icon, text]) => (
                <View key={text} style={s.requirementRow}>
                  <View style={s.requirementIcon}>
                    <MaterialIcons name={icon as any} size={14} color={Colors.textPrimary} />
                  </View>
                  <Text style={s.requirementText}>{text}</Text>
                </View>
              ))}
            </View>

            <View style={s.noteCard}>
              <MaterialIcons name="info-outline" size={14} color="#FF9800" />
              <Text style={s.noteText}>
                Subscribing to Pro or Elite does NOT automatically verify your profile. Verification requires a separate review by the Vybz Hub team.
              </Text>
            </View>

            <Pressable
              onPress={() => { resetForm(); setShowForm(true); }}
              style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.ctaBtnInner}
              >
                <MaterialIcons name="arrow-forward" size={16} color={Colors.textOnGold} />
                <Text style={s.ctaBtnText}>Start Verification</Text>
              </LinearGradient>
            </Pressable>
          </>
        ) : request.status === 'pending' ? (
          // ── PENDING ────────────────────────────────────────────────────────
          <>
            <View style={[s.statusCard, { borderColor: `${Colors.gold}44` }]}>
              <LinearGradient
                colors={[`${Colors.gold}12`, `${Colors.gold}04`]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[s.statusIconWrap, { backgroundColor: Colors.goldSurface }]}>
                <MaterialIcons name="hourglass-empty" size={40} color={Colors.gold} />
              </View>
              <Text style={s.statusTitle}>Verification Pending</Text>
              <Text style={s.statusDesc}>
                Your verification request is being reviewed by the Vybz Hub team. You will receive a notification when a decision has been made.
              </Text>
              <Text style={s.statusDate}>Submitted {formatDate(request.created_at)}</Text>
            </View>
            {request.legal_name ? (
              <View style={s.submissionSummary}>
                <Text style={s.summaryTitle}>Submitted Details</Text>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Legal Name</Text>
                  <Text style={s.summaryValue}>{request.legal_name}</Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>ID Type</Text>
                  <Text style={s.summaryValue}>{request.id_type ? ID_TYPE_LABELS[request.id_type as IdType] ?? request.id_type : '—'}</Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>ID Document</Text>
                  <View style={s.summaryUploaded}>
                    <MaterialIcons name="check-circle" size={12} color={Colors.greenLight} />
                    <Text style={s.summaryUploadedText}>Uploaded</Text>
                  </View>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Selfie</Text>
                  <View style={s.summaryUploaded}>
                    <MaterialIcons name="check-circle" size={12} color={Colors.greenLight} />
                    <Text style={s.summaryUploadedText}>Uploaded</Text>
                  </View>
                </View>
              </View>
            ) : null}
            <View style={s.infoCard}>
              <MaterialIcons name="schedule" size={14} color={Colors.textMuted} />
              <Text style={s.infoText}>
                Review typically takes 1–3 business days. Please do not submit duplicate requests.
              </Text>
            </View>
          </>
        ) : request.status === 'approved' ? (
          // ── APPROVED (profile refresh needed) ─────────────────────────────
          <>
            <View style={[s.statusCard, { borderColor: `${Colors.greenLight}44` }]}>
              <LinearGradient
                colors={[`${Colors.greenLight}12`, `${Colors.greenLight}04`]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[s.statusIconWrap, { backgroundColor: `${Colors.greenLight}18` }]}>
                <MaterialIcons name="check-circle" size={40} color={Colors.greenLight} />
              </View>
              <Text style={[s.statusTitle, { color: Colors.greenLight }]}>Verification Approved</Text>
              <Text style={s.statusDesc}>
                Your profile has been verified. The Verified badge is now visible on your public profile and event listings.
              </Text>
              {request.reviewed_at ? (
                <Text style={s.statusDate}>Approved {formatDate(request.reviewed_at)}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={async () => { await refreshProfile(); router.back(); }}
              style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.ctaBtnInner}
              >
                <MaterialIcons name="verified" size={16} color={Colors.textOnGold} />
                <Text style={s.ctaBtnText}>View Verified Profile</Text>
              </LinearGradient>
            </Pressable>
          </>
        ) : (
          // ── REJECTED ──────────────────────────────────────────────────────
          <>
            <View style={[s.statusCard, { borderColor: 'rgba(255,152,0,0.4)' }]}>
              <LinearGradient
                colors={['rgba(255,152,0,0.08)', 'rgba(255,152,0,0.02)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[s.statusIconWrap, { backgroundColor: 'rgba(255,152,0,0.15)' }]}>
                <MaterialIcons name="info" size={40} color="#FF9800" />
              </View>
              <Text style={[s.statusTitle, { color: '#FF9800' }]}>Verification Needs Attention</Text>
              {request.rejection_reason ? (
                <View style={s.rejectionNote}>
                  <Text style={s.rejectionNoteText}>{request.rejection_reason}</Text>
                </View>
              ) : (
                <Text style={s.statusDesc}>
                  Your verification request was not approved at this time. Please update your submission and resubmit.
                </Text>
              )}
              {request.reviewed_at ? (
                <Text style={s.statusDate}>Reviewed {formatDate(request.reviewed_at)}</Text>
              ) : null}
            </View>

            <View style={s.infoCard}>
              <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
              <Text style={s.infoText}>
                You can update your details and resubmit a new request. Make sure your documents are clear and your selfie matches your ID.
              </Text>
            </View>

            <Pressable
              onPress={() => {
                if (request) populateFormFromRequest(request);
                setIdDocUri(null);
                setSelfieUri(null);
                setConsent(false);
                setShowForm(true);
              }}
              style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.ctaBtnInner}
              >
                <MaterialIcons name="refresh" size={16} color={Colors.textOnGold} />
                <Text style={s.ctaBtnText}>Resubmit Verification</Text>
              </LinearGradient>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  content: { padding: Spacing.base, gap: Spacing.base },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  headerSection: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  headerIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: `${Colors.gold}44`,
  },
  headerTitle: { fontSize: 22, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  headerDesc: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  benefitsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.sm,
  },
  benefitsTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: 2 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  benefitText: { fontSize: Typography.sm, color: Colors.textSecondary, flex: 1 },

  requirementsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base, gap: Spacing.md,
  },
  requirementsTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  requirementIcon: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.goldSurface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}33`,
    flexShrink: 0,
  },
  requirementText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },

  noteCard: {
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.25)',
  },
  noteText: { flex: 1, fontSize: Typography.xs, color: '#FFB74D', lineHeight: 18 },

  // Form fields
  field: { gap: Spacing.xs },
  fieldLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  fieldHint: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  required: { color: '#EF5350' },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    fontSize: Typography.base, color: Colors.textPrimary, height: 48,
  },
  textarea: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, minHeight: 110,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  charCount: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'right' },

  // ID type selector
  idTypeRow: { gap: Spacing.sm },
  idTypeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  idTypeBtnSelected: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  idTypeBtnText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  idTypeBtnTextSelected: { color: Colors.textOnGold, fontWeight: Typography.bold },

  // Image upload
  imageUploadBox: {
    height: 160, borderRadius: Radius.xl,
    borderWidth: 2, borderColor: Colors.surfaceBorder, borderStyle: 'dashed',
    backgroundColor: Colors.surface, overflow: 'hidden',
  },
  imageUploadBoxFilled: { borderStyle: 'solid', borderColor: Colors.gold },
  imageUploadContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  imageUploadIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  imageUploadText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  imageUploadHint: { fontSize: Typography.xs, color: Colors.textMuted },
  imagePreviewWrap: { flex: 1, position: 'relative' },
  imagePreview: { flex: 1 },
  imageChangeOverlay: {
    position: 'absolute', bottom: 0, right: 0, left: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  imageChangeText: { fontSize: Typography.xs, color: '#fff', fontWeight: Typography.semibold },
  uploadedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  uploadedText: { fontSize: Typography.xs, color: Colors.greenLight },

  // Consent
  consentRow: {
    flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  checkboxChecked: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  consentText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 19 },

  // Privacy notice
  privacyCard: {
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  privacyText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18 },

  // CTA
  ctaBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  ctaBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  ctaBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Status card
  statusCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden',
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md,
  },
  statusIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  statusTitle: { fontSize: 20, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  statusDesc: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  statusDate: { fontSize: Typography.xs, color: Colors.textMuted },

  verifiedBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  verifiedBadgeText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },

  rejectionNote: {
    backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.25)',
    alignSelf: 'stretch',
  },
  rejectionNoteText: { fontSize: Typography.sm, color: '#FFB74D', lineHeight: 20, textAlign: 'center' },

  infoCard: {
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  infoText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18 },

  // Submission summary
  submissionSummary: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: 0,
  },
  summaryTitle: {
    fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.5, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    gap: Spacing.md,
  },
  summaryLabel: { fontSize: Typography.xs, color: Colors.textMuted, flexShrink: 0 },
  summaryValue: { fontSize: Typography.xs, color: Colors.textPrimary, textAlign: 'right', flex: 1 },
  summaryUploaded: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryUploadedText: { fontSize: Typography.xs, color: Colors.greenLight },
});
