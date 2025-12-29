import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import { Session } from "@supabase/supabase-js";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  Alert,
  Platform,
  Text as RNText,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Provider as PaperProvider,
  useTheme,
} from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomNavBar } from "./components/BottomNavBar";
import { ForceUpdateModal } from "./components/ForceUpdateModal";
import { JoinGroupPreview } from "./components/JoinGroupPreview";
import { AUTH_TIMEOUTS } from "./constants/auth";
import { WEB_MAX_WIDTH } from "./constants/layout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { UpgradeProvider, useUpgrade } from "./contexts/UpgradeContext";
import { queryKeys } from "./hooks/queryKeys";
import { fetchActivity } from "./hooks/useActivity";
import { fetchBalances } from "./hooks/useBalances";
import {
  acceptGroupInvitationRPC,
  getGroupInfoFromTokenRPC,
} from "./hooks/useGroupInvitations";
import {
  useAddMember,
  useCreateGroup,
  useRemoveMember,
} from "./hooks/useGroupMutations";
import { fetchGroupDetails, useGroupDetails } from "./hooks/useGroups";
import { useProfile } from "./hooks/useProfile";
import {
  fetchTransactions,
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from "./hooks/useTransactions";
import { AddMemberScreen } from "./screens/AddMemberScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { GroupDetailsScreen } from "./screens/GroupDetailsScreen";
import { GroupStatsMode, GroupStatsScreen } from "./screens/GroupStatsScreen";
import { GroupsListScreen } from "./screens/GroupsListScreen";
import { ProfileSetupScreen } from "./screens/ProfileSetupScreen";
import { TransactionFormScreen } from "./screens/TransactionFormScreen";
import { darkTheme, lightTheme } from "./theme";
import { Group, GroupWithMembers } from "./types";
import { getDefaultCurrency } from "./utils/currency";
import { showErrorAlert } from "./utils/errorHandling";
import { log, logError } from "./utils/logger";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

// ... imports

function AppContent() {
  const { session, loading, signOut, user } = useAuth();
  const theme = useTheme();
  const queryClientInstance = useQueryClient();
  const {
    data: profile,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = useProfile();
  const [isSignUp, setIsSignUp] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string>("groups");
  const [invitationsRefreshTrigger, setInvitationsRefreshTrigger] =
    useState<number>(0);
  const [groupRefreshTrigger, setGroupRefreshTrigger] = useState<number>(0);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [statsContext, setStatsContext] = useState<{
    groupId: string;
    mode: GroupStatsMode;
  } | null>(null);
  const prevSessionRef = React.useRef<Session | null>(null);
  const groupsListRefetchRef = React.useRef<(() => void) | null>(null);
  const lastLoggedStateRef = React.useRef<string | null>(null);
  const stuckTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const prefetchGroupData = React.useCallback(
    async (groupId: string) => {
      await Promise.all([
        queryClientInstance.prefetchQuery({
          queryKey: queryKeys.group(groupId),
          queryFn: () => fetchGroupDetails(groupId),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: queryKeys.transactions(groupId),
          queryFn: () => fetchTransactions(groupId),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: queryKeys.balances(groupId),
          queryFn: () => fetchBalances(groupId),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: queryKeys.activity(groupId),
          queryFn: () => fetchActivity(groupId),
        }),
      ]);
    },
    [queryClientInstance]
  );

  const handleJoinGroup = React.useCallback(
    async (token: string, autoJoin: boolean = false) => {
      try {
        const info = await getGroupInfoFromTokenRPC(token);
        if (!info || !info.is_valid) {
          Alert.alert(
            "Invalid Link",
            "This invite link is invalid or expired."
          );
          return;
        }

        // Auto-join without confirmation (e.g., after signup from invite link)
        if (autoJoin) {
          try {
            if (!session?.user?.id) {
              logError(
                new Error("No session user ID available"),
                "Auto-join failed - no user ID"
              );
              return;
            }
            await acceptGroupInvitationRPC(token, session.user.id);
            if (groupsListRefetchRef.current) groupsListRefetchRef.current();
            setGroupRefreshTrigger((p) => p + 1); // Trigger updates

            // Clear the join token from state
            setJoinToken(null);

            // Update URL on web to remove /join/... path
            if (Platform.OS === "web" && typeof window !== "undefined") {
              const baseUrl = window.location.origin;
              window.history.replaceState({}, "", baseUrl);
            }

            Alert.alert("Success", `You've joined "${info.group_name}"!`);
          } catch (e) {
            logError(e, "Error auto-joining group after signup");
            showErrorAlert(e, null, "Failed to join group");
          }
          return;
        }

        // Show confirmation dialog for manual joins
        Alert.alert(
          "Join Group",
          `Do you want to join "${info.group_name}"? (${info.member_count} members)`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Join",
              onPress: async () => {
                try {
                  if (!session?.user?.id) return;
                  await acceptGroupInvitationRPC(token, session.user.id);
                  if (groupsListRefetchRef.current)
                    groupsListRefetchRef.current();
                  setGroupRefreshTrigger((p) => p + 1); // Trigger updates

                  // Clear the join token from state
                  setJoinToken(null);

                  // Update URL on web to remove /join/... path
                  if (Platform.OS === "web" && typeof window !== "undefined") {
                    const baseUrl = window.location.origin;
                    window.history.replaceState({}, "", baseUrl);
                  }

                  Alert.alert("Success", "You have joined the group!");
                } catch (e) {
                  showErrorAlert(e, null, "Failed to join");
                }
              },
            },
          ]
        );
      } catch (e) {
        logError(e, "Error handling join group link");
        Alert.alert(
          "Error",
          "Failed to process invite link. Please try again."
        );
      }
    },
    [session?.user?.id]
  );

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      // Regex to match "join/<UUID>" in the URL
      const match = event.url.match(/join\/([a-f0-9-]{36})/i);
      if (match && match[1]) {
        const token = match[1];
        try {
          if (session?.user?.id) {
            await handleJoinGroup(token, false);
            setJoinToken(null);
          } else {
            await AsyncStorage.setItem("pending_invite_token", token);
            setJoinToken(token); // Show preview
          }
        } catch (error) {
          logError(error, "Error handling deep link");
        }
      }
    };

    const sub = Linking.addEventListener("url", handleDeepLink);

    // On web, Linking.getInitialURL might not include the path accurately sometimes
    // so we provide a fallback for web specifically
    const getInitial = async () => {
      try {
        let url = await Linking.getInitialURL();
        if (Platform.OS === "web" && !url && typeof window !== "undefined") {
          url = window.location.href;
        }
        if (url) handleDeepLink({ url });
      } catch (error) {
        logError(error, "Error getting initial URL");
      }
    };

    getInitial();
    return () => sub.remove();
  }, [session?.user?.id, handleJoinGroup]);

  // Check pending token on session init (auto-join after signup)
  useEffect(() => {
    if (session?.user?.id) {
      // Small delay to ensure session is fully initialized
      const timeoutId = setTimeout(async () => {
        try {
          const token = await AsyncStorage.getItem("pending_invite_token");
          if (token) {
            // Clear joinToken state first to hide preview screen
            setJoinToken(null);

            // Update URL on web to remove /join/... path before joining
            if (Platform.OS === "web" && typeof window !== "undefined") {
              const baseUrl = window.location.origin;
              window.history.replaceState({}, "", baseUrl);
            }

            // Auto-join without confirmation since user came from invite link
            await handleJoinGroup(token, true);
            await AsyncStorage.removeItem("pending_invite_token");
          }
        } catch (error) {
          logError(error, "Error processing pending invite token");
        }
      }, 500); // 500ms delay to ensure session is ready

      return () => clearTimeout(timeoutId);
    }
  }, [session?.user?.id, handleJoinGroup]);

  // Clear and isolate cache on logout
  useEffect(() => {
    if (!session) {
      queryClientInstance.clear();
    }
  }, [queryClientInstance, session?.user?.id]);

  // Debug routing / loading state to track "stuck on spinner" issues.
  // To avoid noisy duplicate breadcrumbs, only log when the state snapshot changes.
  useEffect(() => {
    const snapshot = JSON.stringify({
      currentRoute,
      hasSession: !!session,
      authLoading: loading,
      profileLoading,
      hasProfile: !!profile,
    });

    if (snapshot === lastLoggedStateRef.current) {
      return;
    }

    lastLoggedStateRef.current = snapshot;

    // Use debug level so these show up as low-priority breadcrumbs.
    log("[AppContent] State", JSON.parse(snapshot), "debug");
  }, [currentRoute, session, loading, profileLoading, profile]);

  // Detect if auth is stuck in loading state for 15+ seconds
  useEffect(() => {
    // Clear any existing timeout
    if (stuckTimeoutRef.current) {
      clearTimeout(stuckTimeoutRef.current);
    }

    stuckTimeoutRef.current = setTimeout(() => {
      if (loading) {
        Sentry.captureMessage("Auth stuck in loading state for 15+ seconds", {
          level: "warning",
          tags: {
            issue: "auth_loading_stuck",
          },
          extra: {
            hasSession: !!session,
            hasUser: !!user,
            profileLoading,
            hasProfile: !!profile,
          },
        });
      }
    }, AUTH_TIMEOUTS.STUCK_LOADING_DETECTION);

    return () => {
      if (stuckTimeoutRef.current) {
        clearTimeout(stuckTimeoutRef.current);
      }
    };
  }, [loading, session, user, profileLoading, profile]);

  // Fetch selected group details via query when selectedGroup changes
  const { data: selectedGroupDetails, refetch: refetchSelectedGroup } =
    useGroupDetails(selectedGroup?.id ?? null);

  // Mutations (declare in the scope where used)
  const createGroupMutation = useCreateGroup(refetchSelectedGroup);
  const addMemberMutation = useAddMember(refetchSelectedGroup);
  const removeMemberMutation = useRemoveMember(refetchSelectedGroup);

  // Transaction mutations
  const onTransactionSuccess = () => {
    setCurrentRoute("group-details");
    setEditingTransaction(null);
  };

  const createTx = useCreateTransaction(onTransactionSuccess);
  const updateTx = useUpdateTransaction(onTransactionSuccess);
  const deleteTx = useDeleteTransaction(onTransactionSuccess);

  // Reset navigation state on logout and login (only when session state changes)
  useEffect(() => {
    const hadSession = prevSessionRef.current !== null;
    const hasSession = session !== null;

    // Only reset when transitioning between logged in/out states
    if (hadSession !== hasSession) {
      setCurrentRoute("groups");
      setSelectedGroup(null);
      setShowAddMember(false);
      setEditingTransaction(null);
    }

    prevSessionRef.current = session;
  }, [session]);

  // All API calls now use React Query hooks or fetchWithAuth utility

  const handleCreateGroup = async (groupData: {
    name: string;
    description?: string;
  }) => {
    await createGroupMutation.mutate(groupData);
    // Refetch groups list to show the newly created group
    if (groupsListRefetchRef.current) {
      groupsListRefetchRef.current();
    }
  };

  const handleAddMember = async (email: string) => {
    if (!selectedGroup) {
      throw new Error("Invalid request");
    }

    const result = await addMemberMutation.mutate({
      groupId: selectedGroup.id,
      email,
    });

    // Always trigger invitations refresh after adding a member
    // This handles both cases:
    // 1. Invitation was created (need to show it)
    // 2. Member was added directly (need to remove any pending invitation for that user)
    setInvitationsRefreshTrigger((prev) => prev + 1);
    // Trigger group refresh to update members list
    setGroupRefreshTrigger((prev) => prev + 1);
    return result;
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) {
      throw new Error("Invalid request");
    }
    await removeMemberMutation.mutate({
      groupId: selectedGroup.id,
      userId,
    });
  };

  const handleGroupPress = (group: Group) => {
    prefetchGroupData(group.id).catch((err) =>
      logError(err, { context: "prefetchGroupData", groupId: group.id })
    );
    setSelectedGroup(group);
    setCurrentRoute("group-details");
    setStatsContext(null);
    // Group details will be fetched via useGroupDetails hook
  };

  const handleSaveTransaction = async (transactionData: any) => {
    if (!selectedGroup) return;

    if (editingTransaction) {
      await updateTx.mutate({
        ...transactionData,
        id: editingTransaction.id,
        group_id: selectedGroup.id,
        currency: transactionData.currency || getDefaultCurrency(),
      });
    } else {
      await createTx.mutate({
        ...transactionData,
        group_id: selectedGroup.id,
        currency: transactionData.currency || getDefaultCurrency(),
      });
    }
  };

  const handleDeleteTransaction = async () => {
    if (!editingTransaction || !selectedGroup) return;
    await deleteTx.mutate({
      id: editingTransaction.id,
      group_id: selectedGroup.id,
    });
  };

  if (loading) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator size="large" />
        <StatusBar style={theme.dark ? "light" : "dark"} />
      </View>
    );
  }

  if (!session) {
    if (joinToken) {
      return (
        <>
          <JoinGroupPreview
            token={joinToken}
            onLogin={() => {
              // Keep the token stored so we can use it after login
              // The token will be processed in the session effect
              setJoinToken(null);
            }}
            onCancel={() => setJoinToken(null)}
          />
          <StatusBar style={theme.dark ? "light" : "dark"} />
        </>
      );
    }

    return (
      <>
        <AuthScreen
          isSignUp={isSignUp}
          onToggleMode={() => setIsSignUp(!isSignUp)}
        />
        <StatusBar style={theme.dark ? "light" : "dark"} />
      </>
    );
  }

  // Show profile screen
  if (currentRoute === "profile") {
    return (
      <>
        <ProfileSetupScreen
          onComplete={() => {
            refetchProfile();
            setCurrentRoute("groups");
            setGroupRefreshTrigger((prev) => prev + 1);
          }}
        />
        <BottomNavBar
          currentRoute={currentRoute}
          onGroupsPress={() => {
            setCurrentRoute("groups");
            setGroupRefreshTrigger((prev) => prev + 1);
          }}
          onProfilePress={() => {
            setCurrentRoute("profile");
          }}
          onLogoutPress={signOut}
        />
        <StatusBar style={theme.dark ? "light" : "dark"} />
      </>
    );
  }

  // Show transaction form screen
  if (currentRoute === "transaction-form" && selectedGroup) {
    return (
      <>
        <TransactionFormScreen
          transaction={editingTransaction}
          onSave={handleSaveTransaction}
          onDismiss={() => {
            setCurrentRoute("group-details");
            setEditingTransaction(null);
          }}
          onDelete={editingTransaction ? handleDeleteTransaction : undefined}
          defaultCurrency={getDefaultCurrency()}
          groupId={selectedGroup.id}
        />
        <StatusBar style={theme.dark ? "light" : "dark"} />
      </>
    );
  }

  if (currentRoute === "group-stats" && statsContext) {
    return (
      <>
        <GroupStatsScreen
          groupId={statsContext.groupId}
          mode={statsContext.mode}
          onBack={() => {
            setStatsContext(null);
            setCurrentRoute(selectedGroup ? "group-details" : "groups");
          }}
        />
        <StatusBar style={theme.dark ? "light" : "dark"} />
      </>
    );
  }

  // Show group details screen (with bottom nav)
  // Render as soon as a group is selected - the screen handles loading states internally
  if (currentRoute === "group-details" && selectedGroup) {
    // Use fetched group details if available, otherwise use selectedGroup as initial data
    // GroupDetailsScreen will handle loading state while fetching full details
    const groupToDisplay: GroupWithMembers = selectedGroupDetails || {
      ...selectedGroup,
      members: [],
      invitations: [],
    };

    return (
      <>
        <GroupDetailsScreen
          group={groupToDisplay}
          refreshTrigger={invitationsRefreshTrigger}
          groupRefreshTrigger={groupRefreshTrigger}
          onBack={() => {
            setSelectedGroup(null);
            setCurrentRoute("groups");
            setStatsContext(null);
            setGroupRefreshTrigger((prev) => prev + 1);
          }}
          onAddMember={() => setShowAddMember(true)}
          onRemoveMember={async (userId: string) => {
            await handleRemoveMember(userId);
          }}
          onLeaveGroup={() => {
            setSelectedGroup(null);
            setCurrentRoute("groups");
            setStatsContext(null);
            setGroupRefreshTrigger((prev) => prev + 1);
          }}
          onAddTransaction={() => {
            setEditingTransaction(null);
            setCurrentRoute("transaction-form");
          }}
          onEditTransaction={(transaction) => {
            setEditingTransaction(transaction);
            setCurrentRoute("transaction-form");
          }}
          onStatsPress={(mode) => {
            if (!groupToDisplay.id) return;
            setStatsContext({ groupId: groupToDisplay.id, mode });
            setCurrentRoute("group-stats");
          }}
        />
        <BottomNavBar
          currentRoute={currentRoute}
          onGroupsPress={() => {
            setSelectedGroup(null);
            setCurrentRoute("groups");
            setStatsContext(null);
            setGroupRefreshTrigger((prev) => prev + 1);
          }}
          onLogoutPress={signOut}
          onProfilePress={() => setCurrentRoute("profile")}
        />
        {showAddMember && selectedGroup && (
          <AddMemberScreen
            visible={showAddMember}
            groupId={selectedGroup.id}
            onAddMember={async (email) => {
              const result = await handleAddMember(email);
              // Don't close modal automatically - let AddMemberScreen handle it
              return result;
            }}
            onDismiss={() => {
              setShowAddMember(false);
            }}
          />
        )}
        <StatusBar style={theme.dark ? "light" : "dark"} />
      </>
    );
  }

  // Show groups list (with bottom nav)
  return (
    <>
      <GroupsListScreen
        onGroupPress={handleGroupPress}
        onCreateGroup={handleCreateGroup}
        onRefetchReady={(refetch: () => Promise<void>) => {
          groupsListRefetchRef.current = refetch;
        }}
        refetchTrigger={groupRefreshTrigger}
      />
      <BottomNavBar
        currentRoute={currentRoute}
        onGroupsPress={() => {
          setCurrentRoute("groups");
          setGroupRefreshTrigger((prev) => prev + 1);
        }}
        onProfilePress={() => setCurrentRoute("profile")}
        onLogoutPress={signOut}
      />
      <StatusBar style={theme.dark ? "light" : "dark"} />
    </>
  );
}

