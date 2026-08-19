// verify-whatsapp-otp — LEGACY / INACTIVE
//
// This Edge Function is NO LONGER called by the active WhatsApp login path.
// WhatsApp authentication now uses native Supabase phone auth:
//   send:   supabase.auth.signInWithOtp({ phone, options: { channel: 'whatsapp' } })
//   verify: supabase.auth.verifyOtp({ phone, token, type: 'sms' })
//
// This file is kept in the repository for reference only.
// DO NOT deploy or invoke this function for authentication.
// The @vybzhub.internal internal-email creation pattern has been REMOVED.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // This endpoint is disabled. WhatsApp auth uses native Supabase phone auth.
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'This endpoint is disabled. WhatsApp authentication uses native Supabase phone auth.',
      code: 'ENDPOINT_DISABLED',
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
