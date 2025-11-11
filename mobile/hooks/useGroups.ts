import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Group } from "../types";
import { fetchWithAuth } from "../utils/api";

export function useGroups() {
  const { session } = useAuth();

  return useQuery<Group[]>({
    queryKey: ["groups"],
    queryFn: async () => {
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetchWithAuth("/groups");
      return response.json();
    },
    enabled: !!session,
  });
}
