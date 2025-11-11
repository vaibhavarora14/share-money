import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Transaction } from '../types';
import { apiFetch } from '../utils/api';

export const useCreateTransaction = () => {
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      transactionData: Omit<Transaction, 'id' | 'created_at' | 'user_id'>
    ): Promise<Transaction> => {
      const response = await apiFetch(
        '/transactions',
        {
          method: 'POST',
          body: JSON.stringify(transactionData),
        },
        session,
        signOut
      );
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate transactions queries
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      // If transaction has a group_id, also invalidate that specific group's transactions
      if (data.group_id) {
        queryClient.invalidateQueries({ queryKey: ['transactions', data.group_id] });
      }
    },
  });
};

export const useUpdateTransaction = () => {
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...transactionData
    }: Omit<Transaction, 'created_at' | 'user_id'>): Promise<Transaction> => {
      const response = await apiFetch(
        '/transactions',
        {
          method: 'PUT',
          body: JSON.stringify({
            ...transactionData,
            id,
          }),
        },
        session,
        signOut
      );
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate transactions queries
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      // If transaction has a group_id, also invalidate that specific group's transactions
      if (data.group_id) {
        queryClient.invalidateQueries({ queryKey: ['transactions', data.group_id] });
      }
    },
  });
};

export const useDeleteTransaction = () => {
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      transactionId,
      groupId,
    }: {
      transactionId: number;
      groupId?: string | null;
    }): Promise<void> => {
      await apiFetch(
        `/transactions?id=${transactionId}`,
        {
          method: 'DELETE',
        },
        session,
        signOut
      );
    },
    onSuccess: (_, variables) => {
      // Invalidate transactions queries
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      // If we know the group_id, also invalidate that specific group's transactions
      if (variables.groupId) {
        queryClient.invalidateQueries({ queryKey: ['transactions', variables.groupId] });
      }
    },
  });
};
