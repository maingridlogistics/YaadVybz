import React, { createContext, useState, useEffect, ReactNode, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Event, MOCK_EVENTS, EventStatus } from '../constants/data';

interface EventsContextType {
  events: Event[];              // live events only
  allEvents: Event[];           // all events including pending/flagged (for admin)
  userGoingIds: string[];
  userInterestedIds: string[];
  userBookmarkIds: string[];
  toggleGoing: (eventId: string) => void;
  toggleInterested: (eventId: string) => void;
  toggleBookmark: (eventId: string) => void;
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

const STORAGE_KEY = '@yaadvybz_user_events';

export function EventsProvider({ children }: { children: ReactNode }) {
  // Start with no events — MOCK_EVENTS kept only as an empty-placeholder array
  const [allEventsState, setAllEventsState] = useState<Event[]>([]);
  const [userGoingIds, setUserGoingIds] = useState<string[]>([]);
  const [userInterestedIds, setUserInterestedIds] = useState<string[]>([]);
  const [userBookmarkIds, setUserBookmarkIds] = useState<string[]>([]);
  const [userPostedEvents, setUserPostedEvents] = useState<Event[]>([]);

  // Always-current snapshot — updated synchronously on every render so that
  // functional setState callbacks never capture stale sibling state values.
  const latestRef = useRef({ userGoingIds, userInterestedIds, userPostedEvents, userBookmarkIds });
  latestRef.current = { userGoingIds, userInterestedIds, userPostedEvents, userBookmarkIds };

  useEffect(() => {
    loadUserEventData();
  }, []);

  const loadUserEventData = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { goingIds, interestedIds, bookmarkIds, postedEvents } = JSON.parse(stored);
        if (goingIds) setUserGoingIds(goingIds);
        if (interestedIds) setUserInterestedIds(interestedIds);
        if (bookmarkIds) setUserBookmarkIds(bookmarkIds);
        if (postedEvents && postedEvents.length > 0) {
          setUserPostedEvents(postedEvents);
          setAllEventsState([...postedEvents]);
        }
      }
    } catch (_) {}
  };

  const persistUserData = async (
    goingIds: string[],
    interestedIds: string[],
    posted: Event[],
    bookmarkIds: string[] = []
  ) => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ goingIds, interestedIds, bookmarkIds, postedEvents: posted })
      );
    } catch (_) {}
  };

  // Only live events are exposed to regular screens
  const events = allEventsState.filter((e) => e.status === 'live');
  const allEvents = allEventsState;

  const toggleGoing = (eventId: string) => {
    setUserGoingIds((prev) => {
      const wasGoing = prev.includes(eventId);
      const updated = wasGoing ? prev.filter((id) => id !== eventId) : [...prev, eventId];
      setAllEventsState((evts) =>
        evts.map((e) =>
          e.id === eventId ? { ...e, goingCount: e.goingCount + (wasGoing ? -1 : 1) } : e
        )
      );
      persistUserData(updated, latestRef.current.userInterestedIds, latestRef.current.userPostedEvents, latestRef.current.userBookmarkIds);
      return updated;
    });
  };

  const toggleInterested = (eventId: string) => {
    setUserInterestedIds((prev) => {
      const wasInterested = prev.includes(eventId);
      const updated = wasInterested
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId];
      setAllEventsState((evts) =>
        evts.map((e) =>
          e.id === eventId
            ? { ...e, interestedCount: e.interestedCount + (wasInterested ? -1 : 1) }
            : e
        )
      );
      persistUserData(latestRef.current.userGoingIds, updated, latestRef.current.userPostedEvents, latestRef.current.userBookmarkIds);
      return updated;
    });
  };

  const toggleBookmark = (eventId: string) => {
    setUserBookmarkIds((prev) => {
      const updated = prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId];
      persistUserData(latestRef.current.userGoingIds, latestRef.current.userInterestedIds, latestRef.current.userPostedEvents, updated);
      return updated;
    });
  };

  const postEvent = (eventData: Omit<Event, 'id' | 'goingCount' | 'interestedCount' | 'featured' | 'status'>, initialStatus: EventStatus = 'live'): string => {
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
      persistUserData(userGoingIds, userInterestedIds, updated, userBookmarkIds);
      return updated;
    });
    return newId;
  };

  const editEvent = (id: string, updatedData: Partial<Event>) => {
    setUserPostedEvents((prev) => {
      const updated = prev.map((e) => (e.id === id ? { ...e, ...updatedData } : e));
      setAllEventsState([...updated]);
      persistUserData(userGoingIds, userInterestedIds, updated, userBookmarkIds);
      return updated;
    });
  };

  const deleteEvent = (id: string) => {
    setUserPostedEvents((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      setAllEventsState([...updated]);
      persistUserData(userGoingIds, userInterestedIds, updated, userBookmarkIds);
      return updated;
    });
    setUserGoingIds((prev) => prev.filter((gid) => gid !== id));
    setUserInterestedIds((prev) => prev.filter((iid) => iid !== id));
    setUserBookmarkIds((prev) => prev.filter((bid) => bid !== id));
  };

  const flagEvent = (id: string, reason: string) => {
    setAllEventsState((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, status: 'flagged' as EventStatus, flagReason: reason, reportCount: (e.reportCount ?? 0) + 1 }
          : e
      )
    );
    // Also update in userPostedEvents if applicable
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
