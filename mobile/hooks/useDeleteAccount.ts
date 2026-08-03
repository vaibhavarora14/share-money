import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { fetchWithAuth } from "../utils/api";

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation<void, Error>({
    mutationFn: async () => {
      const response = await fetchWithAuth("/delete-account", {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as any).message ||
            (errorData as any).error ||
            `Failed to delete account: ${response.status}`
        );
      }
    },
    onSuccess: async () => {
      queryClient.clear();
      await supabase.auth.signOut().catch(() => undefined);
    },
  });
}
