// create-boost-checkout — creates a Stripe Checkout session for an event boost.
// All Stripe keys are server-side only; never expose to the client.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

// ── Full prices in cents ───────────────────────────────────────────────────────
const BOOST_PRICES: Record<string, { amount: number; label: string; description: string }> = {
  three_day:       { amount: 199, label: '3-Day Boost',            description: 'Perfect for last-minute promotion' },
  seven_day:       { amount: 399, label: '7-Day Boost',            description: 'Best value for most events' },
  until_event_end: { amount: 699, label: 'Until Event Ends Boost', description: 'Maximum visibility until your event finishes' },
};

// ── Upgrade pricing: UPGRADE_PRICE[current][target] = price to charge in cents ──
const UPGRADE_PRICE: Record<string, Record<string, number>> = {
  three_day:  { seven_day: 200, until_event_end: 500 }, // $2.00, $5.00
  seven_day:  { until_event_end: 300 },                  // $3.00
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'No authorization token provided' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authenticate the requesting user via JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { event_id, boost_type } = body;

    if (!event_id || !boost_type || !BOOST_PRICES[boost_type]) {
      return new Response(JSON.stringify({ error: 'Invalid parameters: event_id and valid boost_type required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the event exists and the requesting user is the promoter
    const { data: event, error: eventError } = await supabaseClient
      .from('events')
      .select('id, title, promoter_id, boosted, boost_type, boost_status, boost_started_at, boost_expires_at, date')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (event.promoter_id !== user.id) {
      return new Response(JSON.stringify({ error: 'You are not the owner of this event' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine amount — full price or upgrade delta
    const isActiveBoosted = event.boosted && event.boost_status === 'active';
    let amount = BOOST_PRICES[boost_type].amount;
    let isUpgrade = false;

    if (isActiveBoosted && event.boost_type) {
      if (event.boost_type === boost_type) {
        return new Response(JSON.stringify({ error: 'This boost plan is already active' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const upgradeAmount = UPGRADE_PRICE[event.boost_type]?.[boost_type];
      if (upgradeAmount === undefined) {
        return new Response(JSON.stringify({ error: 'Downgrading an active boost is not permitted' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      amount = upgradeAmount;
      isUpgrade = true;
    }

    const pkg = BOOST_PRICES[boost_type];
    const sessionLabel = isUpgrade ? `Upgrade to ${pkg.label}` : pkg.label;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: sessionLabel,
            description: `${isUpgrade ? 'Upgrade boost for' : 'Boost'}: "${event.title}"`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      // Custom scheme redirect — works with WebBrowser.openAuthSessionAsync on iOS/Android
      success_url: `onspaceapp://boost-success?session_id={CHECKOUT_SESSION_ID}&event_id=${event_id}`,
      cancel_url:  `onspaceapp://boost-cancel?event_id=${event_id}`,
      metadata: {
        event_id,
        boost_type,
        promoter_id:               user.id,
        is_upgrade:                String(isUpgrade),
        previous_boost_type:       event.boost_type ?? '',
        previous_boost_started_at: event.boost_started_at ?? '',
        event_date:                event.date ?? '',
      },
    });

    console.log(`[create-boost-checkout] session=${session.id} event=${event_id} type=${boost_type} amount=${amount} upgrade=${isUpgrade}`);

    return new Response(JSON.stringify({ url: session.url, session_id: session.id, amount, is_upgrade: isUpgrade }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[create-boost-checkout] Unexpected error:', err);
    return new Response(JSON.stringify({ error: `Stripe: ${String(err)}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
