import React, { createContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NotificationRecord } from '../constants/data';
import { supabase } from '../lib/supabase';

interface NotificationsContextType {
  notifications: NotificationRecord[];
  unreadCount: number;
  addNotification: (n: Omit<NotificationRecord, 'id' | 'read' | 'createdAt'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  scheduleEventReminder: (eventId: string, eventTitle: string, eventDate: string, startTime: string) => Promise<void>;
  cancelEventReminder: (eventId: string) => Promise<void>;
}

export const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const STORAGE_KEY = '@vybzhub_notifications';
const REMINDER_IDS_KEY = '@vybzhub_reminder_ids';

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status: existing } = await ExpoNotifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await ExpoNotifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (_) {
    return false;
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [reminderIds, setReminderIds] = useState<Record<string, string>>({});
  // Stable ref to current user ID — avoids stale closures without adding to deps
  const currentUserIdRef = useRef<string | null>(null);

  // ── Local data load on mount ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [stored, rids] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(REMINDER_IDS_KEY),
        ]);
        if (stored) setNotifications(JSON.parse(stored));
        if (rids) setReminderIds(JSON.parse(rids));
      } catch (_) {}
    })();
    // NOTE: Permission is NOT requested here.
    // The branded notification explanation modal (shown after first sign-in)
    // is the only place where requestPermissionsAsync() is triggered.
  }, []);

  // ── Supabase auth listener — load/sync on sign-in ─────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      currentUserIdRef.current = uid;
      if (uid) loadFromSupabase(uid);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      currentUserIdRef.current = uid;
      if (event === 'SIGNED_IN' && uid) {
        loadFromSupabase(uid);
      } else if (event === 'SIGNED_OUT') {
        currentUserIdRef.current = null;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Load from Supabase (replaces local state for authenticated users) ──────
  const loadFromSupabase = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data && data.length > 0) {
        const records: NotificationRecord[] = data.map((row: any) => ({
          id: row.id,
          type: row.type as any,
          title: row.title,
          body: row.body,
          eventId: row.event_id ?? undefined,
          read: row.read,
          createdAt: row.created_at,
        }));
        setNotifications(records);
        persist(records);
      }
    } catch (_) {}
  }, []);

  const persist = (items: NotificationRecord[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  };

  const persistReminderIds = (ids: Record<string, string>) => {
    AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(ids)).catch(() => {});
  };

  // DB UUIDs are 36-char with dashes; local temp IDs start with 'notif_'
  const isDbId = (id: string) => !id.startsWith('notif_');

  // ── Core notification actions ─────────────────────────────────────────────

  const addNotification = useCallback(
    (n: Omit<NotificationRecord, 'id' | 'read' | 'createdAt'>) => {
      const record: NotificationRecord = {
        ...n,
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        read: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications((prev) => {
        const updated = [record, ...prev].slice(0, 100);
        persist(updated);
        return updated;
      });
      // Background Supabase sync for authenticated users
      const uid = currentUserIdRef.current;
      if (uid) {
        supabase.from('notifications').insert({
          user_id: uid,
          type: n.type,
          title: n.title,
          body: n.body || '',
          event_id: n.eventId || null,
          read: false,
        }).then(() => {}).catch(() => {});
      }
    },
    []
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      persist(updated);
      return updated;
    });
    if (isDbId(id)) {
      supabase.from('notifications').update({ read: true }).eq('id', id)
        .then(() => {}).catch(() => {});
    }
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      persist(updated);
      return updated;
    });
    const uid = currentUserIdRef.current;
    if (uid) {
      supabase.from('notifications').update({ read: true })
        .eq('user_id', uid).eq('read', false)
        .then(() => {}).catch(() => {});
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      persist(updated);
      return updated;
    });
    if (isDbId(id)) {
      supabase.from('notifications').delete().eq('id', id)
        .then(() => {}).catch(() => {});
    }
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    persist([]);
    const uid = currentUserIdRef.current;
    if (uid) {
      supabase.from('notifications').delete().eq('user_id', uid)
        .then(() => {}).catch(() => {});
    }
  }, []);

  // ── Foreground push → in-app list ─────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = ExpoNotifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      const notifType = data?.type as string | undefined;
      if (!notifType || !title) return;

      // Server-persisted pushes: the Edge Function already inserted the in-app
      // DB row for this user. Reload from Supabase so the notification appears
      // in the list without creating a local duplicate.
      if (data?.server_persisted === '1') {
        const uid = currentUserIdRef.current;
        if (uid) loadFromSupabase(uid);
        return;
      }

      // Non-server-persisted pushes (e.g. test push, local triggers): create
      // the in-app record locally as before.
      addNotification({
        type: notifType as any,
        title,
        body: body ?? '',
        eventId: (data?.eventId as string | undefined) ?? undefined,
      });
    });
    return () => sub.remove();
  }, [addNotification, loadFromSupabase]);

  // ── Local scheduled reminder ───────────────────────────────────────────────
  const scheduleEventReminder = useCallback(
    async (eventId: string, eventTitle: string, eventDate: string, startTime: string) => {
      if (Platform.OS === 'web') return;
      const granted = await requestPermissions();
      if (!granted) return;
      try {
        // Parse 12-hour start time to 24-hour hours/minutes
        let hours = 0;
        let minutes = 0;
        const timeParts = startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (timeParts) {
          hours = parseInt(timeParts[1], 10);
          minutes = parseInt(timeParts[2], 10);
          const meridiem = timeParts[3].toUpperCase();
          if (meridiem === 'PM' && hours !== 12) hours += 12;
          if (meridiem === 'AM' && hours === 12) hours = 0;
        }
        // Construct the event start as an absolute UTC timestamp by treating the
        // stored date/time as Jamaica local time (America/Jamaica = UTC-5).
        // Jamaica observes NO daylight saving time, so -05:00 is always correct.
        // Parsing an ISO-8601 string with an explicit offset means the resulting
        // Date holds the exact UTC moment regardless of the user's device timezone —
        // a user in New York (UTC-4 EDT), London (UTC+1 BST), or Los Angeles
        // (UTC-7 PDT) will all have the reminder fire exactly 2 hours before the
        // Jamaica event start time.
        const pad2 = (n: number) => String(n).padStart(2, '0');
        const eventStart = new Date(`${eventDate}T${pad2(hours)}:${pad2(minutes)}:00-05:00`);
        const reminderTime = new Date(eventStart.getTime() - 2 * 60 * 60 * 1000);
        await cancelEventReminder(eventId);
        if (reminderTime > new Date()) {
          const identifier = await ExpoNotifications.scheduleNotificationAsync({
            content: {
              title: 'Event Reminder',
              body: `${eventTitle} starts in 2 hours! Get ready 🇯🇲`,
              data: { eventId },
              sound: true,
            },
            trigger: { type: ExpoNotifications.SchedulableTriggerInputTypes.DATE, date: reminderTime },
          });
          const updated = { ...reminderIds, [eventId]: identifier };
          setReminderIds(updated);
          persistReminderIds(updated);
        }
        addNotification({
          type: 'event_reminder',
          title: 'Reminder Set',
          body: `You will be reminded 2 hours before "${eventTitle}"`,
          eventId,
        });
      } catch (_) {}
    },
    [reminderIds, addNotification]
  );

  const cancelEventReminder = useCallback(
    async (eventId: string) => {
      if (Platform.OS === 'web') return;
      try {
        const identifier = reminderIds[eventId];
        if (identifier) {
          await ExpoNotifications.cancelScheduledNotificationAsync(identifier);
          const updated = { ...reminderIds };
          delete updated[eventId];
          setReminderIds(updated);
          persistReminderIds(updated);
        }
      } catch (_) {}
    },
    [reminderIds]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      ExpoNotifications.setBadgeCountAsync(unreadCount).catch(() => {});
    }
  }, [unreadCount]);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markRead,
        markAllRead,
        removeNotification,
        clearAll,
        scheduleEventReminder,
        cancelEventReminder,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
