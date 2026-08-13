// app/ticketing/staff/[eventId].tsx
// Event Staff Management.
// Promoter can add/view/revoke scanners and managers for a specific event.
// Staff authorization is event-scoped ONLY — staff cannot access financials, payouts,
// or any other event not explicitly assigned.
// TICKETING_ENABLED gate is applied.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';
import { getSupabaseClient } from '../../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffRole = 'scanner' | 'manager';

interface EventStaffRow {
  id: string;
  event_id: string;
  user_id: string;
  staff_role: StaffRole;
  status: 'active' | 'revoked';
  granted_at: string;
  revoked_at: string | null;
  // Joined from user_profiles
  user_name: string;
  user_email: string;
}

interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

// ─── Role Config ─────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<StaffRole, {
  label: string;
  description: string;
  icon: string;
  color: string;
  permissions: string[];
}> = {
  scanner: {
    label: 'Scanner',
    description: 'Can scan QR codes to check in attendees at the entrance.',
    icon: 'qr-code-scanner',
    color: '#00BCD4',
    permissions: ['Scan ticket QR codes', 'View attendee check-in status'],
  },
  manager: {
    label: 'Manager',
    description: 'Full event-day management: scanning and attendee oversight.',
    icon: 'manage-accounts',
    color: Colors.gold,
    permissions: ['All Scanner permissions', 'View full attendee list', 'Override check-ins'],
  },
};

// ─── Service Functions ────────────────────────────────────────────────────────

async function getEventStaff(eventId: string): Promise<EventStaffRow[]> {
  const supabase = getSupabaseClient();
  // Fetch staff rows
  const { data: staffRows, error } = await supabase
    .from('event_staff')
    .select('id, event_id, user_id, staff_role, status, granted_at, revoked_at')
    .eq('event_id', eventId)
    .eq('status', 'active')
    .order('granted_at', { ascending: false });

  if (error || !staffRows) return [];

  // Fetch user profiles for each staff member
  const userIds = staffRows.map((s: any) => s.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, name, email')
    .in('id', userIds);

  const profileMap: Record<string, { name: string; email: string }> = {};
  (profiles ?? []).forEach((p: any) => {
    profileMap[p.id] = { name: p.name ?? '', email: p.email ?? '' };
  });

  return staffRows.map((s: any) => ({
    ...s,
    user_name: profileMap[s.user_id]?.name ?? 'Unknown',
    user_email: profileMap[s.user_id]?.email ?? '',
  }));
}

async function searchUsers(query: string): Promise<UserSearchResult[]> {
  if (query.trim().length < 2) return [];
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('user_profiles')
    .select('id, name, email')
    .or(`name.ilike.%${query.trim()}%,email.ilike.%${query.trim()}%`)
    .limit(8);
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name ?? '',
    email: p.email ?? '',
  }));
}

async function grantStaff(
  eventId: string,
  userId: string,
  role: StaffRole,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('event_staff')
    .upsert(
      { event_id: eventId, user_id: userId, staff_role: role, status: 'active' },
      { onConflict: 'event_id,user_id' },
    );
  if (error) return { error: error.message };
  return { error: null };
}