// Error Fallback Component
function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  const theme = useTheme();

  // Still log to console in dev via the centralized logger, and ensure
  // the error is captured by Sentry in all environments.
  logError(error, { source: "ErrorFallback" });

  return (
    <View
      style={[
        styles.errorContainer,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <RNText style={[styles.errorTitle, { color: theme.colors.error }]}>
        Something went wrong
      </RNText>
      <RNText style={[styles.errorMessage, { color: theme.colors.onSurface }]}>
        {error.message}
      </RNText>
      <RNText
        style={[styles.errorStack, { color: theme.colors.onSurfaceVariant }]}
      >
        {error.stack}
      </RNText>
      <Button onPress={resetErrorBoundary} mode="contained">
        Try Again
      </Button>
    </View>
  );
}

// Initialize Sentry once at app startup. Guard against missing DSN so we
// fail safely in development and avoid noisy misconfiguration in production.
if (!process.env.EXPO_PUBLIC_SENTRY_DSN) {
  const env = __DEV__ ? "development" : "production";
  // In dev, make it very obvious that Sentry is not configured.
  // eslint-disable-next-line no-console
  console.warn(
    `[Sentry] EXPO_PUBLIC_SENTRY_DSN is not set; Sentry will not be initialized (env=${env}).`
  );
} else {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,

    // Explicit environment so dev vs prod are separated in Sentry
    environment:
      process.env.EXPO_PUBLIC_SENTRY_ENV ||
      (__DEV__ ? "development" : "production"),

    // Errors & sessions
    enableAutoSessionTracking: true,
    enableNative: true,
    enableNativeCrashHandling: true,

    // Performance
    tracesSampleRate: Number(
      process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"
    ),
    integrations: [
      // Cast through `any` to avoid TypeScript issues with the
      // experimental mobile replay API typings.
      Sentry.mobileReplayIntegration({
        // NOTE: These are left as false initially while we test internally.
        // Before broad production rollout, consider enabling them or
        // masking specific sensitive screens/inputs.
        maskAllText: false,
        maskAllImages: false,
      }) as any,
    ],

    // Session Replay
    // Capture a portion of sessions and 100% of sessions with an error.
    replaysSessionSampleRate: Number(
      process.env.EXPO_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? "0.1"
    ),
    replaysOnErrorSampleRate: Number(
      process.env.EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? "1.0"
    ),
  });
}

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? darkTheme : lightTheme;

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        logError(error, {
          source: "ErrorBoundary",
          info: errorInfo,
        });
      }}
      onReset={() => {
        // Error boundary reset
      }}
    >
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <View
              style={[
                styles.mainContainer,
                { backgroundColor: theme.colors.background },
              ]}
            >
              <UpgradeProvider>
                <AuthProvider>
                  <View
                    style={[
                      styles.appWrapper,
                      { backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <AppContent />
                    <ForceUpdateOverlay />
                  </View>
                </AuthProvider>
              </UpgradeProvider>
            </View>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

// Force Update Overlay - shows modal when upgrade is required
function ForceUpdateOverlay() {
  const { isUpgradeRequired, upgradeMessage, upgradeDetails } = useUpgrade();

  return (
    <ForceUpdateModal
      visible={isUpgradeRequired}
      message={upgradeMessage || undefined}
      storeUrlIos={upgradeDetails?.storeUrlIos}
      storeUrlAndroid={upgradeDetails?.storeUrlAndroid}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
    width: "100%",
  },
  appWrapper: {
    flex: 1,
    width: "100%",
    maxWidth: WEB_MAX_WIDTH,
    alignSelf: "center",
    // Border and shadow only on web for premium desktop experience
    ...(Platform.OS === "web" && {
      borderWidth: 1,
      borderColor: "rgba(0, 0, 0, 0.05)",
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 5,
    }),
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  summarySurface: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  transactionCard: {
    marginBottom: 0,
  },
  cardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  transactionLeft: {
    flex: 1,
    marginRight: 16,
    minWidth: 0,
  },
  description: {
    marginBottom: 8,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  transactionRight: {
    alignItems: "flex-end",
    minWidth: 100,
  },
  amount: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  typeChip: {
    height: 24,
  },
  chipAndActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButtons: {
    flexDirection: "row",
    marginLeft: 8,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
  groupsButton: {
    position: "absolute",
    margin: 16,
    left: 0,
    bottom: 0,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: "center",
  },
  errorStack: {
    fontSize: 12,
    marginBottom: 20,
    textAlign: "center",
  },
});
