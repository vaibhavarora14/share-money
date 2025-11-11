import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { GroupInvitation } from '../types';
import { apiFetch } from '../utils/api';

export const useGroupInvitations = (groupId: string | null) => {
  const { session, signOut } = useAuth();

  return useQuery({
    queryKey: ['groupInvitations', groupId],
    queryFn: async (): Promise<GroupInvitation[]> => {
      if (!groupId) {
        throw new Error('Group ID is required');
      }
      const response = await apiFetch(
        `/invitations?group_id=${groupId}`,
        {},
        session,
        signOut
      );
      const data: GroupInvitation[] = await response.json();
      // Filter to only show pending invitations
      return data.filter((inv) => inv.status === 'pending');
    },
    enabled: !!session && !!groupId,
  });
};
