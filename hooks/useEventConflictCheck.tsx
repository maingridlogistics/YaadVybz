import { useMemo } from 'react';
import { Event } from '../constants/data';
import { useEvents } from './useEvents';

/**
 * Returns events that conflict with a proposed event — same calendar date AND same parish.
 *
 * Only `live` events are considered genuine conflicts. Pending events have not been
 * approved yet and may be rejected; rejected, flagged, and deleted events are excluded.
 *
 * Uses the EventsContext in-memory dataset — no additional Supabase query.
 *
 * Date comparison uses the stored ISO date string directly (YYYY-MM-DD), which is the
 * intended local Jamaica calendar date and is safe against UTC-midnight drift.
 *
 * @param date         ISO date string of the proposed event (e.g. "2026-08-29")
 * @param parish       Parish name of the proposed event (e.g. "Manchester")
 * @param excludeId    Optional: event ID to exclude (prevents self-match when editing)
 */
export function useEventConflictCheck(
  date: string,
  parish: string,
  excludeId?: string,
): Event[] {
  const { events } = useEvents();

  return useMemo(() => {
    if (!date || !parish) return [];

    return events.filter(
      (e) =>
        e.status === 'live' &&
        e.date === date &&
        e.parish === parish &&
        e.id !== excludeId,
    );
  }, [events, date, parish, excludeId]);
}
