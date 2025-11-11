import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Group } from '../types';
import { apiFetch } from '../utils/api';

export const useGroups = () => {
  const { session, signOut } = useAuth();

  return useQuery({
    queryKey: ['groups'],
    queryFn: async (): Promise<Group[]> => {
      const response = await apiFetch('/groups', {}, session, signOut);
      return response.json();
    },
    enabled: !!session,
  });
};
