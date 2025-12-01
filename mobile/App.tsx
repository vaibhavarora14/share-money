import * as Sentry from "@sentry/react-native";
import { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Text as RNText, StyleSheet, useColorScheme, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Provider as PaperProvider,
  useTheme,
} from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomNavBar } from "./components/BottomNavBar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  useAddMember,
  useCreateGroup,
  useRemoveMember,
} from "./hooks/useGroupMutations";
import { useGroupDetails } from "./hooks/useGroups";
import { useProfile } from "./hooks/useProfile";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from "./hooks/useTransactions";
import { AddMemberScreen } from "./screens/AddMemberScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { BalancesScreen } from "./screens/BalancesScreen";
import { GroupDetailsScreen } from "./screens/GroupDetailsScreen";
import { GroupStatsMode, GroupStatsScreen } from "./screens/GroupStatsScreen";
import { GroupsListScreen } from "./screens/GroupsListScreen";
import { ProfileSetupScreen } from "./screens/ProfileSetupScreen";
import { TransactionFormScreen } from "./screens/TransactionFormScreen";
import { darkTheme, lightTheme } from "./theme";
import { Group, GroupWithMembers } from "./types";
import { getDefaultCurrency } from "./utils/currency";

// ... imports

function AppContent() {
  const { session, loading, signOut } = useAuth();
  const theme = useTheme();
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
  const [statsContext, setStatsContext] = useState<{
    groupId: string;
    mode: GroupStatsMode;
  } | null>(null);
  const prevSessionRef = React.useRef<Session | null>(null);
  const groupsListRefetchRef = React.useRef<(() => void) | null>(null);

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

  if (loading || (session && profileLoading)) {
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

  // Check if profile is incomplete
  const isProfileIncomplete =
    !profile || !profile.profile_completed || !profile.full_name;

  // Show balances screen (with bottom nav)
  if (currentRoute === "balances") {
    return (
      <>
        <BalancesScreen />
        <BottomNavBar
          currentRoute={currentRoute}
          onGroupsPress={() => {
            setCurrentRoute("groups");
          }}
          onBalancesPress={() => {
            setCurrentRoute("balances");
          }}
          onProfilePress={() => {
            setCurrentRoute("profile");
          }}
          onLogoutPress={signOut}
          isProfileIncomplete={isProfileIncomplete}
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
          }}
        />
        <BottomNavBar
          currentRoute={currentRoute}
          onGroupsPress={() => {
            setCurrentRoute("groups");
          }}
          onBalancesPress={() => {
            setCurrentRoute("balances");
          }}
          onProfilePress={() => {
            setCurrentRoute("profile");
          }}
          onLogoutPress={signOut}
          isProfileIncomplete={isProfileIncomplete}
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
          groupMembers={selectedGroupDetails?.members || []}
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
          }}
          onAddMember={() => setShowAddMember(true)}
          onRemoveMember={async (userId: string) => {
            await handleRemoveMember(userId);
          }}
          onLeaveGroup={() => {
            setSelectedGroup(null);
            setCurrentRoute("groups");
            setStatsContext(null);
          }}
          onDeleteGroup={() => {
            setSelectedGroup(null);
            setCurrentRoute("groups");
            setStatsContext(null);
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
          }}
          onBalancesPress={() => {
            setSelectedGroup(null);
            setCurrentRoute("balances");
            setStatsContext(null);
          }}
          onLogoutPress={signOut}
          onProfilePress={() => setCurrentRoute("profile")}
          isProfileIncomplete={isProfileIncomplete}
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
        onRefetchReady={(refetch) => {
          groupsListRefetchRef.current = refetch;
        }}
      />
      <BottomNavBar
        currentRoute={currentRoute}
        onGroupsPress={() => setCurrentRoute("groups")}
        onBalancesPress={() => setCurrentRoute("balances")}
        onProfilePress={() => setCurrentRoute("profile")}
        onLogoutPress={signOut}
        isProfileIncomplete={isProfileIncomplete}
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
  console.error("App Error:", error);
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

// Initialize Sentry once at app startup
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,

  // Errors & sessions
  enableAutoSessionTracking: true,
  enableNative: true,
  enableNativeCrashHandling: true,

  // Performance
  tracesSampleRate: 0.1,
  integrations: [
    // Cast through `any` to avoid TypeScript issues with the
    // experimental mobile replay API typings.
    Sentry.mobileReplayIntegration({
      // Consider turning these to true if you need stricter privacy
      maskAllText: false,
      maskAllImages: false,
    }),
  ],

  // Session Replay
  // Capture 10% of all sessions and 100% of sessions with an error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? darkTheme : lightTheme;

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        console.error("ErrorBoundary caught error:", error);
        console.error("Error info:", errorInfo);
      }}
      onReset={() => {
        // Error boundary reset
      }}
    >
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
