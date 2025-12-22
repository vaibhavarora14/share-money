import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createErrorResponse } from '../_shared/error-handler.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200, req);
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

    return createSuccessResponse({ participants }, 200, 0, req);
  } catch (error: any) {
    return createErrorResponse(400, error.message, 'DEBUG_ERROR', error.stack, req);
  }
});
