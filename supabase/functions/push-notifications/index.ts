import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface NotificationPayload {
  userIds?: string[]; // Target specific users
  allUsers?: boolean; // Broadcast to everyone
  title: string;
  body: string;
  data?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { userIds, allUsers, title, body, data }: NotificationPayload = await req.json();

    // 1. Fetch tokens
    let query = supabaseClient.from("push_tokens").select("token, user_id");
    
    if (!allUsers && userIds && userIds.length > 0) {
      query = query.in("user_id", userIds);
    }

    const { data: tokens, error: tokenError } = await query;

    if (tokenError) throw tokenError;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: "No tokens found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Prepare Expo notifications
    const notifications = tokens.map((t) => ({
      to: t.token,
      sound: "default",
      title,
      body,
      data: { ...data, userId: t.user_id },
    }));

    // 3. Send to Expo Push API
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(notifications),
    });

    const result = await response.json();

    // 4. Log notification in DB
    const logEntries = (allUsers ? [null] : (userIds || [])).map(uid => ({
        recipient_id: uid,
        title,
        body,
        data,
        is_system_generated: true
    }));
    
    await supabaseClient.from("notifications").insert(logEntries);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
