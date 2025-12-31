import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabase";
import { GroupInvitation } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

// ... imports

export async function createGroupShareLinkRPC(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_share_link', {
    p_group_id: groupId
  });
  
  if (error) throw error;
  return data; // Returns UUID string
}

export interface GroupInfoFromToken {
    group_name: string | null;
    member_count: number | null;
    is_valid: boolean;
}

export async function getGroupInfoFromTokenRPC(token: string): Promise<GroupInfoFromToken> {
    const { data, error } = await supabase.rpc('get_group_info_from_token', {
        p_token: token
    });
    if (error) throw error;
    
    // Handle case where function returns empty result or null
    if (!data || data.length === 0 || !data[0]) {
        return {
            group_name: null,
            member_count: null,
            is_valid: false
        };
    }
    
    return data[0] as GroupInfoFromToken;
}

export async function acceptGroupInvitationRPC(invitationId: string, userId: string) {
    const { data, error } = await supabase.rpc('accept_group_invitation', {
        invitation_id: invitationId,
        accepting_user_id: userId
    });
    if (error) throw error;
    return data;
}

export function useCreateGroupShareLink() {
  return useMutation({
    mutationFn: createGroupShareLinkRPC,
  });
}


export async function fetchGroupInvitations(
  groupId: string
): Promise<GroupInvitation[]> {
  const response = await fetchWithAuth(`/invitations?group_id=${groupId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch invitations: ${response.status}`);
  }
  return response.json();
}

export function useGroupInvitations(groupId: string | null) {
  const { user } = useAuth();

  const query = useQuery<GroupInvitation[], Error>({
    // Guarded by `enabled`, so groupId is always non-null inside queryFn
    queryKey: groupId ? queryKeys.invitations(groupId) : queryKeys.invitations(""),
    queryFn: () => fetchGroupInvitations(groupId as string),
    enabled: !!user?.id && !!groupId,
    // Use placeholderData so initial load still reports isLoading=true
    placeholderData: [],
    staleTime: 60_000,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

export function useCancelInvitation(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (variables: { invitationId: string; groupId: string }) => {
      const response = await fetchWithAuth(
        `/invitations/${variables.invitationId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to cancel invitation");
      }

      return variables;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invitations(data.groupId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.group(data.groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.participants(data.groupId) });
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}
