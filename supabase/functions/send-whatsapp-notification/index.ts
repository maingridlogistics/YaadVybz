// Vybz Hub — send-whatsapp-notification Edge Function
//
// Sends WhatsApp update notifications to opted-in users via Twilio
// Programmable Messaging (Content Template API).
//
// Supported triggers:
//   entity_type = 'event'    → notify RSVPs + bookmarks for that event
//   entity_type = 'business' → notify users who saved/favorited that business
//
// Required Supabase Secrets:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_UPDATE_TEMPLATE_SID   — the approved Twilio Content SID (HX...)
//
// Expected request body (called from Postgres trigger via pg_net, or server-side):
// {
//   entity_type: 'event' | 'business',
//   entity_id:   string (uuid),
//   entity_name: string,          // event title or business name
//   changed_fields: string[],     // list of field names that changed
//   old_values: Record<string, any>,
//   new_values: Record<string, any>,
//   idempotency_seed: string,     // caller-provided seed to prevent duplicate sends
// }
//
// Template variables (mapped to the approved Twilio Content Template):
//   {{1}} = recipient first name
//   {{2}} = entity name (event/business)
//   {{3}} = human-readable change summary

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL            = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TWILIO_ACCOUNT_SID      = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN        = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_UPDATE_TEMPLATE_SID = Deno.env.get("TWILIO_UPDATE_TEMPLATE_SID") ?? "";

// WhatsApp sender — must be your approved Twilio WhatsApp-enabled number or
// Messaging Service SID. Configure TWILIO_WHATSAPP_FROM in Supabase Secrets.
// Falls back to the sandbox number format for development.
const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "";

// ─── Meaningful field sets ────────────────────────────────────────────────────
// Only trigger WhatsApp notifications when these fields change.
// Internal/analytics/counter fields are intentionally excluded.

const EVENT_MEANINGFUL_FIELDS = new Set([
  "date",
  "start_time",
  "end_time",
  "venue",
  "address",
  "parish",
  "status",                  // e.g. live → cancelled
  "cancellation_status",
  "ticket_price",
  "selling_tickets_in_app",
  "lineup",
  "lineup_entries",
  "description",
  "dress_code",
  "age_limit",
  "ticket_link",
  "contact_info",
  "ticket_provider_name",
  "physical_ticket_locations",
]);

const BUSINESS_MEANINGFUL_FIELDS = new Set([
  "description",
  "phone",
  "whatsapp",
  "website",
  "instagram",
  "facebook",
  "street_address",
  "town",
  "primary_parish",
  "latitude",
  "longitude",
  "status",          // e.g. live → suspended
  "location_type",
  "location_is_public",
]);

// ─── Human-readable change message builder ────────────────────────────────────
function buildChangeMessage(
  entityType: string,
  changedFields: string[],
  oldValues: Record<string, any>,
  newValues: Record<string, any>
): string {
  if (entityType === "event") {
    for (const field of changedFields) {
      if (field === "status" || field === "cancellation_status") {
        const newStatus = (newValues[field] ?? "").toLowerCase();
        if (newStatus.includes("cancel")) return "This event has been cancelled.";
        if (newStatus === "postponed") return "This event has been postponed.";
        return "The event status has changed. Open the app for the latest details.";
      }
      if (field === "date") {
        const newDate = newValues.date;
        return newDate
          ? `The event date has changed to ${newDate}.`
          : "The event date has been updated.";
      }
      if (field === "start_time") {
        const newTime = newValues.start_time;
        return newTime
          ? `The event time has changed to ${newTime}.`
          : "The event start time has been updated.";
      }
      if (field === "end_time") {
        const newTime = newValues.end_time;
        return newTime ? `The event end time has changed to ${newTime}.` : "The event end time has been updated.";
      }
      if (field === "venue") {
        const newVenue = newValues.venue;
        return newVenue
          ? `The venue has changed to ${newVenue}.`
          : "The venue has been updated.";
      }
      if (field === "address") {
        return "The event location/address has been updated.";
      }
      if (field === "parish") {
        const newParish = newValues.parish;
        return newParish
          ? `The event is now in ${newParish}.`
          : "The event parish has been updated.";
      }
      if (field === "ticket_price") {
        const newPrice = newValues.ticket_price;
        return newPrice
          ? `Ticket pricing has been updated to ${newPrice}.`
          : "Ticket pricing has been updated.";
      }
      if (field === "selling_tickets_in_app") {
        return newValues[field]
          ? "Tickets are now available to purchase in the app."
          : "Ticket availability has been updated.";
      }
      if (field === "lineup" || field === "lineup_entries") {
        return "The lineup/performers have been updated.";
      }
      if (field === "dress_code") {
        const newCode = newValues.dress_code;
        return newCode
          ? `The dress code has been updated to: ${newCode}.`
          : "The dress code has been updated.";
      }
      if (field === "age_limit") {
        return `Age limit has been updated to: ${newValues.age_limit ?? "see event details"}.`;
      }
    }
    // Generic fallback for other meaningful fields
    return "Event details have been updated. Open the app for the latest information.";
  }

  if (entityType === "business") {
    for (const field of changedFields) {
      if (field === "status") {
        const newStatus = (newValues.status ?? "").toLowerCase();
        if (newStatus === "suspended" || newStatus === "pending") {
          return "This business listing is temporarily unavailable.";
        }
        if (newStatus === "live") return "The business is back and open for enquiries.";
        return "The business listing status has changed.";
      }
      if (field === "phone" || field === "whatsapp") {
        return "The business contact number has been updated.";
      }
      if (field === "street_address" || field === "town" || field === "primary_parish" || field === "latitude" || field === "longitude") {
        return "The business address or location has been updated.";
      }
      if (field === "description") {
        return "The business description has been updated.";
      }
      if (field === "website" || field === "instagram" || field === "facebook") {
        return "The business contact links have been updated.";
      }
    }
    return "Business details have been updated. Open the app for the latest information.";
  }

  return "There is an update. Open Vybz Hub for the latest details.";
}

