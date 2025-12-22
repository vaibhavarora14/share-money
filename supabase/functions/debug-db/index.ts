
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Hardcoded keys for debugging
    const supabaseUrl = 'http://127.0.0.1:54321';
    const supabaseKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'; // Service role key

    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const groupId = url.searchParams.get('group_id') || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    const { data: participants, error } = await supabase
      .from('participants')
      .select('*')
      .eq('group_id', groupId);

    if (error) throw error;

    return new Response(
      JSON.stringify({ participants }, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
