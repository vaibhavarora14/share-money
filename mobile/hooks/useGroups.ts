import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { Group, GroupWithMembers } from '../types';

export function useGroups() {
  const { session } = useAuth();
  const [data, setData] = useState<Group[]>([]);
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
      
      const response = await fetchWithAuth('/groups');
      if (!response.ok) {
        throw new Error(`Failed to fetch groups: ${response.status}`);
      }
      const groups: Group[] = await response.json();
      
      setData(groups);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch groups'));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

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
  const { session } = useAuth();
  const [data, setData] = useState<GroupWithMembers | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!session || !groupId) {
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