async function revokeStaff(staffId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('event_staff')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', staffId);
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Add Staff Modal ──────────────────────────────────────────────────────────

function AddStaffModal({
  visible,
  currentUserId,
  onClose,
  onAdd,
}: {
  visible: boolean;
  currentUserId: string;
  onClose: () => void;
  onAdd: (userId: string, role: StaffRole) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [selectedRole, setSelectedRole] = useState<StaffRole>('scanner');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setSearch(''); setResults([]); setSelectedUser(null);
      setSelectedRole('scanner'); setSaving(false); setError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const found = await searchUsers(search);
      // Exclude self
      setResults(found.filter((u) => u.id !== currentUserId));
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, currentUserId]);

  const handleAdd = async () => {
    if (!selectedUser || !selectedRole) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(selectedUser.id, selectedRole);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to add staff member.');
    }
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={modalStyles.header}>
            <Pressable onPress={onClose} style={({ pressed }) => [{ padding: Spacing.sm }, pressed && { opacity: 0.7 }]}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={modalStyles.headerTitle}>Add Staff Member</Text>
            <Pressable
              onPress={handleAdd}
              disabled={!selectedUser || saving}
              style={({ pressed }) => [
                modalStyles.addBtn,
                (!selectedUser || saving) && { opacity: 0.4 },
                pressed && { opacity: 0.75 },
              ]}
            >
              {saving
                ? <ActivityIndicator color={Colors.textOnGold} size="small" />
                : <Text style={modalStyles.addBtnText}>Add</Text>}
            </Pressable>
          </View>
        </SafeAreaView>

        <ScrollView
          contentContainerStyle={[
            modalStyles.scroll,
            { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {error && (
            <View style={modalStyles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={modalStyles.errorText}>{error}</Text>
            </View>
          )}

          {/* User search */}
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Search User <Text style={modalStyles.required}>*</Text></Text>
            <View style={modalStyles.searchWrap}>
              <MaterialIcons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={modalStyles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Name or email address..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searching && <ActivityIndicator size="small" color={Colors.textMuted} />}
            </View>

            {/* Search results */}
            {results.length > 0 && !selectedUser && (
              <View style={modalStyles.results}>
                {results.map((u) => (
                  <Pressable
                    key={u.id}
                    onPress={() => { setSelectedUser(u); setSearch(u.name || u.email); setResults([]); }}
                    style={({ pressed }) => [modalStyles.resultRow, pressed && { opacity: 0.8 }]}
                  >
                    <View style={modalStyles.resultAvatar}>
                      <Text style={modalStyles.resultAvatarLetter}>
                        {(u.name || u.email || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={modalStyles.resultName} numberOfLines={1}>{u.name || '—'}</Text>
                      <Text style={modalStyles.resultEmail} numberOfLines={1}>{u.email}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Selected user chip */}
            {selectedUser && (
              <View style={modalStyles.selectedChip}>
                <View style={modalStyles.selectedAvatar}>
                  <Text style={modalStyles.selectedAvatarLetter}>
                    {(selectedUser.name || selectedUser.email || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={modalStyles.selectedName}>{selectedUser.name || '—'}</Text>
                  <Text style={modalStyles.selectedEmail}>{selectedUser.email}</Text>
                </View>
                <Pressable onPress={() => { setSelectedUser(null); setSearch(''); }} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
            )}
          </View>

          {/* Role selection */}
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Role <Text style={modalStyles.required}>*</Text></Text>
            {(Object.keys(ROLE_CONFIG) as StaffRole[]).map((role) => {
              const cfg = ROLE_CONFIG[role];
              const isSelected = selectedRole === role;
              return (
                <Pressable
                  key={role}
                  onPress={() => setSelectedRole(role)}
                  style={({ pressed }) => [
                    modalStyles.roleOption,
                    isSelected && { borderColor: cfg.color, backgroundColor: `${cfg.color}10` },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={[modalStyles.roleIcon, { backgroundColor: `${cfg.color}20` }]}>
                    <MaterialIcons name={cfg.icon as any} size={22} color={cfg.color} />
                  </View>
                  <View style={{ flex: 1, gap: Spacing.xs }}>
                    <Text style={[modalStyles.roleLabel, isSelected && { color: cfg.color }]}>
                      {cfg.label}
                    </Text>
                    <Text style={modalStyles.roleDesc}>{cfg.description}</Text>
                    <View style={modalStyles.permissionList}>
                      {cfg.permissions.map((p) => (
                        <View key={p} style={modalStyles.permissionItem}>
                          <MaterialIcons name="check" size={11} color={cfg.color} />
                          <Text style={modalStyles.permissionText}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {isSelected && (
                    <MaterialIcons name="check-circle" size={22} color={cfg.color} style={{ flexShrink: 0 }} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Scope warning */}
          <View style={modalStyles.scopeNote}>
            <MaterialIcons name="shield" size={14} color={Colors.textMuted} />
            <Text style={modalStyles.scopeNoteText}>
              Staff access is scoped to this event only. They cannot access your account, other events, financial data, or payout information.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EventStaffScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();

  const [staff, setStaff] = useState<EventStaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await getEventStaff(eventId);
      setStaff(rows);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load staff.');
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Coming Soon</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!user) {
    router.replace('/auth' as any);
    return null;
  }

  const handleAdd = async (userId: string, role: StaffRole) => {
    const { error: err } = await grantStaff(eventId ?? '', userId, role);
    if (err) throw new Error(err);
    await load();
  };

  const handleRevoke = (staffMember: EventStaffRow) => {
    const confirm = () => {
      revokeStaff(staffMember.id).then(({ error: err }) => {
        if (err) {
          setError(err);
        } else {
          setStaff((prev) => prev.filter((s) => s.id !== staffMember.id));
        }
      });
    };

    if (Platform.OS === 'web') {
      confirm();
    } else {
      Alert.alert(
        'Revoke Access',
        `Remove ${staffMember.user_name || staffMember.user_email} as ${ROLE_CONFIG[staffMember.staff_role].label}? They will immediately lose access to scan or manage this event.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Revoke', style: 'destructive', onPress: confirm },
        ],
      );
    }
  };

  const grouped: Record<StaffRole, EventStaffRow[]> = {
    manager: staff.filter((s) => s.staff_role === 'manager'),
    scanner: staff.filter((s) => s.staff_role === 'scanner'),
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Event Staff</Text>
            <Text style={styles.headerSub}>{staff.length} active member{staff.length !== 1 ? 's' : ''}</Text>
          </View>
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.addBtnInner}>
              <MaterialIcons name="person-add" size={16} color={Colors.textOnGold} />
              <Text style={styles.addBtnText}>Add</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
          ]}
        >
          {/* Security scope callout */}
          <View style={styles.scopeCard}>
            <MaterialIcons name="shield" size={18} color={Colors.gold} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.scopeCardTitle}>Event-Scoped Access</Text>
              <Text style={styles.scopeCardText}>
                Staff members can only access this event. They cannot see your other events, payout information, financial data, or account settings.
              </Text>
            </View>
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Empty state */}
          {staff.length === 0 && (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="people-outline" size={36} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No staff added yet</Text>
              <Text style={styles.emptySub}>
                Add scanners and managers to help run your event.
              </Text>
              <Pressable
                onPress={() => setShowAddModal(true)}
                style={({ pressed }) => [styles.emptyAddBtn, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.emptyAddBtnInner}>
                  <MaterialIcons name="person-add" size={18} color={Colors.textOnGold} />
                  <Text style={styles.emptyAddBtnText}>Add First Staff Member</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* Grouped by role */}
          {(Object.keys(grouped) as StaffRole[]).map((role) => {
            const members = grouped[role];
            if (members.length === 0) return null;
            const cfg = ROLE_CONFIG[role];
            return (
              <View key={role} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.roleIconSmall, { backgroundColor: `${cfg.color}20` }]}>
                    <MaterialIcons name={cfg.icon as any} size={14} color={cfg.color} />
                  </View>
                  <Text style={[styles.sectionTitle, { color: cfg.color }]}>
                    {cfg.label}s ({members.length})
                  </Text>
                </View>
                <View style={styles.card}>
                  {members.map((member, i) => (
                    <React.Fragment key={member.id}>
                      <View style={styles.staffRow}>
                        <View style={styles.staffAvatar}>
                          <Text style={styles.staffAvatarLetter}>
                            {(member.user_name || member.user_email || '?')[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.staffName}>{member.user_name || 'Unknown'}</Text>
                          <Text style={styles.staffEmail} numberOfLines={1}>{member.user_email}</Text>
                          <Text style={styles.staffGranted}>
                            Added {new Date(member.granted_at).toLocaleDateString('en-JM', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => handleRevoke(member)}
                          style={({ pressed }) => [styles.revokeBtn, pressed && { opacity: 0.7 }]}
                          hitSlop={8}
                        >
                          <MaterialIcons name="person-remove" size={16} color={Colors.error} />
                        </Pressable>
                      </View>
                      {i < members.length - 1 && <View style={styles.staffDivider} />}
                    </React.Fragment>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <AddStaffModal
        visible={showAddModal}
        currentUserId={user?.id ?? ''}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAdd}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.gold, fontSize: Typography.base, textDecorationLine: 'underline' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  addBtn: { borderRadius: Radius.full, overflow: 'hidden' },
  addBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: Spacing.md,
  },
  addBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },

  scrollContent: { padding: Spacing.base, gap: Spacing.lg },

  scopeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg,
    padding: Spacing.base, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  scopeCardTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  scopeCardText: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  emptyWrap: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.base },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  emptySub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  emptyAddBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm, width: '100%' },
  emptyAddBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  emptyAddBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },

  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  roleIconSmall: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  staffRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  staffDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginHorizontal: Spacing.base },
  staffAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  staffAvatarLetter: { fontSize: Typography.base, fontWeight: Typography.black, color: Colors.textPrimary },
  staffName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  staffEmail: { fontSize: Typography.xs, color: Colors.textMuted },
  staffGranted: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  revokeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,68,68,0.08)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
});

const modalStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  cancelText: { fontSize: Typography.base, color: Colors.textSecondary },
  headerTitle: { fontSize: Typography.base, fontWeight: Typography.black, color: Colors.textPrimary },
  addBtn: {
    backgroundColor: Colors.gold, borderRadius: Radius.md,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
  },
  addBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  scroll: { padding: Spacing.base, gap: Spacing.xl },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  field: { gap: Spacing.sm },
  label: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  required: { color: Colors.error },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },

  results: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  resultAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  resultAvatarLetter: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  resultName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  resultEmail: { fontSize: Typography.xs, color: Colors.textMuted },

  selectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: `${Colors.greenLight}10`, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.greenLight}33`,
  },
  selectedAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${Colors.greenLight}20`, alignItems: 'center', justifyContent: 'center',
  },
  selectedAvatarLetter: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.greenLight },
  selectedName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.greenLight },
  selectedEmail: { fontSize: Typography.xs, color: Colors.textMuted },

  roleOption: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, marginBottom: Spacing.sm,
  },
  roleIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  roleLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  roleDesc: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },
  permissionList: { gap: 4, marginTop: 4 },
  permissionItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  permissionText: { fontSize: Typography.xs, color: Colors.textMuted },

  scopeNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  scopeNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
});