// ─── Extract first name from full name ───────────────────────────────────────
function firstName(fullName: string): string {
  const parts = (fullName ?? "").trim().split(/\s+/);
  return parts[0] || "there";
}

// ─── Send a single WhatsApp message via Twilio Programmable Messaging ─────────
async function sendTwilioWhatsApp(
  toPhone: string,
  recipientName: string,
  entityName: string,
  changeSummary: string
): Promise<{ sid: string; status: string } | { error: string }> {
  // Validate each required secret individually and surface a clear config error
  const missingSecrets: string[] = [];
  if (!TWILIO_ACCOUNT_SID)         missingSecrets.push("TWILIO_ACCOUNT_SID");
  if (!TWILIO_AUTH_TOKEN)          missingSecrets.push("TWILIO_AUTH_TOKEN");
  if (!TWILIO_UPDATE_TEMPLATE_SID) missingSecrets.push("TWILIO_UPDATE_TEMPLATE_SID");
  if (!TWILIO_WHATSAPP_FROM)       missingSecrets.push("TWILIO_WHATSAPP_FROM");

  if (missingSecrets.length > 0) {
    // Log clearly so the Supabase Edge Function log surfaces the exact gap
    console.error(
      `[WA] Backend configuration error — missing Supabase secret(s): ${missingSecrets.join(", ")}. ` +
      "WhatsApp send skipped. Add the missing secret(s) in Supabase Dashboard → Project Settings → Edge Functions → Secrets."
    );
    return { error: `Missing secrets: ${missingSecrets.join(", ")}` };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const authHeader = "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

  const contentVariables = JSON.stringify({
    "1": firstName(recipientName),
    "2": entityName,
    "3": changeSummary,
  });

  const body = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
      ? TWILIO_WHATSAPP_FROM
      : `whatsapp:${TWILIO_WHATSAPP_FROM}`,
    To: toPhone.startsWith("whatsapp:") ? toPhone : `whatsapp:${toPhone}`,
    ContentSid: TWILIO_UPDATE_TEMPLATE_SID,
    ContentVariables: contentVariables,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (json as any)?.message ?? `HTTP ${res.status}`;
      return { error: `Twilio: ${errMsg}` };
    }

    return {
      sid: (json as any).sid ?? "",
      status: (json as any).status ?? "sent",
    };
  } catch (err) {
    return { error: `Network error: ${String(err).slice(0, 120)}` };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: jsonHeaders });
    }

    const {
      entity_type,
      entity_id,
      entity_name,
      changed_fields,
      old_values,
      new_values,
      idempotency_seed,
    } = body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!entity_type || !entity_id || !entity_name || !Array.isArray(changed_fields) || changed_fields.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: entity_type, entity_id, entity_name, changed_fields" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    if (entity_type !== "event" && entity_type !== "business") {
      return new Response(
        JSON.stringify({ error: "entity_type must be 'event' or 'business'" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // ── Service role client (bypasses RLS for all operations) ────────────────
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Filter to only meaningful changed fields ─────────────────────────────
    const meaningfulSet = entity_type === "event" ? EVENT_MEANINGFUL_FIELDS : BUSINESS_MEANINGFUL_FIELDS;
    const meaningfulChanges = (changed_fields as string[]).filter((f) => meaningfulSet.has(f));

    if (meaningfulChanges.length === 0) {
      console.log(`[WA] No meaningful field changes for ${entity_type} ${entity_id} — skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "No meaningful field changes" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── Build human-readable change summary ──────────────────────────────────
    const changeSummary = buildChangeMessage(entity_type, meaningfulChanges, old_values ?? {}, new_values ?? {});
    console.log(`[WA] ${entity_type} ${entity_id} — meaningful changes: ${meaningfulChanges.join(", ")}`);
    console.log(`[WA] Change summary: ${changeSummary}`);

    // ── Resolve recipient user IDs ────────────────────────────────────────────
    let recipientUserIds: string[] = [];

    if (entity_type === "event") {
      // Union of: RSVP'd users + bookmarked users (user_rsvps)
      // Note: the 'bookmarks' feature uses user_rsvps with 'interested'/'going';
      // there is no separate event_bookmarks table. We use both statuses.
      const { data: rsvpRows } = await supabaseAdmin
        .from("user_rsvps")
        .select("user_id")
        .eq("event_id", entity_id)
        .in("status", ["going", "interested"]);

      const rsvpIds: string[] = (rsvpRows ?? []).map((r: any) => r.user_id as string);
      // Deduplicate
      recipientUserIds = [...new Set(rsvpIds)];
      console.log(`[WA] Event recipients from RSVPs: ${recipientUserIds.length}`);
    } else {
      // Business: users who saved/favorited the business
      const { data: favRows } = await supabaseAdmin
        .from("business_favorites")
        .select("user_id")
        .eq("business_id", entity_id);

      recipientUserIds = (favRows ?? []).map((r: any) => r.user_id as string);
      console.log(`[WA] Business recipients from favorites: ${recipientUserIds.length}`);
    }

    if (recipientUserIds.length === 0) {
      console.log(`[WA] No recipients found for ${entity_type} ${entity_id}`);
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: "No recipients" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── Filter: opted in + verified phone ────────────────────────────────────
    const waPrefsCol = entity_type === "event"
      ? "whatsapp_event_updates"
      : "whatsapp_business_updates";

    const { data: eligibleProfiles } = await supabaseAdmin
      .from("user_profiles")
      .select("id, name, phone")
      .in("id", recipientUserIds)
      .eq("whatsapp_notifications_enabled", true)
      .eq(waPrefsCol, true)
      .eq("phone_verified", true)
      .not("phone", "is", null);

    const eligible = (eligibleProfiles ?? []).filter((p: any) => !!p.phone);
    console.log(`[WA] Eligible recipients (opted-in + verified phone): ${eligible.length}`);

    if (eligible.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: "No opted-in recipients with verified phones" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── Derive notification type for logging ──────────────────────────────────
    const notificationType = entity_type === "event" ? "event_update" : "business_update";

    // ── Send WhatsApp notifications (with idempotency guard) ──────────────────
    let sentCount = 0;
    let failCount = 0;

    const sendPromises = eligible.map(async (profile: any) => {
      const userId: string = profile.id;
      const userPhone: string = profile.phone;
      const userDisplayName: string = profile.name ?? "there";

      // Idempotency key: seed + user_id (prevents duplicate sends on retry)
      const seed = idempotency_seed ?? `${entity_type}_${entity_id}_${Date.now()}`;
      const idempotencyKey = `${seed}_${userId}`;

      // Check if already delivered for this logical update
      const { data: existingDelivery } = await supabaseAdmin
        .from("whatsapp_notification_deliveries")
        .select("id, status")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingDelivery) {
        console.log(`[WA] Duplicate suppressed for user ${userId.slice(0, 8)} (key: ${idempotencyKey.slice(-12)})`);
        return;
      }

      // Insert pending delivery log row (also acts as a pessimistic lock)
      const { error: insertErr } = await supabaseAdmin
        .from("whatsapp_notification_deliveries")
        .insert({
          user_id: userId,
          entity_type,
          entity_id,
          notification_type: notificationType,
          idempotency_key: idempotencyKey,
          status: "pending",
        });

      if (insertErr) {
        // Unique constraint violation = already being processed (race condition)
        console.log(`[WA] Concurrent send suppressed for user ${userId.slice(0, 8)}`);
        return;
      }

      // Send via Twilio
      const result = await sendTwilioWhatsApp(userPhone, userDisplayName, entity_name, changeSummary);

      // Update delivery log with result
      if ("sid" in result) {
        await supabaseAdmin
          .from("whatsapp_notification_deliveries")
          .update({
            status: "sent",
            twilio_message_sid: result.sid,
          })
          .eq("user_id", userId)
          .eq("idempotency_key", idempotencyKey);
        sentCount++;
        console.log(`[WA] Sent to user ${userId.slice(0, 8)} — SID: ${result.sid}`);
      } else {
        await supabaseAdmin
          .from("whatsapp_notification_deliveries")
          .update({
            status: "failed",
            error_message: result.error,
          })
          .eq("user_id", userId)
          .eq("idempotency_key", idempotencyKey);
        failCount++;
        console.warn(`[WA] Failed for user ${userId.slice(0, 8)}: ${result.error}`);
      }
    });

    // Send all in parallel — WhatsApp failure must never block the response
    await Promise.allSettled(sendPromises);

    console.log(`[WA] Complete — sent: ${sentCount}, failed: ${failCount}, total eligible: ${eligible.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        failed: failCount,
        eligible: eligible.length,
        change_summary: changeSummary,
        meaningful_changes: meaningfulChanges,
      }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[WA] Unhandled error:", message);
    // WhatsApp failure must never propagate to callers as a 5xx
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: jsonHeaders }
    );
  }
});
