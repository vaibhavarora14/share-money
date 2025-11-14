import { QueryClient, focusManager } from "@tanstack/react-query";
import { AppState, AppStateStatus, Platform } from "react-native";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Always consider data stale - fetch fresh data every time
      gcTime: 0, // Don't cache - remove data immediately when unused
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true, // Refetch when network reconnects
    },
    mutations: {
      retry: 1,
    },
  },
});

// Configure React Query to refetch when app comes to foreground (React Native)
if (Platform.OS !== "web") {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      if (status === "active") {
        handleFocus();
      }
    });

    return () => {
      subscription.remove();
    };
  });
}
