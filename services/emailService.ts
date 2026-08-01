// ─── YaadVybz Email Service ───────────────────────────────────────────────────
// Client-side wrapper around the send-email Edge Function.
// All failures are non-fatal — email errors are logged but never surfaced to users.

import { supabase } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

export type EmailType =
  | 'new_event_parish'
  | 'new_event_promoter'
  | 'event_change'
  | 'event_cancelled'
  | 'rsvp_reminder';

export interface EmailData {
  eventTitle?: string;
  eventId?: string;
  parish?: string;
  date?: string;
  startTime?: string;
  venue?: string;
  ticketPrice?: string;
  promoterName?: string;
  changeDetails?: string;
  dressCode?: string;
  message?: string;
}

/**
 * Send a notification email to the currently signed-in user.
 * The edge function checks the user's email preferences and skips if opted out.
 * Errors are caught and logged — they never throw or block the UI.
 */
export async function sendEmailNotification(
  type: EmailType,
  data: EmailData
): Promise<void> {
  try {
    // Only call the function if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // Guest users don't get emails

    const { error } = await supabase.functions.invoke('send-email', {
      body: { type, data },
    });

    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch (_) {}
      }
      console.warn(`[emailService] ${type} failed:`, detail);
    }
  } catch (e) {
    console.warn('[emailService] Unexpected error:', e);
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/** Fire when current user posts an event in one of their preferred parishes. */
export const emailNewEventParish = (data: EmailData) =>
  sendEmailNotification('new_event_parish', data);

/** Fire when current user sees a new event from a promoter they follow. */
export const emailNewEventPromoter = (data: EmailData) =>
  sendEmailNotification('new_event_promoter', data);

/** Fire when an event the current user RSVPed to is edited. */
export const emailEventChange = (data: EmailData) =>
  sendEmailNotification('event_change', data);

/** Fire when an event the current user RSVPed to is cancelled. */
export const emailEventCancelled = (data: EmailData) =>
  sendEmailNotification('event_cancelled', data);

/** Fire when the app schedules a day-of push reminder. */
export const emailRsvpReminder = (data: EmailData) =>
  sendEmailNotification('rsvp_reminder', data);
