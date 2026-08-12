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
        } catch {}
      }
      console.warn(`[emailService] ${type} failed:`, detail);
    }
  } catch (e) {
    console.warn('[emailService] Unexpected error:', e);
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/**
 * Broadcast a new-event notification to ALL users who have the given parish as
 * their home_parish OR in their preferred_parishes array.
 */
export async function notifyParishUsersNewEvent(
  parish: string,
  data: EmailData
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        type: 'new_event_parish',
        data,
        parishForNewEvent: parish,
      },
    });

    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch {}
      }
      console.warn('[emailService] notifyParishUsersNewEvent failed:', detail);
    }
  } catch (e) {
    console.warn('[emailService] notifyParishUsersNewEvent unexpected error:', e);
  }
}

/** @deprecated Use notifyParishUsersNewEvent for proper parish-wide broadcast. */
export const emailNewEventParish = (data: EmailData) =>
  sendEmailNotification('new_event_parish', data);

/**
 * Notify every opted-in follower of `promoterId` about a new event.
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
        } catch {}
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

/**
 * Notify ALL users who RSVPd (going or interested) to an event that it was updated.
 */
export async function notifyRsvpUsersEventChange(
  eventId: string,
  data: EmailData
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.functions.invoke('send-email', {
      body: { type: 'event_change', data, eventIdForRsvpLookup: eventId },
    });

    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch {}
      }
      console.warn('[emailService] notifyRsvpUsersEventChange failed:', detail);
    }
  } catch (e) {
    console.warn('[emailService] notifyRsvpUsersEventChange unexpected error:', e);
  }
}

/**
 * Notify ALL users who RSVPd (going or interested) to an event that it was cancelled.
 */
export async function notifyRsvpUsersEventCancelled(
  eventId: string,
  data: EmailData
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.functions.invoke('send-email', {
      body: { type: 'event_cancelled', data, eventIdForRsvpLookup: eventId },
    });

    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch {}
      }
      console.warn('[emailService] notifyRsvpUsersEventCancelled failed:', detail);
    }
  } catch (e) {
    console.warn('[emailService] notifyRsvpUsersEventCancelled unexpected error:', e);
  }
}

/** Fire when the app schedules a day-of push reminder. */
export const emailRsvpReminder = (data: EmailData) =>
  sendEmailNotification('rsvp_reminder', data);

// ─── Test Push ───────────────────────────────────────────────────────────────

export interface FcmResultEntry {
  tokenId: string;
  status: string;
  httpStatus: number;
  fcmMessageName?: string;
  errorCode?: string;
  tokenRemoved: boolean;
}

export interface TestPushResult {
  ok: boolean;
  fcmResults: FcmResultEntry[];
  tokenInfo: { id: string; token_type: string }[];
  detail: string;
}

/**
 * Send a test push notification to the current admin user's registered devices only.
 */
export async function sendTestPush(): Promise<TestPushResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, fcmResults: [], tokenInfo: [], detail: 'Not signed in' };

    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { testPushOnly: true },
    });

    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const statusCode = (error as any).context?.status ?? 500;
          const text = await (error as any).context?.text?.();
          detail = `[${statusCode}] ${text || error.message}`;
        } catch {}
      }
      return { ok: false, fcmResults: [], tokenInfo: [], detail };
    }

    const fcmResults: FcmResultEntry[] = (data as any)?.fcmResults ?? [];
    const tokenInfo: { id: string; token_type: string }[] = (data as any)?.tokenInfo ?? [];

    const anySent = fcmResults.some((r) => r.status === 'sent');
    const expoOnly = tokenInfo.length > 0 && fcmResults.length === 0 && tokenInfo.every((t) => t.token_type === 'expo');
    const ok = anySent || expoOnly;

    return { ok, fcmResults, tokenInfo, detail: ok ? 'Sent' : 'No successful sends' };
  } catch (e: any) {
    return { ok: false, fcmResults: [], tokenInfo: [], detail: e?.message ?? 'Unexpected error' };
  }
}

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
        } catch {}
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

// ─── Promoter Event-Decision Notifications ───────────────────────────────────

/**
 * Notify the event promoter that their submitted event was approved.
 */
export async function notifyPromoterEventApproved(
  promoterUserId: string,
  eventId: string,
  eventTitle: string,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        notifyPromoterDecision: true,
        recipientUserId: promoterUserId,
        recipientDecisionType: 'event_approved',
        recipientEventId: eventId,
        recipientEventTitle: eventTitle,
      },
    });
    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch {}
      }
      console.warn('[emailService] notifyPromoterEventApproved failed:', detail);
    }
  } catch (e) {
    console.warn('[emailService] notifyPromoterEventApproved unexpected error:', e);
  }
}

/**
 * Notify the event promoter that their submitted event was rejected.
 */
