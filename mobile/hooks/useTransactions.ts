import { useState, useEffect, useCallback } from 'react';
import { Transaction } from '../types';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

export function useTransactions(groupId?: string | null) {
  const { session } = useAuth();
  const [data, setData] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
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
      
      const response = await fetchWithAuth(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.status}`);
      }
      const transactions: Transaction[] = await response.json();
      
      setData(transactions);
    } catch (err) {
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
export function useCreateTransaction(onSuccess?: () => void) {
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

export function useUpdateTransaction(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (transactionData: Omit<Transaction, "created_at" | "user_id">) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth("/transactions", {
        method: "PUT",
        body: JSON.stringify(transactionData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update transaction');
      }
      
      const updatedTransaction = response.status === 204 ? null : await response.json();
      
      if (onSuccess) {
        onSuccess();
      }
      
      return updatedTransaction;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update transaction');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useDeleteTransaction(onSuccess?: () => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (variables: { id: number; group_id?: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(`/transactions?id=${variables.id}`, {
        method: "DELETE",
      });
      
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
