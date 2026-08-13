import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Alert, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { UserProfile, SubscriptionTier } from '../constants/data';
import { checkAndSyncExistingPushPermission, requestAndRegisterPushNotifications, removePushToken, PushRegistrationResult } from '../lib/pushNotifications';
import { notifyAdminNewDeletionRequest, notifyPromoterNewFollower, checkAndNotifyBoostExpiry } from '../services/emailService';

// ─── Context Type ─────────────────────────────────────────────────────────────
interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isOnboarded: boolean;
  passwordRecoveryMode: boolean;
  pendingPhone: string;
  followedPromoterIds: string[];
  // Auth methods
  signUp: (name: string, email: string, password: string, roles?: string[], phone?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithPhone: (phone: string) => Promise<void>;
  verifyOTP: (otp: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  // Profile methods
  completeOnboarding: (parish: string, interests: string[]) => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  addPromoterRole: () => Promise<void>;
  toggleFollow: (promoterId: string) => Promise<{ isNowFollowing: boolean }>;
  isFollowing: (promoterId: string) => boolean;
  activateAdmin: () => Promise<void>;
  // NOTE: upgradePlan removed (ISSUE-009). All subscription grants go through
  // verified server-side payment flows. Use admin-grant-subscription Edge Function.
  requireEventApproval: boolean;
  setRequireEventApproval: (value: boolean) => Promise<void>;
  pushTokenStatus: 'idle' | 'registered' | 'failed' | 'denied' | 'web';
  pushTokenError: string | undefined;
  retryPushToken: () => Promise<void>;
  showNotificationModal: boolean;
  dismissNotificationModal: () => void;
  enableNotifications: () => Promise<void>;
  deleteAccount: () => Promise<{ alreadyRequested: boolean }>;
  accountDeleted: boolean;
  // Subscription entitlements (written by Stripe webhook, read-only on client)
  verifiedPromoter: boolean;
  remainingBoosts: number;
  monthlyBoostAllowance: number;
  subscriptionStatus: string;
  currentPeriodEnd?: string;
  stripeCustomerId?: string;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ONBOARDING_KEY = '@vybzhub_onboarded';
const ONBOARDING_DATA_KEY = '@vybzhub_onboarding_data';
const NOTIF_MODAL_SHOWN_KEY = '@vybzhub_notif_modal_shown';

// ─── DB ↔ Model mapping ───────────────────────────────────────────────────────
function mapProfileFromDb(row: any): UserProfile {
  const tier: SubscriptionTier = row.subscription_tier ?? 'free';
  return {
    id: row.id,
    name: row.name || 'Viber',
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    homeParish: row.home_parish || '',
    preferredParishes: row.preferred_parishes ?? [],
    interests: row.interests ?? [],
    roles: row.roles ?? ['attendee'],
    followersCount: 0,
    eventsPosted: 0,
    joinedAt: row.joined_at ?? new Date().toISOString(),
    verified: tier === 'pro' || tier === 'elite',
    subscriptionTier: tier,
    followedPromoters: row.followed_promoters ?? [],
    requireEventApproval: row.require_event_approval ?? false,
    verifiedPromoter: row.verified_promoter ?? false,
    remainingBoosts: row.remaining_boosts ?? 0,
    monthlyBoostAllowance: row.monthly_boost_allowance ?? 0,
    subscriptionStatus: row.subscription_status ?? 'active',
    currentPeriodEnd: row.current_period_end ?? undefined,
    stripeCustomerId: row.stripe_customer_id ?? undefined,
    featuredPriority: row.featured_priority ?? 0,
    avatarUrl: row.avatar_url ?? undefined,
    emailNotifNewParish: row.email_notif_new_parish ?? true,
    emailNotifNewPromoter: row.email_notif_new_promoter ?? true,
    emailNotifEventChange: row.email_notif_event_change ?? true,
    emailNotifEventReminder: row.email_notif_event_reminder ?? true,
    pushNotifNewParish: row.push_notif_new_parish ?? true,
    pushNotifNewPromoter: row.push_notif_new_promoter ?? true,
    pushNotifEventChange: row.push_notif_event_change ?? true,
  };
}

function mapToDbFields(data: Partial<UserProfile>): Record<string, any> {
  const db: Record<string, any> = {};
  if (data.name !== undefined) db.name = data.name;
  if (data.email !== undefined) db.email = data.email;
  if (data.phone !== undefined) db.phone = data.phone;
  if ('homeParish' in data) db.home_parish = data.homeParish;
  if (data.preferredParishes !== undefined) db.preferred_parishes = data.preferredParishes;
  if (data.interests !== undefined) db.interests = data.interests;
  if (data.roles !== undefined) db.roles = data.roles;
  if (data.subscriptionTier !== undefined) db.subscription_tier = data.subscriptionTier;
  if (data.followedPromoters !== undefined) db.followed_promoters = data.followedPromoters;
  if (data.requireEventApproval !== undefined) db.require_event_approval = data.requireEventApproval;
  if ((data as any).verifiedPromoter !== undefined) db.verified_promoter = (data as any).verifiedPromoter;
  if ((data as any).remainingBoosts !== undefined) db.remaining_boosts = (data as any).remainingBoosts;
  if ((data as any).stripeCustomerId !== undefined) db.stripe_customer_id = (data as any).stripeCustomerId;
  if ((data as any).emailNotifNewParish !== undefined) db.email_notif_new_parish = (data as any).emailNotifNewParish;
  if ((data as any).emailNotifNewPromoter !== undefined) db.email_notif_new_promoter = (data as any).emailNotifNewPromoter;
  if ((data as any).emailNotifEventChange !== undefined) db.email_notif_event_change = (data as any).emailNotifEventChange;
  if ((data as any).emailNotifEventReminder !== undefined) db.email_notif_event_reminder = (data as any).emailNotifEventReminder;
  if ((data as any).pushNotifNewParish !== undefined) db.push_notif_new_parish = (data as any).pushNotifNewParish;
  if ((data as any).pushNotifNewPromoter !== undefined) db.push_notif_new_promoter = (data as any).pushNotifNewPromoter;
  if ((data as any).pushNotifEventChange !== undefined) db.push_notif_event_change = (data as any).pushNotifEventChange;
  if ((data as any).avatarUrl !== undefined) db.avatar_url = (data as any).avatarUrl;
  return db;
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [pushTokenStatus, setPushTokenStatus] = useState<'idle' | 'registered' | 'failed' | 'denied' | 'web'>('idle');
  const [pushTokenError, setPushTokenError] = useState<string | undefined>();
  const [requireEventApproval, setRequireEventApprovalState] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const mountedRef = useRef(true);
  // Tracks the current user id inside the auth-state-change callback
  // without adding `user` to the initialization effect's dependency array
  // (which would rebuild the Supabase subscription on every profile update).
  const userIdRef = useRef<string | undefined>(undefined);
  // Tracks the last time we did a foreground-return session check so we
  // don't hammer the server on rapid state transitions (e.g., system dialogs).
  const lastForegroundCheckRef = useRef<number>(0);

  // ── Profile fetch ────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!mountedRef.current) return;

    if (data && !error) {
      const profile = mapProfileFromDb(data);
      setUser(profile);

      // Silent sync: refresh push token only if permission is already granted.
      // The branded notification modal (shown after first sign-in) is the only
      // place where requestPermissionsAsync() is triggered.
      checkAndSyncExistingPushPermission(userId).then((result: PushRegistrationResult) => {
        if (!mountedRef.current) return;
        setPushTokenStatus(result.status);
        setPushTokenError(result.status === 'failed' ? result.error : undefined);
      });

      // Onboarding: mark complete if homeParish is set OR AsyncStorage flag exists
      if (profile.homeParish) {
        setIsOnboarded(true);
      } else {
        // Try to apply pending onboarding data saved before sign-in
        try {
          const pendingRaw = await AsyncStorage.getItem(ONBOARDING_DATA_KEY);
          if (pendingRaw) {
            const { parish, interests } = JSON.parse(pendingRaw);
            if (parish) {
              await supabase.from('user_profiles').update({
                home_parish: parish,
                interests: interests ?? [],
              }).eq('id', userId);
              if (mountedRef.current) {
                setUser((prev) => prev ? { ...prev, homeParish: parish, interests: interests ?? [] } : null);
                setIsOnboarded(true);
              }
            }
          }
        } catch {}
      }
    }
  }, []);

  // ── Load global require_event_approval from admin_settings ─────────────
  // Readable by all roles (anon SELECT policy); no auth required.
  // Replaces per-admin user_profiles.require_event_approval with a single
  // shared value so all admins see the same moderation state.
  const loadRequireApproval = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'require_event_approval')
        .maybeSingle();
      if (data && mountedRef.current) setRequireEventApprovalState(data.value === true);
    } catch {}
  }, []);

  // ── Initialise session ───────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // Load global admin_settings on startup (anon-readable, no auth required)
    loadRequireApproval();

    // Check AsyncStorage onboarding flag (guest users)
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      if (val === 'true' && mountedRef.current) setIsOnboarded(true);
    });

    // Restore existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (mountedRef.current) setIsLoading(false);
        });
      } else {
        if (mountedRef.current) setIsLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_IN' && session?.user) {
        await fetchProfile(session.user.id);
        // Show branded notification explanation on first sign-in only.
        // We check AFTER fetchProfile so the user object is ready.
        const alreadyShown = await AsyncStorage.getItem(NOTIF_MODAL_SHOWN_KEY);
        if (!alreadyShown && mountedRef.current) {
          setShowNotificationModal(true);
        }
        // Check for expiring boosts (fire-and-forget; server deduplicates within 48h)
        void checkAndNotifyBoostExpiry();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setPasswordRecoveryMode(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryMode(true);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Always refresh profile on token renewal — subscription/role changes
        // server-side (e.g., webhook updating subscription_tier) will be
        // reflected without requiring sign-out/sign-in.
        await fetchProfile(session.user.id);
      } else if (event === 'USER_UPDATED' && session?.user) {
        await fetchProfile(session.user.id);
      }
    });

    // App state — pause/resume auto-refresh + foreground session check
    const appSub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
        // On foreground return, verify the session is still valid and
        // refresh the user profile (catches subscription/role changes that
        // occurred while the app was backgrounded). Throttle to once per
        // 60 seconds to avoid hammering the server on rapid state transitions.
        const now = Date.now();
        if (now - lastForegroundCheckRef.current > 60_000) {
          lastForegroundCheckRef.current = now;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user && mountedRef.current) {
              await fetchProfile(session.user.id);
            }
          } catch {
            // Graceful — network may be temporarily unavailable
          }
        }
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      appSub.remove();
    };
  }, [fetchProfile, loadRequireApproval]);

  // Keep the ref in sync with the latest user id on every render.
  // This allows the auth-state-change callback above to check the current
  // user without closing over stale state.
  userIdRef.current = user?.id;

  // ── Real-time deletion-approval watch ────────────────────────────────────
  // Subscribes to the user's own account_deletion_requests row.
  // When an admin approves the request (status → 'approved'), the account has
  // already been deleted server-side; we sign the client out and surface the
  // accountDeleted flag so the root layout can redirect to onboarding.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`deletion-watch-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'account_deletion_requests',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if ((payload.new as any)?.status === 'approved') {
            if (mountedRef.current) setAccountDeleted(true);
            // Sign out silently — the account no longer exists in auth.
            supabase.auth.signOut().catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // userId is the stable primitive dep; re-subscribe when user id changes
  }, [userId]);

  // ── Auth methods ─────────────────────────────────────────────────────────

  const signUp = async (name: string, email: string, password: string, roles?: string[], phone?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, roles: roles ?? ['attendee'], phone: phone ?? '' } },
    });
    if (error) throw error;
    // onAuthStateChange handles the rest; trigger reads roles from metadata
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signInWithPhone = async (phone: string) => {
    // Requires Twilio configured in Supabase → Phone auth settings
    setPendingPhone(phone);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      setPendingPhone('');
      throw error;
    }
  };

  const verifyOTP = async (otp: string) => {
    if (!pendingPhone) throw new Error('No pending phone number');
    const { error } = await supabase.auth.verifyOtp({
      phone: pendingPhone,
      token: otp,
      type: 'sms',
    });
    if (error) throw error;
    setPendingPhone('');
  };

  const signInWithGoogle = async () => {
    // Requires Google provider configured in Supabase Auth settings
    throw new Error('Google sign-in requires OAuth configuration. Coming soon.');
  };

  const signInWithApple = async () => {
    // Requires Apple provider configured in Supabase Auth settings
    throw new Error('Apple sign-in requires OAuth configuration. Coming soon.');
  };

  const signOut = async () => {
    // Remove push token first (RLS requires active session). Never let a
    // push-token error block the sign-out flow on iOS or any other platform.
    if (user?.id) await removePushToken(user.id).catch(() => {});

    // On web, clear localStorage before calling signOut so Supabase does not
    // immediately re-hydrate the session from stale storage on the next render.
    if (typeof window !== 'undefined' && window.localStorage) {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => window.localStorage.removeItem(k));
    }

    await supabase.auth.signOut();
    await AsyncStorage.multiRemove([ONBOARDING_KEY, ONBOARDING_DATA_KEY]).catch(() => {});
    if (mountedRef.current) {
      setUser(null);
      setIsOnboarded(false);
      setPasswordRecoveryMode(false);
    }
  };

  const resetPassword = async (email: string) => {
    // Supabase Auth has a 10-second SMTP connection timeout. When the Postal
    // SMTP server is under load, the first 1-3 attempts may exceed that limit
    // ("context deadline exceeded" / HTTP 504). Retry up to 4 times with a
    // short gap so the user clicks once and the app resolves automatically.
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'vybzhub://auth',
      });
      if (!error) return; // Delivered — exit immediately

      const msg = (error.message ?? '').toLowerCase();
      const code = ((error as any).code ?? '').toLowerCase();
      const status = (error as any).status as number | undefined;

      // Only retry on SMTP-timeout signals. Validation / rate-limit errors
      // should surface immediately without wasting 3 more attempts.
      const isRetryable =
        msg.includes('context deadline') ||
        msg.includes('request_timeout') ||
        msg.includes('timeout') ||
        code === 'request_timeout' ||
        status === 504;

      if (!isRetryable || attempt === maxAttempts) throw error;

      // 2-second pause before next attempt; keeps total wait under ~40s
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setPasswordRecoveryMode(false);
  };

  // ── Profile methods ──────────────────────────────────────────────────────

  const completeOnboarding = async (parish: string, interests: string[]) => {
    await AsyncStorage.setItem(ONBOARDING_DATA_KEY, JSON.stringify({ parish, interests }));
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOnboarded(true);

    // If signed in, save to Supabase too
    if (user) {
      await supabase.from('user_profiles').update({
        home_parish: parish,
        interests,
      }).eq('id', user.id);
      setUser((prev) => prev ? { ...prev, homeParish: parish, interests } : null);
    }
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const dbFields = mapToDbFields(data);
    if (Object.keys(dbFields).length > 0) {
      await supabase.from('user_profiles').update(dbFields).eq('id', user.id);
    }
    setUser((prev) => prev ? { ...prev, ...data } : null);
  };

  const addPromoterRole = async () => {
    if (!user || user.roles.includes('promoter')) return;
    const newRoles = [...user.roles, 'promoter'] as UserProfile['roles'];
    await updateProfile({ roles: newRoles });
  };

  const activateAdmin = async () => {
    throw new Error('Admin access must be granted by an existing administrator.');
  };

  // ISSUE-009 FIX: upgradePlan permanently removed.
  // Client-side entitlement grants bypass payment verification entirely.
  // All subscription changes must go through:
  //   - Stripe: stripe-webhook Edge Function
  //   - Apple:  verify-apple-transaction Edge Function
  //   - Google: verify-google-purchase Edge Function
  //   - Admin:  admin-grant-subscription Edge Function

  const toggleFollow = async (promoterId: string): Promise<{ isNowFollowing: boolean }> => {
    if (!user) return { isNowFollowing: false };
    const current = user.followedPromoters ?? [];
    const isCurrentlyFollowing = current.includes(promoterId);
    const updated = isCurrentlyFollowing
      ? current.filter((id) => id !== promoterId)
      : [...current, promoterId];
    await updateProfile({ followedPromoters: updated });

    // Dual-write to the dedicated follows table for scalable server-side fan-out
    // queries (e.g., "who follows promoter X" without scanning all user_profiles).
    // RLS ensures only the follower can manage their own follow records.
    if (isCurrentlyFollowing) {
      supabase.from('follows').delete()
        .match({ follower_id: user.id, promoter_id: promoterId })
        .then(() => {}, () => {});
    } else {
      supabase.from('follows').upsert(
        { follower_id: user.id, promoter_id: promoterId },
        { onConflict: 'follower_id,promoter_id' }
      ).then(() => {}, () => {});
      // Notify the promoter of their new follower (fire-and-forget)
      void notifyPromoterNewFollower(promoterId, user.id);
    }

    return { isNowFollowing: !isCurrentlyFollowing };
  };

  const isFollowing = (promoterId: string) =>
    (user?.followedPromoters ?? []).includes(promoterId);

  const setRequireEventApproval = async (value: boolean) => {
    setRequireEventApprovalState(value); // optimistic update
    await supabase.from('admin_settings').upsert(
      { key: 'require_event_approval', value, updated_by: user?.id ?? null },
      { onConflict: 'key' }
    );
  };

  const retryPushToken = async () => {
    if (!user) return;
    setPushTokenStatus('idle');
    setPushTokenError(undefined);
    // Use the full-request variant since user explicitly chose to retry.
    const result = await requestAndRegisterPushNotifications(user.id);
    if (mountedRef.current) {
      setPushTokenStatus(result.status);
      setPushTokenError(result.status === 'failed' ? result.error : undefined);
    }
    // After an explicit retry, if still denied offer to open Settings.
    // Do NOT auto-open Settings — only offer it.
    if (result.status === 'denied' && mountedRef.current) {
      Alert.alert(
        'Notifications Blocked',
        'Vybz Hub does not have notification permission. Open your device settings to enable notifications.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const dismissNotificationModal = () => {
    setShowNotificationModal(false);
    AsyncStorage.setItem(NOTIF_MODAL_SHOWN_KEY, 'true').catch(() => {});
  };

  const enableNotifications = async () => {
    setShowNotificationModal(false);
    AsyncStorage.setItem(NOTIF_MODAL_SHOWN_KEY, 'true').catch(() => {});
    if (!user) return;
    const result = await requestAndRegisterPushNotifications(user.id);
    if (mountedRef.current) {
      setPushTokenStatus(result.status);
      setPushTokenError(result.status === 'failed' ? result.error : undefined);
    }
    // If the OS denied permission (user tapped "Don't Allow" or had previously
    // denied permanently), surface the same Settings redirect that retryPushToken
    // shows — otherwise the user sees a silent failure with no explanation.
    if (result.status === 'denied' && mountedRef.current) {
      Alert.alert(
        'Notifications Blocked',
        'Vybz Hub does not have notification permission. Open your device settings to enable notifications.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const deleteAccount = async (): Promise<{ alreadyRequested: boolean }> => {
    if (!user) throw new Error('Not signed in');

    // Check for an existing pending request — avoid duplicate submissions.
    const { data: existing } = await supabase
      .from('account_deletion_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) return { alreadyRequested: true };

    // Submit deletion request via client-side insert (RLS enforced).
    // The actual account deletion happens only after an admin approves
    // the request via the delete-account Edge Function (admin-only path).
    const { error } = await supabase
      .from('account_deletion_requests')
      .insert({
        user_id: user.id,
        user_email: user.email ?? null,
        user_name: user.name ?? null,
      });

    if (error) throw new Error(error.message);

    // Notify all admins of the new deletion request (fire-and-forget).
    // Fetch the inserted request ID so admins can deep-link to it.
    const { data: inserted } = await supabase
      .from('account_deletion_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inserted?.id) {
      void notifyAdminNewDeletionRequest(inserted.id);
    }

    return { alreadyRequested: false };
  };

  // ── Derived values ───────────────────────────────────────────────────────
  // requireEventApproval is now managed as component state loaded from
  // admin_settings (global) — not derived from user_profiles (per-admin).
  const followedPromoterIds = user?.followedPromoters ?? [];

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isOnboarded,
        passwordRecoveryMode,
        pendingPhone,
        followedPromoterIds,
        signUp,
        signInWithEmail,
        signInWithPhone,
        verifyOTP,
        signInWithGoogle,
        signInWithApple,
        signOut,
        resetPassword,
        updatePassword,
        completeOnboarding,
        updateProfile,
        addPromoterRole,
        toggleFollow,
        isFollowing,
        activateAdmin,
        requireEventApproval,
        setRequireEventApproval,
        pushTokenStatus,
        pushTokenError,
        retryPushToken,
        showNotificationModal,
        dismissNotificationModal,
        enableNotifications,
        deleteAccount,
        accountDeleted,
        verifiedPromoter: user?.verifiedPromoter ?? false,
        remainingBoosts: user?.remainingBoosts ?? 0,
        monthlyBoostAllowance: user?.monthlyBoostAllowance ?? 0,
        subscriptionStatus: user?.subscriptionStatus ?? 'active',
        currentPeriodEnd: user?.currentPeriodEnd,
        stripeCustomerId: user?.stripeCustomerId,
        refreshProfile: async () => { if (user) await fetchProfile(user.id); },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
