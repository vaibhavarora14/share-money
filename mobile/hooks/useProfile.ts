import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchWithAuth } from '../utils/api';

export interface Profile {
  id: string;
  full_name?: string;
  avatar_url?: string;
  phone?: string;
  country_code?: string;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export function useProfile() {
  const { session } = useAuth();
  const [data, setData] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!session) {
      setData(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetchWithAuth('/profile');
      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`);
      }
      const profile: Profile = await response.json();
      
      setData(profile);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch profile');
      setError(error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!session) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetchWithAuth('/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update profile: ${response.status}`);
      }

      const updatedProfile: Profile = await response.json();
      setData(updatedProfile);
      return updatedProfile;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update profile');
      setError(error);
      throw error;
    }
  }, [session]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
    updateProfile,
  };
}

