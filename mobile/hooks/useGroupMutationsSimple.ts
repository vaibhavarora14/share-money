import { useState } from 'react';
import { fetchWithAuth } from '../utils/api';

export function useCreateGroupSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (groupData: {
    name: string;
    description?: string;
  }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth("/groups", {
        method: "POST",
        body: JSON.stringify(groupData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create group');
      }
      
      const result = await response.json();
      
      if (onSuccess) onSuccess();
      
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create group');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useDeleteGroupSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (groupId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(`/groups/${groupId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete group');
      }
      
      if (onSuccess) onSuccess();
      
      return { groupId };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete group');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useAddMemberSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (variables: { groupId: string; email: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth("/group-members", {
        method: "POST",
        body: JSON.stringify({
          group_id: variables.groupId,
          email: variables.email,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add member');
      }
      
      const result = response.status === 204 ? null : await response.json();
      
      if (onSuccess) onSuccess();
      
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to add member');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useRemoveMemberSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (variables: { groupId: string; userId: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(
        `/group-members?group_id=${variables.groupId}&user_id=${variables.userId}`,
        { method: "DELETE" }
      );
      
      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to remove member');
      }
      
      if (onSuccess) onSuccess();
      
      return variables;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to remove member');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

