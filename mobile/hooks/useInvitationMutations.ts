import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../utils/api';

export const useCreateInvitation = () => {
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      email,
    }: {
      groupId: string;
      email: string;
    }): Promise<any> => {
      const response = await apiFetch(
        '/invitations',
        {
          method: 'POST',
          body: JSON.stringify({
            group_id: groupId,
            email: email,
          }),
        },
        session,
        signOut
      );
      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate invitations for this group
      queryClient.invalidateQueries({ queryKey: ['groupInvitations', variables.groupId] });
    },
  });
};

export const useCancelInvitation = () => {
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invitationId,
      groupId,
    }: {
      invitationId: string;
      groupId: string;
    }): Promise<void> => {
      await apiFetch(
        `/invitations/${invitationId}`,
        {
          method: 'DELETE',
        },
        session,
        signOut
      );
    },
    onSuccess: (_, variables) => {
      // Invalidate invitations for this group
      queryClient.invalidateQueries({ queryKey: ['groupInvitations', variables.groupId] });
    },
  });
};
