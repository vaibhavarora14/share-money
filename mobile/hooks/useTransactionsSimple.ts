import { useState, useEffect, useCallback } from 'react';
import { Transaction } from '../types';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

export function useTransactionsSimple(groupId?: string | null) {
  const { session } = useAuth();
  const [data, setData] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    console.log('[useTransactionsSimple] fetchData called', { session: !!session, groupId });
    if (!session) {
      setData([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const endpoint = groupId
        ? `/transactions?group_id=${groupId}`
        : "/transactions";
      
      console.log('[useTransactionsSimple] Fetching from', endpoint);
      const response = await fetchWithAuth(endpoint);
      const transactions: Transaction[] = await response.json();
      console.log('[useTransactionsSimple] Received', transactions.length, 'transactions:', JSON.stringify(transactions));
      
      setData(transactions);
    } catch (err) {
      console.log('[useTransactionsSimple] Error fetching', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch transactions'));
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

// Mutation hooks
export function useCreateTransactionSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (transactionData: Omit<Transaction, "id" | "created_at" | "user_id">) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth("/transactions", {
        method: "POST",
        body: JSON.stringify(transactionData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create transaction');
      }
      
      if (onSuccess) onSuccess();
      
      return response.status === 204 ? null : await response.json();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create transaction');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useUpdateTransactionSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (transactionData: Omit<Transaction, "created_at" | "user_id">) => {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[UpdateTransaction ${timestamp}] Starting update`, transactionData);
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth("/transactions", {
        method: "PUT",
        body: JSON.stringify(transactionData),
      });
      
      console.log(`[UpdateTransaction ${timestamp}] Response status`, response.status);
      
      if (!response.ok) {
        throw new Error('Failed to update transaction');
      }
      
      const updatedTransaction = response.status === 204 ? null : await response.json();
      console.log('[UpdateTransaction] Received updated transaction:', updatedTransaction);
      
      if (onSuccess) {
        // No delay - just refetch immediately and accept eventual consistency
        onSuccess();
      }
      
      console.log('[UpdateTransaction] Done');
      return updatedTransaction;
    } catch (err) {
      console.log('[UpdateTransaction] Error', err);
      const error = err instanceof Error ? err : new Error('Failed to update transaction');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useDeleteTransactionSimple(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (variables: { id: number; group_id?: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('[DeleteTransaction] Starting deletion', variables);
      const response = await fetchWithAuth(`/transactions?id=${variables.id}`, {
        method: "DELETE",
      });
      console.log('[DeleteTransaction] Response status', response.status);
      
      if (!response.ok) {
        throw new Error('Failed to delete transaction');
      }
      
      if (onSuccess) onSuccess();
      
      return response.status === 204 ? null : await response.json();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete transaction');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

