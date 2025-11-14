import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface Balance {
  user_id: string;
  user_name?: string;
  email?: string;
  balance?: number;
  amount?: number;
  currency: string;
}

interface BalancesResponse {
  balances?: Balance[];
  overall_balances?: Balance[];
}

export function useBalancesSimple(groupId?: string | null) {
  const { session } = useAuth();
  const [data, setData] = useState<BalancesResponse>({ balances: [], overall_balances: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    console.log('[useBalancesSimple] fetchData called', { session: !!session, groupId });
    if (!session) {
      setData({ balances: [], overall_balances: [] });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const endpoint = groupId
        ? `/balances?group_id=${groupId}`
        : "/balances";
      
      console.log('[useBalancesSimple] Fetching from', endpoint);
      const response = await fetchWithAuth(endpoint);
      const result: BalancesResponse = await response.json();
      console.log('[useBalancesSimple] Received balances', result);
      
      setData(result);
    } catch (err) {
      console.log('[useBalancesSimple] Error fetching', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch balances'));
      setData({ balances: [], overall_balances: [] });
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

