import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GroupInvitation } from '../types';
import { fetchWithAuth } from '../utils/api';

export function useGroupInvitations(groupId: string | null) {
  const { user } = useAuth();
  const [data, setData] = useState<GroupInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id || !groupId) {
      setData([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(`/invitations?group_id=${groupId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch invitations: ${response.status}`);
      }
      const invitations: GroupInvitation[] = await response.json();
      
      setData(invitations);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch invitations'));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, groupId]);

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

export function useCancelInvitation(onSuccess?: () => void) {
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
