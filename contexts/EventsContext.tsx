import React, { createContext, useState, useEffect, ReactNode, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Event, EventStatus } from '../constants/data';
import { supabase } from '../lib/supabase';

interface EventsContextType {
  events: Event[];
  allEvents: Event[];
  userGoingIds: string[];
  userInterestedIds: string[];
  userBookmarkIds: string[];
  // Returns false if user is not authenticated — caller should show sign-in prompt
  toggleGoing: (eventId: string) => boolean;
  toggleInterested: (eventId: string) => boolean;
  toggleBookmark: (eventId: string) => boolean;
  postEvent: (eventData: Omit<Event, 'id' | 'goingCount' | 'interestedCount' | 'featured' | 'status'>, initialStatus?: EventStatus) => string;
  editEvent: (id: string, updatedData: Partial<Event>) => void;
  deleteEvent: (id: string) => void;
  flagEvent: (id: string, reason: string) => void;
  approveEvent: (id: string) => void;
  rejectEvent: (id: string, reason: string) => void;
  getEventById: (id: string) => Event | undefined;
  getFeaturedEvents: () => Event[];
  getEventsByParish: (parish: string) => Event[];
  getEventsByType: (type: string) => Event[];
  getUserPostedEvents: (promoterId: string) => Event[];
  getPromoterEvents: (promoterId: string) => Event[];
  getPendingEvents: () => Event[];
  getFlaggedEvents: () => Event[];
  boostEvent: (id: string, days: number) => void;
  getBoostedEvents: () => Event[];
}

export const EventsContext = createContext<EventsContextType | undefined>(undefined);

const STORAGE_KEY = '@vybzhub_user_events';

