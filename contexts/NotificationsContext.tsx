import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NotificationRecord, NotificationType } from '../constants/data';
import { emailRsvpReminder } from '../services/emailService';

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

// Configure notification handler
ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
  // Map eventId -> expo notification identifier
  const [reminderIds, setReminderIds] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
    requestPermissions();
  }, []);

  const loadData = async () => {
    try {
      const [stored, rids] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(REMINDER_IDS_KEY),
      ]);
      if (stored) setNotifications(JSON.parse(stored));
      if (rids) setReminderIds(JSON.parse(rids));
    } catch (_) {}
  };

  const persist = async (items: NotificationRecord[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (_) {}
  };

  const persistReminderIds = async (ids: Record<string, string>) => {
    try {
      await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(ids));
    } catch (_) {}
  };

  const addNotification = useCallback(
    (n: Omit<NotificationRecord, 'id' | 'read' | 'createdAt'>) => {
      const record: NotificationRecord = {
        ...n,
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        read: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications((prev) => {
        const updated = [record, ...prev].slice(0, 100); // Keep last 100
        persist(updated);
        return updated;
      });
    },
    []
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      persist(updated);
      return updated;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      persist(updated);
      return updated;
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      persist(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    persist([]);
  }, []);

  // Schedule a local push notification for an event reminder
  const scheduleEventReminder = useCallback(
    async (eventId: string, eventTitle: string, eventDate: string, startTime: string) => {
      if (Platform.OS === 'web') return;
      const granted = await requestPermissions();
      if (!granted) return;

      // Parse event date + start time into a trigger date
      // startTime format: "4:00 PM"
      try {
        const dateObj = new Date(eventDate);
        const timeParts = startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (timeParts) {
          let hours = parseInt(timeParts[1], 10);
          const minutes = parseInt(timeParts[2], 10);
          const meridiem = timeParts[3].toUpperCase();
          if (meridiem === 'PM' && hours !== 12) hours += 12;
          if (meridiem === 'AM' && hours === 12) hours = 0;
          dateObj.setHours(hours, minutes, 0, 0);
        }

        // Trigger 2 hours before event
        const reminderTime = new Date(dateObj.getTime() - 2 * 60 * 60 * 1000);
        const now = new Date();

        // Cancel any existing reminder for this event
        await cancelEventReminder(eventId);

        if (reminderTime > now) {
          const identifier = await ExpoNotifications.scheduleNotificationAsync({
            content: {
              title: "Event Reminder",
              body: `${eventTitle} starts in 2 hours! Get ready 🇯🇲`,
              data: { eventId },
              sound: true,
            },
            trigger: { type: ExpoNotifications.SchedulableTriggerInputTypes.DATE, date: reminderTime },
          });

          const updated = { ...reminderIds, [eventId]: identifier };
          setReminderIds(updated);
          await persistReminderIds(updated);
        }

        // Also add an in-app notification record immediately
        addNotification({
          type: 'event_reminder',
          title: 'Reminder Set',
          body: `You will be reminded 2 hours before "${eventTitle}"`,
          eventId,
        });
        // Fire email reminder (non-blocking; respects user's emailNotifEventReminder pref)
        emailRsvpReminder({
          eventTitle,
          eventId,
          date: eventDate,
          startTime,
        });
      } catch (_) {
        // Silently fail — notification scheduling is best-effort
      }
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
          await persistReminderIds(updated);
        }
      } catch (_) {}
    },
    [reminderIds]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

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
