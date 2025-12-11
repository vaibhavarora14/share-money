import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Group, GroupWithMembers } from '../types';
import { fetchWithAuth } from '../utils/api';

export function useGroups() {
  const { user } = useAuth();
  const [data, setData] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setData([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth('/groups');
      if (!response.ok) {
        throw new Error(`Failed to fetch groups: ${response.status}`);
      }
      const groups: Group[] = await response.json();
      
      setData(groups);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch groups');
      setError(error);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

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

export function useGroupDetails(groupId: string | null) {
  const { user } = useAuth();
  const [data, setData] = useState<GroupWithMembers | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id || !groupId) {
      setData(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(`/groups/${groupId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch group details: ${response.status}`);
      }
      const group: GroupWithMembers = await response.json();
      
      setData(group);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch group details'));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, groupId]);

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
