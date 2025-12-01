import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { BalancesResponse } from '../types';

export function useBalances(groupId?: string | null) {
  const { session } = useAuth();
  const [data, setData] = useState<BalancesResponse>({ group_balances: [], overall_balances: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!session || !session.access_token) {
      setData({ group_balances: [], overall_balances: [] });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const endpoint = groupId
        ? `/balances?group_id=${groupId}`
        : "/balances";
      
      const response = await fetchWithAuth(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch balances: ${response.status}`);
      }
      const result: BalancesResponse = await response.json();
      
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch balances'));
      setData({ group_balances: [], overall_balances: [] });
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, groupId]);

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
