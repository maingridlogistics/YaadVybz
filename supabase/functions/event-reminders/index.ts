// event-reminders — scheduled Edge Function
// Triggered by pg_cron every 30 minutes.
// Finds events starting in ~2 hours and sends push notifications
// to all users who have RSVP'd as 'going'.
//
// Supabase cron schedule (run once in SQL editor):
//   select cron.schedule(
//     'event-reminders',
//     '*/30 * * * *',
//     $$
//       select net.http_post(
//         url := 'https://<project-ref>.supabase.co/functions/v1/event-reminders',
//         headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon-key>"}'::jsonb,
//         body := '{}'::jsonb
//       );
//     $$
//   );

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendPushNotifications } from '../_shared/push.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Find events starting in 90–150 minutes from now (±30min window around 2h)
    const nowMs = Date.now();
    const windowStart = new Date(nowMs + 90 * 60 * 1000).toISOString();
    const windowEnd   = new Date(nowMs + 150 * 60 * 1000).toISOString();

    // Query events whose date+startTime falls in the window.
    // We store date as "YYYY-MM-DD" and startTime as "8:00 PM" — we compute
    // the ISO datetime server-side by combining them.
    // Simple approach: fetch events today/tomorrow then filter in JS.
    const todayStr    = new Date().toISOString().slice(0, 10);
    const tomorrowStr = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: events, error: eventsErr } = await supabase
      .from('events')
      .select('id, title, date, start_time, parish, venue')
      .eq('status', 'live')
      .in('date', [todayStr, tomorrowStr]);

    if (eventsErr) {
      console.error('[event-reminders] events query error:', eventsErr.message);
      return new Response(JSON.stringify({ error: eventsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse "8:00 PM" style time into a Date on the event's date
    function parseEventDateTime(dateStr: string, timeStr: string): Date | null {
      if (!timeStr || timeStr === 'TBA') return null;
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;
      let [, h, m, period] = match;
      let hour = parseInt(h, 10);
      const min = parseInt(m, 10);
      if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
      const [y, mo, d] = dateStr.split('-').map(Number);
      return new Date(y, mo - 1, d, hour, min);
    }

    // Filter events within the 90–150 min window
    const windowStartMs = nowMs + 90 * 60 * 1000;
    const windowEndMs   = nowMs + 150 * 60 * 1000;

    const targetEvents = (events as any[]).filter((e) => {
      const dt = parseEventDateTime(e.date, e.start_time);
      if (!dt) return false;
      const ms = dt.getTime();
      return ms >= windowStartMs && ms <= windowEndMs;
    });

    if (targetEvents.length === 0) {
      return new Response(JSON.stringify({ sent: 0, checked: events.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalSent = 0;

    for (const event of targetEvents) {
      // Fetch all users going to this event
      const { data: rsvps, error: rsvpErr } = await supabase
        .from('user_rsvps')
        .select('user_id')
        .eq('event_id', event.id)
        .eq('status', 'going');

      if (rsvpErr || !rsvps?.length) continue;

      const userIds = rsvps.map((r: any) => r.user_id);

      // Fetch push tokens for these users
      const { data: tokens, error: tokensErr } = await supabase
        .from('push_tokens')
        .select('token, user_id')
        .in('user_id', userIds);

      if (tokensErr || !tokens?.length) continue;

      // Filter users whose push_notif_new_parish preference is true (re-use for event reminders)
      // We check user_profiles for each user
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, push_notif_event_change')
        .in('id', userIds)
        .eq('push_notif_event_change', true);

      const allowedIds = new Set((profiles ?? []).map((p: any) => p.id));
      const filteredTokens = tokens
        .filter((t: any) => allowedIds.has(t.user_id))
        .map((t: any) => t.token);

      if (filteredTokens.length === 0) continue;

      // Send push notifications in batches
      const notifBody = `"${event.title}" starts in about 2 hours. ${event.venue}, ${event.parish}`;
      const receipts = await sendPushNotifications(filteredTokens, {
        title: '⏰ Event Starting Soon',
        body: notifBody,
        data: { type: 'event_reminder', eventId: event.id },
      });

      totalSent += filteredTokens.length;

      // Store receipt IDs for later verification
      if (receipts?.length) {
        const receiptRows = receipts
          .filter((r: any) => r.id)
          .map((r: any) => ({ receipt_id: r.id }));
        if (receiptRows.length > 0) {
          await supabase.from('push_receipt_queue').insert(receiptRows);
        }
      }
    }

    console.log(`[event-reminders] Sent ${totalSent} reminders for ${targetEvents.length} events.`);

    return new Response(JSON.stringify({ sent: totalSent, events: targetEvents.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[event-reminders] unexpected error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
