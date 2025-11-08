import "dotenv/config";
import { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

interface Group {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
}

interface GroupInvitation {
  id: string;
  group_id: string;
  email: string;
  role: "owner" | "member";
  invited_by: string;
  created_at: string;
  accepted_at: string | null;
}

interface GroupWithMembers extends Group {
  members?: Array<GroupMember & { email?: string }>;
  invitations?: Array<GroupInvitation>;
}

export const handler: Handler = async (event, _context) => {
  const log = (..._args: any[]) => undefined;
  const logError = (...args: any[]) => console.error(...args);

  log("Incoming request", {
    method: event.httpMethod,
    path: event.path,
    query: event.queryStringParameters,
    hasBody: Boolean(event.body),
    headers: Object.keys(event.headers || {}),
  });
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    log("Handling OPTIONS preflight");
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  try {
    // Get Supabase credentials from environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      logError("Missing Supabase credentials", {
        supabaseUrlPresent: Boolean(supabaseUrl),
        supabaseKeyPresent: Boolean(supabaseKey),
      });
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing Supabase credentials" }),
      };
    }

    // Get authorization header
    const authHeader =
      event.headers.authorization ||
      event.headers.Authorization ||
      event.headers["authorization"] ||
      event.headers["Authorization"] ||
      (event.multiValueHeaders &&
        (event.multiValueHeaders.authorization?.[0] ||
          event.multiValueHeaders.Authorization?.[0]));

    if (!authHeader) {
      logError("Missing authorization header");
      return {
        statusCode: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Unauthorized: Missing authorization header",
        }),
      };
    }

    // Verify the user
    log("Validating user with Supabase");
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: supabaseKey,
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text().catch(() => "");
      logError("Supabase user validation failed", {
        status: userResponse.status,
        errorText,
      });
      return {
        statusCode: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Unauthorized: Invalid or expired token",
        }),
      };
    }

    const user = await userResponse.json();
    log("Authenticated Supabase user", { id: user?.id });

    if (!user || !user.id) {
      logError("Supabase user payload missing id", { user });
      return {
        statusCode: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Unauthorized: Invalid user data",
        }),
      };
    }

    // Extract email from user object (could be user.email or user.user?.email)
    const currentUserEmail = user.email || user.user?.email || null;

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const httpMethod = event.httpMethod;
    const pathParts = event.path.split("/").filter(Boolean);
    const groupId =
      pathParts[pathParts.length - 1] !== "groups"
        ? pathParts[pathParts.length - 1]
        : null;
    log("Route resolved", { httpMethod, groupId });

    // Handle GET /groups - List all groups user belongs to
    if (httpMethod === "GET" && !groupId) {
      const { data: groups, error } = await supabase
        .from("groups")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        logError("Supabase error fetching groups", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return {
          statusCode: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Failed to fetch groups",
            details: error.message,
          }),
        };
      }

      log("Fetched groups", { count: groups?.length || 0 });
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(groups || []),
      };
    }

    // Handle GET /groups/:id - Get group details with members
    if (httpMethod === "GET" && groupId) {
      log("Fetching group details", { groupId });
      // Get group details
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId)
        .single();

      if (groupError || !group) {
        logError("Group not found", { groupId, groupError });
        return {
          statusCode: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Group not found" }),
        };
      }

      log("Group metadata", { name: group.name, created_by: group.created_by });
      // Get group members
      const { data: members, error: membersError } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });

      if (membersError) {
        logError("Supabase error fetching members", {
          message: membersError.message,
          details: membersError.details,
          hint: membersError.hint,
          code: membersError.code,
        });
        return {
          statusCode: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Failed to fetch group members",
            details: membersError.message,
          }),
        };
      }

      // Get pending invitations for this group
      const { data: invitations, error: invitationsError } = await supabase
        .from("group_invitations")
        .select("*")
        .eq("group_id", groupId)
        .is("accepted_at", null)
        .order("created_at", { ascending: true });

      if (invitationsError) {
        console.error("Supabase error fetching invitations:", invitationsError);
        // Don't fail the request if invitations can't be fetched
      }

      // Try to get user emails using admin API if service role key is available
      // Also include current user's email if they're a member
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      log("Member enrichment context", {
        hasServiceRoleKey: Boolean(serviceRoleKey),
        memberCount: members?.length || 0,
        currentUserId: user.id,
        currentUserEmail,
      });
      let membersWithEmails = members || [];

      if (serviceRoleKey) {
        try {
          membersWithEmails = await Promise.all(
            (members || []).map(async (member) => {
              // If this is the current user, use their email directly
              if (member.user_id === user.id && currentUserEmail) {
                return {
                  ...member,
                  email: currentUserEmail,
                };
              }

              // Otherwise, fetch from Admin API
              try {
                log("Fetching member via admin API", {
                  memberId: member.user_id,
                });
                const userResponse = await fetch(
                  `${supabaseUrl}/auth/v1/admin/users/${member.user_id}`,
                  {
                    headers: {
                      Authorization: `Bearer ${serviceRoleKey}`,
                      apikey: serviceRoleKey,
                    },
                  }
                );
                log("Admin API response", {
                  memberId: member.user_id,
                  status: userResponse.status,
                  ok: userResponse.ok,
                });
                if (userResponse.ok) {
                  const userData = await userResponse.json();
                  log("Admin API payload keys", {
                    memberId: member.user_id,
                    keys: Object.keys(userData || {}),
                  });
                  const email =
                    userData.user?.email ||
                    userData.email ||
                    userData?.email ||
                    null;
                  log("Resolved member email", {
                    memberId: member.user_id,
                    email,
                  });
                  return {
                    ...member,
                    email: email,
                  };
                } else {
                  const errorText = await userResponse.text();
                  logError("Admin API lookup failed", {
                    memberId: member.user_id,
                    status: userResponse.status,
                    errorText,
                  });
                }
              } catch (err) {
                logError("Exception fetching member via admin API", {
                  memberId: member.user_id,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
              return member;
            })
          );
        } catch (err) {
          logError("Error enriching member emails", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        // If no service role key, at least set current user's email
        membersWithEmails = (members || []).map((member) => {
          if (member.user_id === user.id && currentUserEmail) {
            return {
              ...member,
              email: currentUserEmail,
            };
          }
          return member;
        });
      }

      log("Final members with emails", {
        members: membersWithEmails.map((m) => ({
          id: m.id,
          user_id: m.user_id,
          email: m.email,
          role: m.role,
        })),
      });

      const groupWithMembers: GroupWithMembers = {
        ...group,
        members: membersWithEmails,
        invitations: invitations || [],
      };

      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(groupWithMembers),
      };
    }

    // Handle POST /groups - Create new group
    if (httpMethod === "POST") {
      log("Handling group creation");
      let groupData: Partial<Group>;
      try {
        groupData = JSON.parse(event.body || "{}");
      } catch (e) {
        logError("Invalid JSON body for create group", {
          bodyPreview: event.body?.slice(0, 200),
        });
        return {
          statusCode: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Invalid JSON in request body" }),
        };
      }

      // Validate required fields
      if (!groupData.name || !groupData.name.trim()) {
        logError("Missing name when creating group", { groupData });
        return {
          statusCode: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing required field: name" }),
        };
      }

      // Create group using SECURITY DEFINER function to bypass RLS issues
      // This ensures auth.uid() is properly recognized
      const { data: groupResult, error } = await supabase.rpc("create_group", {
        group_name: groupData.name.trim(),
        group_description: groupData.description?.trim() || null,
      });

      if (error) {
        logError("Supabase create_group RPC failed", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return {
          statusCode: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Failed to create group",
            details: error.message,
          }),
        };
      }

      log("create_group RPC succeeded", { groupId: groupResult });
      // Fetch the created group to return full details
      const { data: group, error: fetchError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupResult)
        .single();

      if (fetchError || !group) {
        logError("Failed to fetch newly created group", {
          fetchError,
          groupId: groupResult,
        });
        return {
          statusCode: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Failed to fetch created group",
            details: fetchError?.message,
          }),
        };
      }

      log("Created group successfully", { groupId: group.id });
      return {
        statusCode: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(group),
      };
    }

    // Handle DELETE /groups/:id - Delete group
    if (httpMethod === "DELETE" && groupId) {
      log("Handling group deletion", { groupId });
      // Verify user is the owner
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("created_by")
        .eq("id", groupId)
        .single();

      if (groupError || !group) {
        logError("Group not found when deleting", { groupId, groupError });
        return {
          statusCode: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Group not found" }),
        };
      }

      if (group.created_by !== user.id) {
        logError("Unauthorized group delete attempt", {
          groupId,
          requester: user.id,
          owner: group.created_by,
        });
        return {
          statusCode: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Only group owners can delete groups",
          }),
        };
      }

      const { error: deleteError } = await supabase
        .from("groups")
        .delete()
        .eq("id", groupId);

      if (deleteError) {
        logError("Supabase error deleting group", {
          message: deleteError.message,
          details: deleteError.details,
          hint: deleteError.hint,
          code: deleteError.code,
        });
        return {
          statusCode: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Failed to delete group",
            details: deleteError.message,
          }),
        };
      }

      log("Group deleted successfully", { groupId });
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          message: "Group deleted successfully",
        }),
      };
    }

    // Method not allowed
    logError("Method not allowed", { httpMethod, path: event.path });
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (error: any) {
    logError("Unhandled exception", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
