import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { UserProfile, SubscriptionTier } from '../constants/data';
import { registerPushToken, removePushToken, PushRegistrationResult } from '../lib/pushNotifications';

// ─── Context Type ─────────────────────────────────────────────────────────────
interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isOnboarded: boolean;
  passwordRecoveryMode: boolean;
  pendingPhone: string;
  followedPromoterIds: string[];
  // Auth methods
  signUp: (name: string, email: string, password: string, roles?: string[]) => Promise<void>;
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
  upgradePlan: (tier: SubscriptionTier) => Promise<void>;
  requireEventApproval: boolean;
  setRequireEventApproval: (value: boolean) => Promise<void>;
  pushTokenStatus: 'idle' | 'registered' | 'failed' | 'denied' | 'web';
  pushTokenError: string | undefined;
  retryPushToken: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ONBOARDING_KEY = '@vybzhub_onboarded';
const ONBOARDING_DATA_KEY = '@vybzhub_onboarding_data';

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
  if ((data as any).emailNotifNewParish !== undefined) db.email_notif_new_parish = (data as any).emailNotifNewParish;
  if ((data as any).emailNotifNewPromoter !== undefined) db.email_notif_new_promoter = (data as any).emailNotifNewPromoter;
  if ((data as any).emailNotifEventChange !== undefined) db.email_notif_event_change = (data as any).emailNotifEventChange;
  if ((data as any).emailNotifEventReminder !== undefined) db.email_notif_event_reminder = (data as any).emailNotifEventReminder;
  if ((data as any).pushNotifNewParish !== undefined) db.push_notif_new_parish = (data as any).pushNotifNewParish;
  if ((data as any).pushNotifNewPromoter !== undefined) db.push_notif_new_promoter = (data as any).pushNotifNewPromoter;
  if ((data as any).pushNotifEventChange !== undefined) db.push_notif_event_change = (data as any).pushNotifEventChange;
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
  const mountedRef = useRef(true);

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

      // Register push token for this device (fire-and-forget — never blocks UI)
      registerPushToken(userId).then((result: PushRegistrationResult) => {
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
        } catch (_) {}
      }
    }
  }, []);

  // ── Initialise session ───────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

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
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setPasswordRecoveryMode(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryMode(true);
      } else if (event === 'TOKEN_REFRESHED' && session?.user && !user) {
        await fetchProfile(session.user.id);
      }
    });

    // App state — pause/resume auto-refresh
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      appSub.remove();
    };
  }, [fetchProfile]);

  // ── Auth methods ─────────────────────────────────────────────────────────

  const signUp = async (name: string, email: string, password: string, roles?: string[]) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, roles: roles ?? ['attendee'] } },
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
    // Await token removal BEFORE destroying the session — the RLS delete
    // requires auth.uid() to still be valid. Fire-and-forget was causing the
    // session to be cleared first, making the delete fail silently.
    if (user?.id) await removePushToken(user.id);
    await supabase.auth.signOut();
    await AsyncStorage.multiRemove([ONBOARDING_KEY, ONBOARDING_DATA_KEY]);
    setUser(null);
    setIsOnboarded(false);
    setPasswordRecoveryMode(false);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'onspaceapp://auth',
    });
    if (error) throw error;
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
    // Admin role cannot be self-assigned — the database enforces this at the trigger level.
    // To grant admin: Supabase Dashboard → Table Editor → user_profiles → edit the roles column.
    throw new Error('Admin access must be granted by an existing administrator.');
  };

  const upgradePlan = async (tier: SubscriptionTier) => {
    if (!user) return;
    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);
    await updateProfile({
      subscriptionTier: tier,
      subscriptionExpiresAt: tier === 'free' ? undefined : expires.toISOString(),
      verified: tier === 'pro' || tier === 'elite',
    });
  };

  const toggleFollow = async (promoterId: string): Promise<{ isNowFollowing: boolean }> => {
    if (!user) return { isNowFollowing: false };
    const current = user.followedPromoters ?? [];
    const isCurrentlyFollowing = current.includes(promoterId);
    const updated = isCurrentlyFollowing
      ? current.filter((id) => id !== promoterId)
      : [...current, promoterId];
    await updateProfile({ followedPromoters: updated });
    return { isNowFollowing: !isCurrentlyFollowing };
  };

  const isFollowing = (promoterId: string) =>
    (user?.followedPromoters ?? []).includes(promoterId);

  const setRequireEventApproval = async (value: boolean) => {
    await updateProfile({ requireEventApproval: value });
  };

  const retryPushToken = async () => {
    if (!user) return;
    setPushTokenStatus('idle');
    setPushTokenError(undefined);
    const result = await registerPushToken(user.id);
    if (mountedRef.current) {
      setPushTokenStatus(result.status);
      setPushTokenError(result.status === 'failed' ? result.error : undefined);
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const requireEventApproval = user?.requireEventApproval ?? false;
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
        upgradePlan,
        requireEventApproval,
        setRequireEventApproval,
        pushTokenStatus,
        pushTokenError,
        retryPushToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
