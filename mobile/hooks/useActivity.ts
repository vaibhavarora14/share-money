import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { ActivityItem, ActivityFeedResponse } from '../types';

export function useActivity(groupId?: string | null) {
  const { session } = useAuth();
  const [data, setData] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session || !groupId) {
      setData([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth(`/activity?group_id=${groupId}&limit=50`);
      if (!response.ok) {
        throw new Error(`Failed to fetch activity: ${response.status}`);
      }
      const result: ActivityFeedResponse = await response.json();
      
      setData(result.activities || []);
      setTotal(result.total || 0);
      setHasMore(result.has_more || false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch activity'));
      setData([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [session, groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data: { activities: data },
    isLoading,
    error,
    total,
    hasMore,
    refetch: fetchData
  };
}
