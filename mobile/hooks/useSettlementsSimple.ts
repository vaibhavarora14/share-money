import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface Settlement {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  description?: string;
  settled_at: string;
  created_at: string;
  from_user_name?: string;
  to_user_name?: string;
  from_user_email?: string;
  to_user_email?: string;
}

interface SettlementsResponse {
  settlements: Settlement[];
}

export function useSettlementsSimple(groupId?: string | null) {
  const { session } = useAuth();
  const [data, setData] = useState<Settlement[]>([]);
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
      
      const response = await fetchWithAuth(`/settlements?group_id=${groupId}`);
      const result: SettlementsResponse = await response.json();
      
      setData(result.settlements || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch settlements'));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [session, groupId]);

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

export function useCreateSettlementSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (settlementData: {
    group_id: string;
    from_user_id: string;
    to_user_id: string;
    amount: number;
    currency: string;
    description?: string;
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

export function useUpdateSettlementSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (settlementData: {
    id: string;
    amount: number;
    description?: string;
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

export function useDeleteSettlementSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (variables: { id: string; groupId?: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(`/settlements?id=${variables.id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
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

