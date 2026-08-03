// Vybz Hub — check-push-receipts Edge Function
//
// Expo's primary DeviceNotRegistered signal arrives at the receipt level, not
// the ticket level. Tickets are immediate acknowledgements that Expo accepted
// the message; receipts are issued after Expo actually attempts delivery to
// FCM/APNs and reflect the real outcome.
//
// This function:
//   1. Reads push_receipt_queue rows that are ≥15 minutes old and unchecked.
//   2. Calls Expo's /getReceipts endpoint for those IDs (max 300 per call).
//   3. Deletes push_tokens rows where the receipt reports DeviceNotRegistered.
//   4. Marks processed queue entries as checked and cleans up old ones.
//
// Invocation: called non-blocking from send-email after every push batch.
// That means each new push triggers a receipt check for the PREVIOUS batch
// (which is now old enough). No pg_cron or external scheduler required.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

// Expo recommends checking receipts at least 15 minutes after sending
const MIN_AGE_MINUTES = 15;
// Expo allows max 300 IDs per /getReceipts call
const BATCH_SIZE = 300;
// Delete checked entries older than this (table hygiene)
const CLEANUP_AFTER_HOURS = 24;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 1. Table hygiene: remove old checked entries ──────────────────────────
    const cleanupCutoff = new Date(
      Date.now() - CLEANUP_AFTER_HOURS * 60 * 60 * 1000
    ).toISOString();
    await supabaseAdmin
      .from("push_receipt_queue")
      .delete()
      .not("checked_at", "is", null)
      .lt("checked_at", cleanupCutoff);

    // ── 2. Fetch unchecked entries that are old enough ────────────────────────
    const ageCutoff = new Date(
      Date.now() - MIN_AGE_MINUTES * 60 * 1000
    ).toISOString();

    const { data: pending, error: queryError } = await supabaseAdmin
      .from("push_receipt_queue")
      .select("id, receipt_id, token_db_id")
      .is("checked_at", null)
      .lt("sent_at", ageCutoff)
      .limit(BATCH_SIZE);

    if (queryError) {
      console.error("[Receipts] Queue query error:", queryError.message);
      return new Response(
        JSON.stringify({ error: queryError.message }),
        { status: 500, headers: jsonHeaders }
      );
    }

    if (!pending || pending.length === 0) {
      console.log("[Receipts] No pending receipts ready to check.");
      return new Response(
        JSON.stringify({ checked: 0, removed: 0 }),
        { headers: jsonHeaders }
      );
    }

    console.log("[Receipts] Checking", pending.length, "receipt(s)...");

    // Build lookup: receipt_id → { queueId, tokenDbId }
    const receiptMap = new Map<string, { queueId: string; tokenDbId: string | null }>();
    for (const row of pending) {
      receiptMap.set(row.receipt_id, {
        queueId: row.id,
        tokenDbId: row.token_db_id ?? null,
      });
    }

    // ── 3. Call Expo /getReceipts ─────────────────────────────────────────────
    const expoRes = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: pending.map((r: any) => r.receipt_id) }),
    });

    if (!expoRes.ok) {
      const body = await expoRes.text().catch(() => "");
      console.warn("[Receipts] Expo API error:", expoRes.status, body);
      // Don't mark as checked — we'll retry next time
      return new Response(
        JSON.stringify({ error: "Expo API error", status: expoRes.status }),
        { status: 502, headers: jsonHeaders }
      );
    }

    const expoResult = await expoRes.json();
    // data is a map from receipt_id → { status, message?, details? }
    const receipts: Record<string, any> = expoResult.data ?? {};

    // ── 4. Identify DeviceNotRegistered tokens ────────────────────────────────
    // This is the primary, authoritative signal — not the ticket-level check.
    // A receipt with DeviceNotRegistered means FCM/APNs confirmed the device
    // is no longer registered for this token (app uninstalled, permission revoked).
    const staleTokenDbIds: string[] = [];

    for (const [receiptId, receipt] of Object.entries(receipts)) {
      const entry = receiptMap.get(receiptId);
      if (!entry?.tokenDbId) continue;

      if (
        receipt.status === "error" &&
        receipt.details?.error === "DeviceNotRegistered"
      ) {
        staleTokenDbIds.push(entry.tokenDbId);
        console.log(
          "[Receipts] DeviceNotRegistered — queuing token for removal:",
          entry.tokenDbId.slice(0, 8)
        );
      }
    }

    // ── 5. Delete stale push_tokens rows ─────────────────────────────────────
    // ON DELETE CASCADE on push_receipt_queue.token_db_id means deleting the
    // token also removes any remaining queue entries for it automatically.
    let removed = 0;
    if (staleTokenDbIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from("push_tokens")
        .delete()
        .in("id", staleTokenDbIds);
      if (!deleteError) {
        removed = staleTokenDbIds.length;
        console.log("[Receipts] Removed", removed, "stale push token(s) via receipt check");
      } else {
        console.warn("[Receipts] Token delete error:", deleteError.message);
      }
    }

    // ── 6. Mark all fetched queue entries as checked ──────────────────────────
    // Includes entries for which Expo returned no receipt (likely expired on
    // Expo's side) — we don't want to retry those indefinitely.
    const allQueueIds = pending.map((r: any) => r.id);
    await supabaseAdmin
      .from("push_receipt_queue")
      .update({ checked_at: new Date().toISOString() })
      .in("id", allQueueIds);

    console.log(
      `[Receipts] Done. Checked: ${pending.length} | DeviceNotRegistered: ${staleTokenDbIds.length} | Removed: ${removed}`
    );

    return new Response(
      JSON.stringify({ checked: pending.length, removed }),
      { headers: jsonHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Receipts] Unexpected error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
