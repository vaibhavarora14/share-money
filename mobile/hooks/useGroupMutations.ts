import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Group, GroupWithMembers } from '../types';
import { apiFetch } from '../utils/api';

export const useCreateGroup = () => {
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (groupData: {
      name: string;
      description?: string;
    }): Promise<Group> => {
      const response = await apiFetch(
        '/groups',
        {
          method: 'POST',
          body: JSON.stringify(groupData),
        },
        session,
        signOut
      );
      return response.json();
    },
    onSuccess: () => {
      // Invalidate groups list to refetch
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
};

export const useAddMember = () => {
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
        '/group-members',
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
      // Invalidate group details and invitations
      queryClient.invalidateQueries({ queryKey: ['groupDetails', variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ['groupInvitations', variables.groupId] });
    },
  });
};

export const useRemoveMember = () => {
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      userId,
    }: {
      groupId: string;
      userId: string;
    }): Promise<void> => {
      await apiFetch(
        `/group-members?group_id=${groupId}&user_id=${userId}`,
        {
          method: 'DELETE',
        },
        session,
        signOut
      );
    },
    onSuccess: (_, variables) => {
      // Invalidate group details
      queryClient.invalidateQueries({ queryKey: ['groupDetails', variables.groupId] });
      // Also invalidate groups list in case user leaves
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
};

export const useDeleteGroup = () => {
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (groupId: string): Promise<void> => {
      await apiFetch(
        `/groups/${groupId}`,
        {
          method: 'DELETE',
        },
        session,
        signOut
      );
    },
    onSuccess: () => {
      // Invalidate groups list
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
};
