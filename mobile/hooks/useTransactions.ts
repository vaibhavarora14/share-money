import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Transaction } from '../types';
import { apiFetch } from '../utils/api';

export const useTransactions = (groupId?: string | null) => {
  const { session, signOut } = useAuth();

  return useQuery({
    queryKey: ['transactions', groupId],
    queryFn: async (): Promise<Transaction[]> => {
      const endpoint = groupId
        ? `/transactions?group_id=${groupId}`
        : '/transactions';
      const response = await apiFetch(endpoint, {}, session, signOut);
      const data: Transaction[] = await response.json();
      // Filter to only show transactions for this group if groupId is provided
      if (groupId) {
        return data.filter((t) => t.group_id === groupId);
      }
      return data;
    },
    enabled: !!session,
  });
};
