import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface GroupInvitation {
  id: string;
  group_id: string;
  email: string;
  invited_by: string;
  created_at: string;
  status: 'pending' | 'accepted' | 'declined';
}

export function useGroupInvitationsSimple(groupId: string | null) {
  const { session } = useAuth();
  const [data, setData] = useState<GroupInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!session || !groupId) {
      setData([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(`/invitations?group_id=${groupId}`);
      const invitations: GroupInvitation[] = await response.json();
      
      setData(invitations);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch invitations'));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [session, groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData
  };
}

export function useCancelInvitationSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (variables: { invitationId: string; groupId: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(`/invitations/${variables.invitationId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error('Failed to cancel invitation');
      }
      
      if (onSuccess) onSuccess();
      
      return variables;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to cancel invitation');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

