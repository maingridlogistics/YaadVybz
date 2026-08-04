import React, { createContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { Event, EventStatus } from '../constants/data';
import { supabase } from '../lib/supabase';

// ─── Context Type ─────────────────────────────────────────────────────────────
interface EventsContextType {
  events: Event[];           // live events only (RLS-filtered)
  allEvents: Event[];        // all statuses — admin sees pending/flagged/rejected too
  userGoingIds: string[];
  userInterestedIds: string[];
  userBookmarkIds: string[];
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  refreshEvents: () => Promise<void>;
  // Returns false if user is not authenticated — caller shows sign-in prompt
  toggleGoing: (eventId: string) => boolean;
  toggleInterested: (eventId: string) => boolean;
  toggleBookmark: (eventId: string) => boolean;
  // Async CRUD — optimistic updates applied immediately, DB write follows
  postEvent: (
    eventData: Omit<Event, 'id' | 'goingCount' | 'interestedCount' | 'featured' | 'status'>,
    initialStatus?: EventStatus
  ) => Promise<string>;
  editEvent: (id: string, updatedData: Partial<Event>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  flagEvent: (id: string, reason: string) => Promise<void>;
  approveEvent: (id: string) => Promise<void>;
  rejectEvent: (id: string, reason: string) => Promise<void>;
  boostEvent: (id: string, days: number) => Promise<void>;
  // Query helpers (derived from in-memory state)
  getEventById: (id: string) => Event | undefined;
  getFeaturedEvents: () => Event[];
  getEventsByParish: (parish: string) => Event[];
  getEventsByType: (type: string) => Event[];
  getUserPostedEvents: (promoterId: string) => Event[];
  getPromoterEvents: (promoterId: string) => Event[];
  getPendingEvents: () => Event[];
  getFlaggedEvents: () => Event[];
  getBoostedEvents: () => Event[];
}

export const EventsContext = createContext<EventsContextType | undefined>(undefined);

// ─── DB ↔ Model mapping ───────────────────────────────────────────────────────
function mapEventFromDb(row: any): Event {
  return {
    id: row.id,
    title: row.title ?? '',
    description: row.description ?? '',
    type: row.type ?? '',
    typeLabel: row.type_label ?? '',
    eventTypes: row.event_types ?? [],
    parish: row.parish ?? '',
    date: row.date ?? '',
    startTime: row.start_time ?? '',
    endTime: row.end_time ?? '',
    venue: row.venue ?? '',
    address: row.address ?? '',
    coverImage: row.cover_image ?? '',
    flyerImages: row.flyer_images ?? [],
    ticketPrice: row.ticket_price ?? 'Free',
    ticketLink: row.ticket_link ?? '',
    dressCode: row.dress_code ?? undefined,
    ageLimit: row.age_limit ?? 'All Ages',
    lineup: row.lineup ?? [],
    lineupEntries: row.lineup_entries ?? [],
    recurring: row.recurring ?? false,
    recurringFrequency: row.recurring_frequency ?? undefined,
    promoterId: row.promoter_id ?? '',
    promoterName: row.promoter_name ?? '',
    goingCount: row.going_count ?? 0,
    interestedCount: row.interested_count ?? 0,
    viewCount: row.view_count ?? 0,
    featured: row.featured ?? false,
    tags: row.tags ?? [],
    status: row.status ?? 'live',
    flagReason: row.flag_reason ?? undefined,
    rejectedReason: row.rejected_reason ?? undefined,
    reportCount: row.report_count ?? 0,
    eventPhotosLink: row.event_photos_link ?? undefined,
    boosted: row.boosted ?? false,
    boostExpiresAt: row.boost_expires_at ?? undefined,
    boostImpressions: row.boost_impressions ?? 0,
    sellingTicketsInApp: row.selling_tickets_in_app ?? false,
    ticketCommissionPct: row.ticket_commission_pct ?? 5,
    ticketsSold: row.tickets_sold ?? 0,
  };
}

function mapEventToDb(event: Partial<Event>): Record<string, any> {
  const db: Record<string, any> = {};
  if (event.title !== undefined) db.title = event.title;
  if (event.description !== undefined) db.description = event.description;
  if (event.type !== undefined) db.type = event.type;
  if (event.typeLabel !== undefined) db.type_label = event.typeLabel;
  if (event.eventTypes !== undefined) db.event_types = event.eventTypes;
  if (event.parish !== undefined) db.parish = event.parish;
  if (event.date !== undefined) db.date = event.date;
  if (event.startTime !== undefined) db.start_time = event.startTime;
  if (event.endTime !== undefined) db.end_time = event.endTime;
  if (event.venue !== undefined) db.venue = event.venue;
  if (event.address !== undefined) db.address = event.address;
  if (event.coverImage !== undefined) db.cover_image = event.coverImage;
  if (event.flyerImages !== undefined) db.flyer_images = event.flyerImages;
  if (event.ticketPrice !== undefined) db.ticket_price = event.ticketPrice;
  if (event.ticketLink !== undefined) db.ticket_link = event.ticketLink;
  if ('dressCode' in event) db.dress_code = event.dressCode ?? null;
  if (event.ageLimit !== undefined) db.age_limit = event.ageLimit;
  if (event.lineup !== undefined) db.lineup = event.lineup;
  if (event.lineupEntries !== undefined) db.lineup_entries = event.lineupEntries;
  if (event.recurring !== undefined) db.recurring = event.recurring;
  if ('recurringFrequency' in event) db.recurring_frequency = event.recurringFrequency ?? null;
  if (event.promoterId !== undefined) db.promoter_id = event.promoterId;
  if (event.promoterName !== undefined) db.promoter_name = event.promoterName;
  if (event.featured !== undefined) db.featured = event.featured;
  if (event.tags !== undefined) db.tags = event.tags;
  if (event.status !== undefined) db.status = event.status;
  if ('flagReason' in event) db.flag_reason = event.flagReason ?? null;
  if ('rejectedReason' in event) db.rejected_reason = event.rejectedReason ?? null;
  if (event.reportCount !== undefined) db.report_count = event.reportCount;
  if ('eventPhotosLink' in event) db.event_photos_link = event.eventPhotosLink ?? null;
  if (event.boosted !== undefined) db.boosted = event.boosted;
  if ('boostExpiresAt' in event) db.boost_expires_at = event.boostExpiresAt ?? null;
  if (event.boostImpressions !== undefined) db.boost_impressions = event.boostImpressions;
  return db;
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function EventsProvider({ children }: { children: ReactNode }) {
  const [allEventsState, setAllEventsState] = useState<Event[]>([]);
  const [userGoingIds, setUserGoingIds] = useState<string[]>([]);
  const [userInterestedIds, setUserInterestedIds] = useState<string[]>([]);
  const [userBookmarkIds, setUserBookmarkIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Always-current snapshot to prevent stale closures inside setState callbacks
  const latestRef = useRef({ currentUserId, userGoingIds, userInterestedIds, userBookmarkIds });
  latestRef.current = { currentUserId, userGoingIds, userInterestedIds, userBookmarkIds };
  // In-flight guard — prevents duplicate Supabase calls on rapid double-tap of RSVP buttons
  const processingRef = useRef<Set<string>>(new Set());

  // ── Load all accessible events from Supabase ───────────────────────────────
  // RLS automatically filters: unauthenticated → live only; auth → live + own; admin → all
  // useCallback gives a stable reference so downstream effects don't re-register on every render.
  const loadEvents = useCallback(async () => {
    try {
      setError(null);
      const { data, error: queryError } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      if (queryError) {
        console.warn('[EventsContext] loadEvents error:', queryError.message);
        setError('Could not load events. Please check your connection and try again.');
        return;
      }
      if (data) setAllEventsState(data.map(mapEventFromDb));
    } catch (e) {
      console.warn('[EventsContext] loadEvents unexpected error:', e);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // ── Load RSVP state from Supabase for the current user ─────────────────────
  const loadRsvpsFromSupabase = async (userId: string) => {
    try {
      const { data, error: rsvpError } = await supabase
        .from('user_rsvps')
        .select('event_id, status')
        .eq('user_id', userId);
      if (rsvpError || !data) return;
      setUserGoingIds(data.filter((r) => r.status === 'going').map((r) => r.event_id));
      setUserInterestedIds(data.filter((r) => r.status === 'interested').map((r) => r.event_id));
      setUserBookmarkIds(data.filter((r) => r.status === 'bookmarked').map((r) => r.event_id));
    } catch (_) {}
  };

  // ── Initial load + real-time subscription ─────────────────────────────────
  useEffect(() => {
    loadEvents();

    // Subscribe to events table changes — keeps all connected clients in sync
    const channel = supabase
      .channel('public:events')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'events' },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const newEvt = mapEventFromDb(payload.new);
            setAllEventsState((prev) => {
              if (prev.find((e) => e.id === newEvt.id)) return prev; // deduplicate
              return [newEvt, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            // Real-time carries the true counts from the DB (trigger-maintained)
            const updated = mapEventFromDb(payload.new);
            setAllEventsState((prev) =>
              prev.map((e) => (e.id === updated.id ? updated : e))
            );
          } else if (payload.eventType === 'DELETE') {
            setAllEventsState((prev) => prev.filter((e) => e.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Auth subscription — reload events on auth change, clear RSVPs on sign-out ──
  useEffect(() => {
    // Restore session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        loadRsvpsFromSupabase(uid);
        loadEvents(); // Reload with auth context → shows own pending events
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        loadRsvpsFromSupabase(uid);
        loadEvents();
      } else {
        // Sign-out: clear local RSVP state; reload events as unauthenticated
        setUserGoingIds([]);
        setUserInterestedIds([]);
        setUserBookmarkIds([]);
        loadEvents();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── RSVP Toggles ──────────────────────────────────────────────────────────
  // Synchronous boolean return — false signals caller to show sign-in prompt.
  // Optimistic UI update happens immediately; DB write is fire-and-forget.
  // The real-time subscription receives the DB trigger's count update and
  // settles the displayed going_count / interested_count to the true value.

  const toggleGoing = (eventId: string): boolean => {
    const uid = latestRef.current.currentUserId;
    if (!uid) return false;

    // Rate-limit: 400ms debounce per event prevents duplicate API calls on rapid double-tap
    const goingKey = `going_${eventId}`;
    if (processingRef.current.has(goingKey)) return true;
    processingRef.current.add(goingKey);
    setTimeout(() => processingRef.current.delete(goingKey), 400);

    setUserGoingIds((prev) => {
      const wasGoing = prev.includes(eventId);
      const updated = wasGoing ? prev.filter((id) => id !== eventId) : [...prev, eventId];
      const delta = wasGoing ? -1 : 1;

      // Optimistic count update
      setAllEventsState((evts) =>
        evts.map((e) =>
          e.id === eventId ? { ...e, goingCount: Math.max(0, e.goingCount + delta) } : e
        )
      );

      // Persist to Supabase (DB trigger will update events.going_count, real-time confirms)
      if (wasGoing) {
        supabase.from('user_rsvps').delete()
          .match({ user_id: uid, event_id: eventId, status: 'going' }).then(() => {});
      } else {
        supabase.from('user_rsvps')
          .upsert(
            { user_id: uid, event_id: eventId, status: 'going' },
            { onConflict: 'user_id,event_id,status' }
          ).then(() => {});
      }

      return updated;
    });
    return true;
  };

  const toggleInterested = (eventId: string): boolean => {
    const uid = latestRef.current.currentUserId;
    if (!uid) return false;

    // Rate-limit: 400ms debounce per event prevents duplicate API calls on rapid double-tap
    const interestedKey = `interested_${eventId}`;
    if (processingRef.current.has(interestedKey)) return true;
    processingRef.current.add(interestedKey);
    setTimeout(() => processingRef.current.delete(interestedKey), 400);

    setUserInterestedIds((prev) => {
      const wasInterested = prev.includes(eventId);
      const updated = wasInterested
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId];
      const delta = wasInterested ? -1 : 1;

      setAllEventsState((evts) =>
        evts.map((e) =>
          e.id === eventId ? { ...e, interestedCount: Math.max(0, e.interestedCount + delta) } : e
        )
      );

      if (wasInterested) {
        supabase.from('user_rsvps').delete()
          .match({ user_id: uid, event_id: eventId, status: 'interested' }).then(() => {});
      } else {
        supabase.from('user_rsvps')
          .upsert(
            { user_id: uid, event_id: eventId, status: 'interested' },
            { onConflict: 'user_id,event_id,status' }
          ).then(() => {});
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
      const updated = wasBookmarked
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId];

      if (wasBookmarked) {
        supabase.from('user_rsvps').delete()
          .match({ user_id: uid, event_id: eventId, status: 'bookmarked' }).then(() => {});
      } else {
        supabase.from('user_rsvps')
          .upsert(
            { user_id: uid, event_id: eventId, status: 'bookmarked' },
            { onConflict: 'user_id,event_id,status' }
          ).then(() => {});
      }

      return updated;
    });
    return true;
  };

  // ── Event CRUD (Supabase) ─────────────────────────────────────────────────

  const postEvent = async (
    eventData: Omit<Event, 'id' | 'goingCount' | 'interestedCount' | 'featured' | 'status'>,
    initialStatus: EventStatus = 'live'
  ): Promise<string> => {
    const dbData = {
      ...mapEventToDb(eventData as Partial<Event>),
      going_count: 0,
      interested_count: 0,
      featured: false,
      status: initialStatus,
    };

    const { data, error: insertError } = await supabase
      .from('events')
      .insert(dbData)
      .select()
      .single();

    if (insertError) throw new Error(`Failed to post event: ${insertError.message}`);

    const newEvent = mapEventFromDb(data);
    // Optimistic insert (real-time will also arrive; deduplicate in handler)
    setAllEventsState((prev) => {
      if (prev.find((e) => e.id === newEvent.id)) return prev;
      return [newEvent, ...prev];
    });

    return data.id as string;
  };

  const editEvent = async (id: string, updatedData: Partial<Event>): Promise<void> => {
    // Optimistic update
    setAllEventsState((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updatedData } : e))
    );

    const { error: editError } = await supabase
      .from('events')
      .update(mapEventToDb(updatedData))
      .eq('id', id);

    if (editError) {
      console.warn('[EventsContext] editEvent error:', editError.message);
      loadEvents(); // Revert via reload
    }
  };

  const deleteEvent = async (id: string): Promise<void> => {
    // Optimistic removal
    setAllEventsState((prev) => prev.filter((e) => e.id !== id));
    setUserGoingIds((prev) => prev.filter((gid) => gid !== id));
    setUserInterestedIds((prev) => prev.filter((iid) => iid !== id));
    setUserBookmarkIds((prev) => prev.filter((bid) => bid !== id));

    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.warn('[EventsContext] deleteEvent error:', deleteError.message);
      loadEvents(); // Revert via reload
    }
    // user_rsvps rows are cleaned up by ON DELETE CASCADE on the DB
  };

  const flagEvent = async (id: string, reason: string): Promise<void> => {
    const existing = allEventsState.find((e) => e.id === id);
    const newReportCount = (existing?.reportCount ?? 0) + 1;

    setAllEventsState((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, status: 'flagged' as EventStatus, flagReason: reason, reportCount: newReportCount }
          : e
      )
    );

    await supabase
      .from('events')
      .update({ status: 'flagged', flag_reason: reason, report_count: newReportCount })
      .eq('id', id);
  };

  const approveEvent = async (id: string): Promise<void> => {
    setAllEventsState((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: 'live' as EventStatus, flagReason: undefined } : e
      )
    );

    await supabase
      .from('events')
      .update({ status: 'live', flag_reason: null })
      .eq('id', id);
  };

  const rejectEvent = async (id: string, reason: string): Promise<void> => {
    setAllEventsState((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, status: 'rejected' as EventStatus, rejectedReason: reason }
          : e
      )
    );

    await supabase
      .from('events')
      .update({ status: 'rejected', rejected_reason: reason })
      .eq('id', id);
  };

  const boostEvent = async (id: string, days: number): Promise<void> => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    const boostExpiresAt = expiresAt.toISOString();

    setAllEventsState((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, boosted: true, boostExpiresAt, boostImpressions: e.boostImpressions ?? 0 }
          : e
      )
    );

    await supabase
      .from('events')
      .update({ boosted: true, boost_expires_at: boostExpiresAt })
      .eq('id', id);
  };

  // ── Derived lists ─────────────────────────────────────────────────────────
  const events = allEventsState.filter((e) => e.status === 'live');
  const allEvents = allEventsState;

  // ── Query helpers ─────────────────────────────────────────────────────────
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
  const getBoostedEvents = () => events.filter((e) => e.boosted);

  return (
    <EventsContext.Provider
      value={{
        events,
        allEvents,
        userGoingIds,
        userInterestedIds,
        userBookmarkIds,
        isLoading,
        error,
        clearError,
        toggleGoing,
        toggleInterested,
        toggleBookmark,
        postEvent,
        editEvent,
        deleteEvent,
        flagEvent,
        approveEvent,
        rejectEvent,
        boostEvent,
        getEventById,
        getFeaturedEvents,
        getEventsByParish,
        getEventsByType,
        getUserPostedEvents,
        getPromoterEvents,
        getPendingEvents,
        getFlaggedEvents,
        getBoostedEvents,
        refreshEvents: loadEvents,
      }}
    >
      {children}
    </EventsContext.Provider>
  );
}