export async function notifyPromoterEventRejected(
  promoterUserId: string,
  eventId: string,
  eventTitle: string,
  rejectionReason?: string,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        notifyPromoterDecision: true,
        recipientUserId: promoterUserId,
        recipientDecisionType: 'event_rejected',
        recipientEventId: eventId,
        recipientEventTitle: eventTitle,
        ...(rejectionReason ? { recipientRejectionReason: rejectionReason } : {}),
      },
    });
    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch {}
      }
      console.warn('[emailService] notifyPromoterEventRejected failed:', detail);
    }
  } catch (e) {
    console.warn('[emailService] notifyPromoterEventRejected unexpected error:', e);
  }
}

// ─── RSVP Promoter Notification ──────────────────────────────────────────────

/**
 * Notify the event promoter that a user has RSVP'd to their event.
 */
export async function notifyPromoterRsvp(
  promoterUserId: string,
  rsvpUserId: string,
  rsvpStatus: 'going' | 'interested',
  eventId: string,
  eventTitle: string,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        notifyRsvpToPromoter: true,
        rsvpPromoterUserId: promoterUserId,
        rsvpUserId,
        rsvpStatus,
        rsvpEventId: eventId,
        rsvpEventTitle: eventTitle,
      },
    });
    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch {}
      }
      console.warn('[emailService] notifyPromoterRsvp failed:', detail);
    }
  } catch (e) {
    console.warn('[emailService] notifyPromoterRsvp unexpected error:', e);
  }
}

// ─── Admin: New Account Deletion Request ────────────────────────────────────

/**
 * Notify all admin users about a new account deletion request.
 */
export async function notifyAdminNewDeletionRequest(
  requestId: string,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        notifyAdminDeletionRequest: true,
        deletionRequestId: requestId,
      },
    });
    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch {}
      }
      console.warn('[emailService] notifyAdminNewDeletionRequest failed:', detail);
    }
  } catch (e) {
    console.warn('[emailService] notifyAdminNewDeletionRequest unexpected error:', e);
  }
}

// ─── New Follower Notification ──────────────────────────────────────────────────

/**
 * Notify a promoter that a user has started following them.
 */
export async function notifyPromoterNewFollower(
  promoterUserId: string,
  followerUserId: string,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        notifyNewFollower: true,
        newFollowerPromoterUserId: promoterUserId,
        newFollowerUserId: followerUserId,
      },
    });
    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await (error as any).context?.text?.();
          if (text) detail = `[${(error as any).context?.status ?? 500}] ${text}`;
        } catch {}
      }
      console.warn('[emailService] notifyPromoterNewFollower failed:', detail);
    }
  } catch (e) {
    console.warn('[emailService] notifyPromoterNewFollower unexpected error:', e);
  }
}

// ─── Boost Expiry Check ───────────────────────────────────────────────────────

/**
 * Server-side check for boosts expiring within 25 hours owned by the current user.
 */
export async function checkAndNotifyBoostExpiry(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.functions.invoke('send-email', {
      body: { checkBoostExpiry: true },
    });
  } catch {}
}

// ─── SMTP Handshake Probe ─────────────────────────────────────────────────────

export interface SmtpProbeResult {
  ok: boolean;
  /** Total handshake time in ms (TCP + banner + EHLO + optional STARTTLS + AUTH) */
  totalMs: number;
  /** Phase that was last completed, or where failure occurred */
  phase: string;
  phases: {
    /** TCP (or implicit TLS) connection establishment */
    tcpMs: number;
    /** Time from connect until SMTP 220 greeting received */
    bannerMs: number;
    /** EHLO round-trip */
    ehloMs: number;
    /** STARTTLS + TLS upgrade + second EHLO (port 587 only, null for port 465) */
    tlsMs: number | null;
    /** AUTH LOGIN exchange: challenge → username → challenge → password → 235 */
    authMs: number | null;
  };
  error?: string;
}

/**
 * Probe the SMTP server used by Supabase Auth for password-recovery emails.
 */
export async function testSmtpConnection(): Promise<SmtpProbeResult> {
  const emptyPhases = { tcpMs: -1, bannerMs: -1, ehloMs: -1, tlsMs: null as number | null, authMs: null as number | null };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { ok: false, totalMs: 0, phase: 'auth', phases: emptyPhases, error: 'Not signed in' };
    }

    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { testSmtpHandshake: true },
    });

    if (error) {
      let detail = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const statusCode = (error as any).context?.status ?? 500;
          const text = await (error as any).context?.text?.();
          detail = `[${statusCode}] ${text || error.message}`;
        } catch {}
      }
      return { ok: false, totalMs: 0, phase: 'error', phases: emptyPhases, error: detail };
    }

    return data as SmtpProbeResult;
  } catch (e: any) {
    return { ok: false, totalMs: 0, phase: 'error', phases: emptyPhases, error: e?.message ?? 'Unexpected error' };
  }
}
