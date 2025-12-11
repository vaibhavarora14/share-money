import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchWithAuth } from "../utils/api";
import { log, logError } from "../utils/logger";

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
  const { user } = useAuth();
  const [data, setData] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const startedAt = new Date().toISOString();
    log("[Profile] Fetch start", { startedAt });

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetchWithAuth("/profile");
      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`);
      }
      const profile: Profile = await response.json();

      setData(profile);
      log("[Profile] Fetch success", {
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to fetch profile");
      logError(error, {
        context: "Profile fetch",
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      setError(error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!user?.id) {
        throw new Error("Not authenticated");
      }

      try {
        const response = await fetchWithAuth("/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
              `Failed to update profile: ${response.status}`
          );
        }

        const updatedProfile: Profile = await response.json();
        setData(updatedProfile);
        return updatedProfile;
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error("Failed to update profile");
        setError(error);
        logError(error, { context: "Profile update", updates });
        throw error;
      }
    },
    [user?.id]
  );

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
    updateProfile,
  };
}

