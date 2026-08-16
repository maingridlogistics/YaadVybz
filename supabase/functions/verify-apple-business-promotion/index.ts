// verify-apple-business-promotion — Apple IAP verification for Business promotions.
//
// Mirrors the architecture of verify-apple-transaction for Event boosts.
// Business promotion products are consumables — one-time purchases that activate
// a time-limited promotional placement, NOT a recurring subscription.
//
// SECURITY MODEL:
//   • Authenticated user JWT required
//   • JWS signature verified against Apple x5c cert chain
//   • appAccountToken must match authenticated user
//   • apple_transactions table enforces idempotency (UNIQUE transaction_id)
//   • activate_business_promotion() RPC is SECURITY DEFINER — client cannot call directly
//   • Owner must own the business being promoted (verified inside RPC)
//
// Request:  POST /functions/v1/verify-apple-business-promotion
//   Auth:   Bearer <supabase_access_token>
//   Body:   { signedTransaction, promotionId, productId }
//
// Response: { ok, environment } | { ok: false, error }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAppleJWS, type AppleTransactionPayload } from '../_shared/appleJws.ts';
import { checkAppleTransactionIdempotency, recordAppleTransaction } from '../_shared/entitlements.ts';

// ─── Business promotion product IDs (consumables) ─────────────────────────────
// Must match exactly what is registered in App Store Connect.
const BPROMO_PRODUCTS: Record<string, { placement: string; durationDays: number }> = {
  'com.vybzhub.bizpromo.home.3day':      { placement: 'home',     durationDays: 3  },
  'com.vybzhub.bizpromo.home.7day':      { placement: 'home',     durationDays: 7  },
  'com.vybzhub.bizpromo.home.14day':     { placement: 'home',     durationDays: 14 },
  'com.vybzhub.bizpromo.explore.7day':   { placement: 'explore',  durationDays: 7  },
  'com.vybzhub.bizpromo.explore.14day':  { placement: 'explore',  durationDays: 14 },
  'com.vybzhub.bizpromo.parish.7day':    { placement: 'parish',   durationDays: 7  },
  'com.vybzhub.bizpromo.parish.14day':   { placement: 'parish',   durationDays: 14 },
  'com.vybzhub.bizpromo.category.7day':  { placement: 'category', durationDays: 7  },
  'com.vybzhub.bizpromo.category.14day': { placement: 'category', durationDays: 14 },
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  // ── 1. Authenticate ──────────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'Authorization required' }), {
      status: 401, headers: jsonHeaders,
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: jsonHeaders,
    });
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let body: { signedTransaction?: string; promotionId?: string; productId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  const { signedTransaction, promotionId } = body;

  if (!signedTransaction || typeof signedTransaction !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'signedTransaction is required' }), {
      status: 400, headers: jsonHeaders,
    });
  }
  if (!promotionId || typeof promotionId !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'promotionId is required' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 3. Verify Apple JWS signature ────────────────────────────────────────────
  let tx: AppleTransactionPayload;
  try {
    tx = await verifyAppleJWS<AppleTransactionPayload>(signedTransaction);
  } catch (e) {
    console.error(`[verify-apple-bizpromo] JWS verification failed user=${user.id.slice(0,8)}:`, String(e).slice(0, 200));
    return new Response(JSON.stringify({ ok: false, error: 'Apple transaction verification failed' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 4. Bundle ID check ────────────────────────────────────────────────────────
  const expectedBundle = Deno.env.get('APPLE_BUNDLE_ID') ?? 'com.chambex.vybzhub';
  if (tx.bundleId !== expectedBundle) {
    return new Response(JSON.stringify({ ok: false, error: 'Transaction bundle ID mismatch' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 5. Sandbox guard ─────────────────────────────────────────────────────────
  const isSandbox = tx.environment === 'Sandbox';
  if (isSandbox && Deno.env.get('APPLE_REJECT_SANDBOX') === 'true') {
    return new Response(JSON.stringify({ ok: false, error: 'Sandbox transactions not accepted' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 6. appAccountToken cross-check ───────────────────────────────────────────
  if (tx.appAccountToken) {
    const txToken = tx.appAccountToken.toLowerCase().replace(/-/g, '');
    const sessionUid = user.id.toLowerCase().replace(/-/g, '');
    if (txToken !== sessionUid) {
      console.error(`[verify-apple-bizpromo] appAccountToken mismatch: tx=${txToken.slice(0,8)} user=${sessionUid.slice(0,8)}`);
      return new Response(JSON.stringify({ ok: false, error: 'Transaction was initiated by a different account' }), {
        status: 403, headers: jsonHeaders,
      });
    }
  }

  // ── 7. Idempotency check ─────────────────────────────────────────────────────
  const existing = await checkAppleTransactionIdempotency(supabaseAdmin, tx.transactionId);
  if (existing) {
    const samePromotion = existing.includes(`promo_${promotionId}`);
    if (samePromotion) {
      console.log(`[verify-apple-bizpromo] Duplicate tx=${tx.transactionId} same promotion — cached success`);
      return new Response(JSON.stringify({ ok: true, cached: true, environment: tx.environment }), {
        status: 200, headers: jsonHeaders,
      });
    }
    // Already used for different promotion — reject
    console.warn(`[verify-apple-bizpromo] Replay rejected: tx=${tx.transactionId} already used (action=${existing})`);
    return new Response(JSON.stringify({ ok: false, error: 'This transaction has already been used for another promotion' }), {
      status: 409, headers: jsonHeaders,
    });
  }

  // ── 8. Validate product ID ───────────────────────────────────────────────────
  const productConfig = BPROMO_PRODUCTS[tx.productId];
  if (!productConfig) {
    console.error(`[verify-apple-bizpromo] Unknown product: ${tx.productId}`);
    return new Response(JSON.stringify({ ok: false, error: `Unknown promotion product: ${tx.productId}` }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 9. Verify promotion belongs to this user and is pending_payment ──────────
  const { data: promo } = await supabaseAdmin
    .from('business_promotions')
    .select('id, owner_id, business_id, status, duration_days')
    .eq('id', promotionId)
    .maybeSingle();

  if (!promo) {
    return new Response(JSON.stringify({ ok: false, error: 'Promotion not found' }), {
      status: 404, headers: jsonHeaders,
    });
  }
  if (promo.owner_id !== user.id) {
    return new Response(JSON.stringify({ ok: false, error: 'You do not own this promotion' }), {
      status: 403, headers: jsonHeaders,
    });
  }
  if (promo.status !== 'pending_payment') {
    // Idempotency: already activated
    if (promo.status === 'active') {
      return new Response(JSON.stringify({ ok: true, cached: true, environment: tx.environment }), {
        status: 200, headers: jsonHeaders,
      });
    }
    return new Response(JSON.stringify({ ok: false, error: `Promotion is in status: ${promo.status}` }), {
      status: 409, headers: jsonHeaders,
    });
  }

  // ── 10. Verify business is still live ────────────────────────────────────────
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, status')
    .eq('id', promo.business_id)
    .maybeSingle();

  if (!biz || biz.status !== 'live') {
    return new Response(JSON.stringify({ ok: false, error: 'Business must be live to activate promotion' }), {
      status: 409, headers: jsonHeaders,
    });
  }

  // ── 11. Activate promotion via RPC ────────────────────────────────────────────
  const env: 'production' | 'sandbox' = isSandbox ? 'sandbox' : 'production';
  const { error: activateErr } = await supabaseAdmin.rpc('activate_business_promotion', {
    p_promotion_id:          promotionId,
    p_payment_provider:      'apple',
    p_amount:                0,       // RPC will read from product; store 0 as placeholder
    p_currency:              'usd',
    p_apple_transaction_id:  tx.transactionId,
    p_apple_original_tx_id:  tx.originalTransactionId,
    p_store_product_id:      tx.productId,
    p_environment:           env,
  });

  if (activateErr) {
    console.error(`[verify-apple-bizpromo] activate_business_promotion failed:`, activateErr.message);
    return new Response(JSON.stringify({ ok: false, error: 'Promotion activation failed — please contact support' }), {
      status: 500, headers: jsonHeaders,
    });
  }

  // ── 12. Record for idempotency ────────────────────────────────────────────────
  await recordAppleTransaction(supabaseAdmin, {
    transactionId:         tx.transactionId,
    originalTransactionId: tx.originalTransactionId,
    productId:             tx.productId,
    purchaseType:          'consumable',
    userId:                user.id,
    eventId:               null,
    environment:           tx.environment,
    processedAction:       `bizpromo_${productConfig.placement}_promo_${promotionId}`,
    rawSignedPayload:      signedTransaction,
  });

  console.log(`[verify-apple-bizpromo] Promotion activated: user=${user.id.slice(0,8)} promotion=${promotionId} product=${tx.productId} env=${tx.environment}`);
  return new Response(JSON.stringify({ ok: true, environment: tx.environment }), {
    status: 200, headers: jsonHeaders,
  });
});
