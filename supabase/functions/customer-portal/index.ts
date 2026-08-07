// customer-portal — creates a Stripe Customer Portal session.
//
// The portal lets subscribers upgrade, downgrade, cancel, update payment methods,
// and view billing history without any additional app-side implementation.
// All plan changes flow back through Stripe webhooks → DB sync.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No billing account found. Please subscribe to a plan first.' }),
        { status: 404, headers: jsonHeaders }
      );
    }

    // IMPORTANT: The Stripe Customer Portal must be configured in the Stripe Dashboard
    // under Settings → Billing → Customer portal before this endpoint is callable.
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      // Deep-link back to the app after the user finishes in the portal.
      return_url: 'vybzhub://subscription-portal-return',
    });

    console.log(`[customer-portal] Session created for user ${user.id.slice(0, 8)}`);
    return new Response(
      JSON.stringify({ url: portalSession.url }),
      { status: 200, headers: jsonHeaders }
    );

  } catch (err) {
    console.error('[customer-portal] Error:', String(err).slice(0, 200));
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: jsonHeaders });
  }
});
