// ─── Vybz Hub Email Service ────────────────────────────────────────────────────
// Client-side wrapper around the send-email Edge Function.
// All failures are non-fatal — email errors are logged but never surfaced to users.

import { supabase } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

export type EmailType =
  | 'new_event_parish'
  | 'new_event_promoter'
  | 'event_change'
  | 'event_cancelled'
  | 'rsvp_reminder'
  | 'test_email';

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

/**
 * Notify every opted-in follower of `promoterId` about a new event.
 *
 * The follower lookup and preference filtering happen server-side inside the
 * Edge Function using the service role key — client-side RLS on user_profiles
 * only allows a user to read their own row, so we cannot query followers from
 * the app. The calling user (the posting promoter) only supplies their JWT for
 * authentication; the actual recipient list is resolved by the Edge Function.
 *
 * Errors are non-fatal and never surfaced to the UI.
 */
export async function notifyFollowersNewEvent(
  promoterId: string,
  data: EmailData
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        type: 'new_event_promoter',
        data,
        promoterIdForFollowerLookup: promoterId,
      },
    });

    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch (_) {}
      }
      console.warn('[emailService] notifyFollowersNewEvent failed:', detail);
    }
  } catch (e) {
    console.warn('[emailService] notifyFollowersNewEvent unexpected error:', e);
  }
}

/** @deprecated Use notifyFollowersNewEvent for follower fan-out. */
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

/** Send a test email to the current admin user to verify the email pipeline. */
export async function sendTestEmail(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, detail: 'Not signed in' };

    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { type: 'test_email', data: { sentAt: new Date().toISOString() } },
    });

    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const statusCode = (error as any).context?.status ?? 500;
          const text = await (error as any).context?.text?.();
          detail = `[${statusCode}] ${text || error.message}`;
        } catch (_) {}
      }
      return { ok: false, detail };
    }

    if ((data as any)?.skipped) {
      return { ok: false, detail: (data as any).reason ?? 'Email skipped (no transport configured)' };
    }

    return { ok: true, detail: 'Test email sent — check your inbox.' };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? 'Unexpected error' };
  }
}
