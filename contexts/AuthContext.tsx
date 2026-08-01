import React, { createContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, SubscriptionTier } from '../constants/data';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isOnboarded: boolean;
  pendingPhone: string;
  followedPromoterIds: string[];
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithPhone: (phone: string) => Promise<void>;
  verifyOTP: (otp: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: (parish: string, interests: string[]) => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  addPromoterRole: () => Promise<void>;
  toggleFollow: (promoterId: string) => Promise<{ isNowFollowing: boolean }>;
  isFollowing: (promoterId: string) => boolean;
  activateAdmin: () => Promise<void>;
  upgradePlan: (tier: SubscriptionTier) => Promise<void>;
  requireEventApproval: boolean;
  setRequireEventApproval: (value: boolean) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER: '@yaadvybz_user',
  ONBOARDED: '@yaadvybz_onboarded',
  ONBOARDING_DATA: '@yaadvybz_onboarding_data',
  FOLLOWED_PROMOTERS: '@yaadvybz_followed_promoters',
  REQUIRE_APPROVAL: '@yaadvybz_require_approval',
};

function buildUserFromEmail(email: string): UserProfile {
  const rawName = email.split('@')[0].replace(/[._]/g, ' ');
  const name = rawName.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    id: `user_${Date.now()}`,
    name,
    email,
    homeParish: '',
    interests: [],
    roles: ['attendee'],
    followersCount: 0,
    eventsPosted: 0,
    joinedAt: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [followedPromoterIds, setFollowedPromoterIds] = useState<string[]>([]);
  const [requireEventApproval, setRequireEventApprovalState] = useState(false);

  useEffect(() => {
    loadStoredUser();
  }, []);

  const loadStoredUser = async () => {
    try {
      const [userData, onboarded, followedRaw, approvalRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER),
        AsyncStorage.getItem(STORAGE_KEYS.ONBOARDED),
        AsyncStorage.getItem(STORAGE_KEYS.FOLLOWED_PROMOTERS),
        AsyncStorage.getItem(STORAGE_KEYS.REQUIRE_APPROVAL),
      ]);
      if (userData) setUser(JSON.parse(userData));
      if (onboarded === 'true') setIsOnboarded(true);
      if (followedRaw) setFollowedPromoterIds(JSON.parse(followedRaw));
      if (approvalRaw === 'true') setRequireEventApprovalState(true);
    } catch (e) {
      // silent fail
    } finally {
      setIsLoading(false);
    }
  };

  const saveUser = async (userData: UserProfile) => {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
    setUser(userData);
  };

  const getOnboardingData = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_DATA);
      if (raw) return JSON.parse(raw) as { parish: string; interests: string[] };
    } catch (_) {}
    return { parish: '', interests: [] };
  };

  const signInWithEmail = async (email: string, _password: string) => {
    const onboardingData = await getOnboardingData();
    const newUser = buildUserFromEmail(email);
    newUser.homeParish = onboardingData.parish;
    newUser.interests = onboardingData.interests;
    await saveUser(newUser);
  };

  const signInWithPhone = async (phone: string) => {
    setPendingPhone(phone);
  };

  const verifyOTP = async (_otp: string) => {
    const onboardingData = await getOnboardingData();
    const newUser: UserProfile = {
      id: `user_${Date.now()}`,
      name: 'Island Viber',
      phone: pendingPhone,
      homeParish: onboardingData.parish,
      interests: onboardingData.interests,
      roles: ['attendee'],
      followersCount: 0,
      eventsPosted: 0,
      joinedAt: new Date().toISOString(),
    };
    await saveUser(newUser);
    setPendingPhone('');
  };

  const signInWithGoogle = async () => {
    const onboardingData = await getOnboardingData();
    const newUser: UserProfile = {
      id: `google_${Date.now()}`,
      name: 'Google Viber',
      email: 'you@gmail.com',
      homeParish: onboardingData.parish,
      interests: onboardingData.interests,
      roles: ['attendee'],
      followersCount: 0,
      eventsPosted: 0,
      joinedAt: new Date().toISOString(),
    };
    await saveUser(newUser);
  };

  const signInWithApple = async () => {
    const onboardingData = await getOnboardingData();
    const newUser: UserProfile = {
      id: `apple_${Date.now()}`,
      name: 'Apple Viber',
      email: 'you@icloud.com',
      homeParish: onboardingData.parish,
      interests: onboardingData.interests,
      roles: ['attendee'],
      followersCount: 0,
      eventsPosted: 0,
      joinedAt: new Date().toISOString(),
    };
    await saveUser(newUser);
  };

  const signOut = async () => {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER,
      STORAGE_KEYS.ONBOARDED,
      STORAGE_KEYS.ONBOARDING_DATA,
      STORAGE_KEYS.FOLLOWED_PROMOTERS,
    ]);
    setUser(null);
    setIsOnboarded(false);
    setFollowedPromoterIds([]);
  };

  const completeOnboarding = async (parish: string, interests: string[]) => {
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_DATA, JSON.stringify({ parish, interests }));
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDED, 'true');
    setIsOnboarded(true);
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const updated = { ...user, ...data };
    await saveUser(updated);
  };

  const addPromoterRole = async () => {
    if (!user || user.roles.includes('promoter')) return;
    const updated: UserProfile = { ...user, roles: [...user.roles, 'promoter'] };
    await saveUser(updated);
  };

  const activateAdmin = async () => {
    if (!user || user.roles.includes('admin')) return;
    const updated: UserProfile = { ...user, roles: [...user.roles, 'admin'] };
    await saveUser(updated);
  };

  const upgradePlan = async (tier: SubscriptionTier) => {
    if (!user) return;
    // Set expiry 1 month from now (mock)
    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);
    const roles = [...user.roles];
    if (tier !== 'free' && !roles.includes('promoter')) roles.push('promoter');
    const updated: UserProfile = {
      ...user,
      subscriptionTier: tier,
      subscriptionExpiresAt: tier === 'free' ? undefined : expires.toISOString(),
      verified: tier === 'elite' ? true : user.verified,
      roles,
    };
    await saveUser(updated);
  };

  const toggleFollow = async (promoterId: string): Promise<{ isNowFollowing: boolean }> => {
    const current = followedPromoterIds;
    const isCurrentlyFollowing = current.includes(promoterId);
    const updated = isCurrentlyFollowing
      ? current.filter((id) => id !== promoterId)
      : [...current, promoterId];
    setFollowedPromoterIds(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.FOLLOWED_PROMOTERS, JSON.stringify(updated));
    return { isNowFollowing: !isCurrentlyFollowing };
  };

  const isFollowing = (promoterId: string) => followedPromoterIds.includes(promoterId);

  const setRequireEventApproval = async (value: boolean) => {
    setRequireEventApprovalState(value);
    await AsyncStorage.setItem(STORAGE_KEYS.REQUIRE_APPROVAL, value ? 'true' : 'false');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isOnboarded,
        pendingPhone,
        followedPromoterIds,
        signInWithEmail,
        signInWithPhone,
        verifyOTP,
        signInWithGoogle,
        signInWithApple,
        signOut,
        completeOnboarding,
        updateProfile,
        addPromoterRole,
        toggleFollow,
        isFollowing,
        activateAdmin,
        upgradePlan,
        requireEventApproval,
        setRequireEventApproval,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