export function EventsProvider({ children }: { children: ReactNode }) {
  const [allEventsState, setAllEventsState] = useState<Event[]>([]);
  const [userGoingIds, setUserGoingIds] = useState<string[]>([]);
  const [userInterestedIds, setUserInterestedIds] = useState<string[]>([]);
  const [userBookmarkIds, setUserBookmarkIds] = useState<string[]>([]);
  const [userPostedEvents, setUserPostedEvents] = useState<Event[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Always-current snapshot — prevents stale closure captures inside setState callbacks
  const latestRef = useRef({ userGoingIds, userInterestedIds, userPostedEvents, userBookmarkIds, currentUserId });
  latestRef.current = { userGoingIds, userInterestedIds, userPostedEvents, userBookmarkIds, currentUserId };

  // Load posted events from AsyncStorage on mount (events are local; RSVPs come from Supabase)
  useEffect(() => {
    loadUserEventData();
  }, []);

  // Subscribe to Supabase auth — load RSVPs when signed in, clear them on sign-out
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) loadRsvpsFromSupabase(uid);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        loadRsvpsFromSupabase(uid);
      } else {
        // Sign-out: discard local RSVP state — Supabase is the source of truth
        setUserGoingIds([]);
        setUserInterestedIds([]);
        setUserBookmarkIds([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Supabase RSVP loader ──────────────────────────────────────────────────
  const loadRsvpsFromSupabase = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_rsvps')
        .select('event_id, status')
        .eq('user_id', userId);
      if (error || !data) return;
      setUserGoingIds(data.filter((r) => r.status === 'going').map((r) => r.event_id));
      setUserInterestedIds(data.filter((r) => r.status === 'interested').map((r) => r.event_id));
      setUserBookmarkIds(data.filter((r) => r.status === 'bookmarked').map((r) => r.event_id));
    } catch (_) {}
  };

  // ── AsyncStorage (posted events only) ─────────────────────────────────────
  const loadUserEventData = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const postedEvents = parsed.postedEvents ?? [];
        if (postedEvents.length > 0) {
          setUserPostedEvents(postedEvents);
          setAllEventsState([...postedEvents]);
        }
      }
    } catch (_) {}
  };

  const persistPostedEvents = async (posted: Event[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ postedEvents: posted }));
    } catch (_) {}
  };

  // ── Derived event lists ────────────────────────────────────────────────────
  const events = allEventsState.filter((e) => e.status === 'live');
  const allEvents = allEventsState;

  // ── RSVP Toggles (return false when user is not authenticated) ─────────────
  const toggleGoing = (eventId: string): boolean => {
    const uid = latestRef.current.currentUserId;
    if (!uid) return false; // unauthenticated — caller shows sign-in prompt

    setUserGoingIds((prev) => {
      const wasGoing = prev.includes(eventId);
      const updated = wasGoing ? prev.filter((id) => id !== eventId) : [...prev, eventId];
      const delta = wasGoing ? -1 : 1;

      setAllEventsState((evts) =>
        evts.map((e) => e.id === eventId ? { ...e, goingCount: Math.max(0, e.goingCount + delta) } : e)
      );
      const updatedPosted = latestRef.current.userPostedEvents.map((e) =>
        e.id === eventId ? { ...e, goingCount: Math.max(0, e.goingCount + delta) } : e
      );
      setUserPostedEvents(updatedPosted);
      persistPostedEvents(updatedPosted);

      // Sync to Supabase (fire-and-forget; optimistic UI already updated)
      if (wasGoing) {
        supabase.from('user_rsvps').delete()
          .match({ user_id: uid, event_id: eventId, status: 'going' }).then(() => {});
      } else {
        supabase.from('user_rsvps')
          .upsert({ user_id: uid, event_id: eventId, status: 'going' }, { onConflict: 'user_id,event_id,status' })
          .then(() => {});
      }

      return updated;
    });
    return true;
  };

  const toggleInterested = (eventId: string): boolean => {
    const uid = latestRef.current.currentUserId;
    if (!uid) return false;

    setUserInterestedIds((prev) => {
      const wasInterested = prev.includes(eventId);
      const updated = wasInterested ? prev.filter((id) => id !== eventId) : [...prev, eventId];
      const delta = wasInterested ? -1 : 1;

      setAllEventsState((evts) =>
        evts.map((e) => e.id === eventId ? { ...e, interestedCount: Math.max(0, e.interestedCount + delta) } : e)
      );
      const updatedPosted = latestRef.current.userPostedEvents.map((e) =>
        e.id === eventId ? { ...e, interestedCount: Math.max(0, e.interestedCount + delta) } : e
      );
      setUserPostedEvents(updatedPosted);
      persistPostedEvents(updatedPosted);

      if (wasInterested) {
        supabase.from('user_rsvps').delete()
          .match({ user_id: uid, event_id: eventId, status: 'interested' }).then(() => {});
      } else {
        supabase.from('user_rsvps')
          .upsert({ user_id: uid, event_id: eventId, status: 'interested' }, { onConflict: 'user_id,event_id,status' })
          .then(() => {});
      }

      return updated;
    });
    return true;
  };

  const toggleBookmark = (eventId: string): boolean => {
    const uid = latestRef.current.currentUserId;
    if (!uid) return false;

    setUserBookmarkIds((prev) => {
      const wasBookmarked = prev.includes(eventId);
      const updated = wasBookmarked ? prev.filter((id) => id !== eventId) : [...prev, eventId];

      if (wasBookmarked) {
        supabase.from('user_rsvps').delete()
          .match({ user_id: uid, event_id: eventId, status: 'bookmarked' }).then(() => {});
      } else {
        supabase.from('user_rsvps')
          .upsert({ user_id: uid, event_id: eventId, status: 'bookmarked' }, { onConflict: 'user_id,event_id,status' })
          .then(() => {});
      }

      return updated;
    });
    return true;
  };

  // ── Event CRUD (local AsyncStorage; no Supabase backend for posted events yet) ──
  const postEvent = (
    eventData: Omit<Event, 'id' | 'goingCount' | 'interestedCount' | 'featured' | 'status'>,
    initialStatus: EventStatus = 'live'
  ): string => {
    const newId = `user_event_${Date.now()}`;
    const newEvent: Event = {
      ...eventData,
      id: newId,
      goingCount: 0,
      interestedCount: 0,
      featured: false,
      status: initialStatus,
    };
    setUserPostedEvents((prev) => {
      const updated = [newEvent, ...prev];
      setAllEventsState([newEvent, ...prev]);
      persistPostedEvents(updated);
      return updated;
    });
    return newId;
  };

  const editEvent = (id: string, updatedData: Partial<Event>) => {
    setUserPostedEvents((prev) => {
      const updated = prev.map((e) => (e.id === id ? { ...e, ...updatedData } : e));
      setAllEventsState([...updated]);
      persistPostedEvents(updated);
      return updated;
    });
  };

  const deleteEvent = (id: string) => {
    setUserPostedEvents((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      setAllEventsState([...updated]);
      persistPostedEvents(updated);
      return updated;
    });
    setUserGoingIds((prev) => prev.filter((gid) => gid !== id));
    setUserInterestedIds((prev) => prev.filter((iid) => iid !== id));
    setUserBookmarkIds((prev) => prev.filter((bid) => bid !== id));
    // Clean up RSVPs from Supabase for this event
    const uid = latestRef.current.currentUserId;
    if (uid) {
      supabase.from('user_rsvps').delete().match({ user_id: uid, event_id: id }).then(() => {});
    }
  };

  const flagEvent = (id: string, reason: string) => {
    setAllEventsState((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, status: 'flagged' as EventStatus, flagReason: reason, reportCount: (e.reportCount ?? 0) + 1 }
          : e
      )
    );
    setUserPostedEvents((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, status: 'flagged' as EventStatus, flagReason: reason, reportCount: (e.reportCount ?? 0) + 1 }
          : e
      )
    );
  };

  const approveEvent = (id: string) => {
    setAllEventsState((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'live' as EventStatus, flagReason: undefined } : e))
    );
    setUserPostedEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'live' as EventStatus, flagReason: undefined } : e))
    );
  };

  const rejectEvent = (id: string, reason: string) => {
    setAllEventsState((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: 'rejected' as EventStatus, rejectedReason: reason } : e
      )
    );
    setUserPostedEvents((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: 'rejected' as EventStatus, rejectedReason: reason } : e
      )
    );
  };

  const getEventById = (id: string) => allEventsState.find((e) => e.id === id);
  const getFeaturedEvents = () => events.filter((e) => e.featured);
  const getEventsByParish = (parish: string) => events.filter((e) => e.parish === parish);
  const getEventsByType = (type: string) =>
    events.filter(
      (e) => e.type === type || (Array.isArray(e.eventTypes) && e.eventTypes.includes(type))
    );
  const getUserPostedEvents = (promoterId: string) =>
    allEventsState.filter((e) => e.promoterId === promoterId);
  const getPromoterEvents = (promoterId: string) =>
    events.filter((e) => e.promoterId === promoterId);
  const getPendingEvents = () => allEventsState.filter((e) => e.status === 'pending');
  const getFlaggedEvents = () => allEventsState.filter((e) => e.status === 'flagged');

  const boostEvent = (id: string, days: number) => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    setAllEventsState((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, boosted: true, boostExpiresAt: expiresAt.toISOString(), boostImpressions: e.boostImpressions ?? 0 }
          : e
      )
    );
    setUserPostedEvents((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, boosted: true, boostExpiresAt: expiresAt.toISOString(), boostImpressions: e.boostImpressions ?? 0 }
          : e
      )
    );
  };

  const getBoostedEvents = () =>
    allEventsState.filter((e) => e.status === 'live' && e.boosted);

  return (
    <EventsContext.Provider
      value={{
        events,
        allEvents,
        userGoingIds,
        userInterestedIds,
        userBookmarkIds,
        toggleGoing,
        toggleInterested,
        toggleBookmark,
        postEvent,
        editEvent,
        deleteEvent,
        flagEvent,
        approveEvent,
        rejectEvent,
        getEventById,
        getFeaturedEvents,
        getEventsByParish,
        getEventsByType,
        getUserPostedEvents,
        getPromoterEvents,
        getPendingEvents,
        getFlaggedEvents,
        boostEvent,
        getBoostedEvents,
      }}
    >
      {children}
    </EventsContext.Provider>
  );
}
