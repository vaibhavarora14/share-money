import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Settlement, SettlementsResponse } from '../types';
import { fetchWithAuth } from '../utils/api';

export function useSettlements(groupId?: string | null) {
  const { user } = useAuth();
  const [data, setData] = useState<Settlement[]>([]);
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
      
      const response = await fetchWithAuth(`/settlements?group_id=${groupId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch settlements: ${response.status}`);
      }
      const result: SettlementsResponse = await response.json();
      
      setData(result.settlements || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch settlements'));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data: { settlements: data },
    isLoading,
    error,
    refetch: fetchData
  };
}

export function useCreateSettlement(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (settlementData: {
    group_id: string;
    from_user_id: string;
    to_user_id: string;
    amount: number;
    currency: string;
    notes?: string;
  }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth("/settlements", {
        method: "POST",
        body: JSON.stringify(settlementData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create settlement');
      }
      
      if (onSuccess) onSuccess();
      
      return response.json();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create settlement');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useUpdateSettlement(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (settlementData: {
    id: string;
    amount?: number;
    currency?: string;
    notes?: string;
  }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth("/settlements", {
        method: "PUT",
        body: JSON.stringify(settlementData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update settlement');
      }
      
      if (onSuccess) onSuccess();
      
      return response.json();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update settlement');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useDeleteSettlement(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (variables: { id: string; groupId?: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(`/settlements?id=${variables.id}`, {
        method: "DELETE",
      });
      
      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to delete settlement');
      }
      
      if (onSuccess) onSuccess();
      
      return { id: variables.id, groupId: variables.groupId };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete settlement');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}
