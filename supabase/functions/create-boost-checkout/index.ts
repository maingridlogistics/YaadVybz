// create-boost-checkout — creates a Stripe Checkout session for an event boost.
//
// Security model:
//   • All Stripe keys and service-role key are server-side only.
//   • Price is never accepted from the client — server-side mapping only.
//   • Ownership is verified before any Stripe or DB call.
//   • A pending boost_purchases row is created BEFORE returning the Stripe URL
//     so the purchase_id can appear in Stripe metadata.
//   • The client never writes to boost_purchases; only service-role code does.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';
import { corsHeaders } from '../_shared/cors.ts';

// ── Server-side price mapping (cents). Client never sends a price. ─────────────
const BOOST_PRICES: Record<string, { amount: number; label: string; description: string }> = {
  three_day:       { amount: 199, label: '3-Day Boost',            description: 'Promoted for 72 hours from payment' },
  seven_day:       { amount: 399, label: '7-Day Boost',            description: 'Promoted for 7 days from payment' },
  until_event_end: { amount: 699, label: 'Until Event Ends Boost', description: 'Promoted until the event date passes' },
};

// Upgrade deltas: UPGRADE_DELTA[current_type][target_type] = additional cents charged.
const UPGRADE_DELTA: Record<string, Record<string, number>> = {
  three_day: { seven_day: 200, until_event_end: 500 }, // $2.00, $5.00
  seven_day:  { until_event_end: 300 },                  // $3.00
};

const VALID_BOOST_TYPES = new Set(Object.keys(BOOST_PRICES));

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
});

serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // ── 1. Extract JWT from Authorization header ──────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authorization token required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Service-role admin client — used for ALL DB writes ─────────────────
    //    Never pass this client reference to the caller.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── 3. Validate the requester's JWT → get their uid ───────────────────────
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. Parse and validate request body ────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Request body must be valid JSON' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4a. iOS and Android are blocked from Stripe digital boost purchases ──
    // ISSUE-002 FIX: Both iOS and Android must use native billing providers.
    const clientPlatform = typeof body.platform === 'string' ? body.platform.toLowerCase() : '';
    if (clientPlatform === 'ios') {
      console.warn(`[create-boost-checkout] iOS purchase attempt rejected for user ${user.id.slice(0, 8)}`);
      return new Response(
        JSON.stringify({ error: 'Boost purchases on iOS are handled through Apple In-App Purchases.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (clientPlatform === 'android') {
      console.warn(`[create-boost-checkout] Android purchase attempt rejected for user ${user.id.slice(0, 8)}`);
      return new Response(
        JSON.stringify({ error: 'Boost purchases on Android are handled through Google Play Billing.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const event_id   = typeof body.event_id   === 'string' ? body.event_id.trim()   : null;
    const boost_type = typeof body.boost_type  === 'string' ? body.boost_type.trim() : null;

    if (!event_id || !boost_type || !VALID_BOOST_TYPES.has(boost_type)) {
      return new Response(
        JSON.stringify({ error: 'event_id and a valid boost_type (three_day | seven_day | until_event_end) are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 5. Fetch event and verify ownership in a single query ─────────────────
    //    Filtering by promoter_id = user.id means a 404 from the DB proves
    //    either the event doesn't exist OR the caller doesn't own it.
    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, title, promoter_id, date, boosted, boost_type, boost_status, boost_expires_at, boost_checkout_session')
      .eq('id', event_id)
      .eq('promoter_id', user.id)
      .single();

    if (eventError || !eventRow) {
      return new Response(JSON.stringify({ error: 'Event not found or you are not the event owner' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 6. Server-side price determination ────────────────────────────────────
    const now = new Date();
    const isActiveBoosted =
      eventRow.boosted === true &&
      eventRow.boost_status === 'active' &&
      (
        eventRow.boost_type === 'until_event_end' ||
        !eventRow.boost_expires_at ||
        new Date(eventRow.boost_expires_at) > now
      );

    const isUpgrade = isActiveBoosted && !!eventRow.boost_type;
    let amount: number;

    if (isActiveBoosted && eventRow.boost_type) {
      // Same plan: reject
      if (eventRow.boost_type === boost_type) {
        return new Response(JSON.stringify({ error: 'This boost plan is already active on this event' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Maximum plan: no upgrade path
      if (eventRow.boost_type === 'until_event_end') {
        return new Response(JSON.stringify({ error: 'Maximum boost is already active — no upgrade available' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Verify this is a valid upgrade (not a downgrade)
      const delta = UPGRADE_DELTA[eventRow.boost_type]?.[boost_type];
      if (delta === undefined) {
        return new Response(JSON.stringify({ error: 'Downgrading an active boost is not permitted' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      amount = delta;
    } else {
      amount = BOOST_PRICES[boost_type].amount;
    }

    const pkg = BOOST_PRICES[boost_type];

    // ── 7. Create pending boost_purchases row BEFORE Stripe session ───────────
    //    ISSUE-011 FIX: stripe_checkout_session is now nullable after migration.
    //    Set to null initially; real session ID written in step 9.
    const purchaseId = crypto.randomUUID();

    const { error: insertError } = await supabaseAdmin
      .from('boost_purchases')
      .insert({
        id:          purchaseId,
        event_id,
        promoter_id: user.id,
        boost_type,
        amount,
        currency:    'usd',
        status:      'pending',
        stripe_checkout_session: null, // replaced with real session ID below
      });

    if (insertError) {
      console.error('[create-boost-checkout] Failed to create pending purchase record:', insertError.message);
      return new Response(JSON.stringify({ error: 'Could not initialise purchase record. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 8. Create Stripe Checkout session ────────────────────────────────────
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency:     'usd',
            product_data: {
              name:        isUpgrade ? `Upgrade to ${pkg.label}` : pkg.label,
              description: `${isUpgrade ? 'Upgrade boost for' : 'Boost for'}: "${eventRow.title}"`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        // Deep-link redirect — intercepted by WebBrowser.openAuthSessionAsync.
        // Stripe only requires HTTPS for web; custom schemes are valid on native.
        success_url: `vybzhub://boost-success?session_id={CHECKOUT_SESSION_ID}&event_id=${event_id}`,
        cancel_url:  `vybzhub://boost-cancel?event_id=${event_id}`,
        // Required metadata — must include purchase_id, event_id, promoter_id, boost_type.
        metadata: {
          purchase_id:  purchaseId,
          event_id,
          promoter_id:  user.id,
          boost_type,
        },
      });
    } catch {
      // Stripe call failed — clean up the orphaned pending row
      await supabaseAdmin.from('boost_purchases').delete().eq('id', purchaseId);
      console.error('[create-boost-checkout] Stripe session creation failed');
      return new Response(JSON.stringify({ error: 'Payment provider error. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 9. Replace placeholder with the real Stripe session ID ───────────────
    await supabaseAdmin
      .from('boost_purchases')
      .update({ stripe_checkout_session: session.id })
      .eq('id', purchaseId);

    // Minimal log — no keys, no customer data, no payment details.
    console.log(`[create-boost-checkout] purchase=${purchaseId} event=${event_id} type=${boost_type} upgrade=${isUpgrade} cents=${amount}`);

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id, amount, is_upgrade: isUpgrade }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch {
    console.error('[create-boost-checkout] Unhandled error');
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
