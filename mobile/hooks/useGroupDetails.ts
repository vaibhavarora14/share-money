import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { GroupWithMembers } from '../types';
import { apiFetch } from '../utils/api';

export const useGroupDetails = (groupId: string | null) => {
  const { session, signOut } = useAuth();

  return useQuery({
    queryKey: ['groupDetails', groupId],
    queryFn: async (): Promise<GroupWithMembers> => {
      if (!groupId) {
        throw new Error('Group ID is required');
      }
      const response = await apiFetch(`/groups/${groupId}`, {}, session, signOut);
      return response.json();
    },
    enabled: !!session && !!groupId,
  });
};
