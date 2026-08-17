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
  Platform,
  LogBox,
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
import { BannerNotice, InAppBanner } from "./components/InAppBanner";
import { AUTH_TIMEOUTS } from "./constants/auth";
import { WEB_MAX_WIDTH } from "./constants/layout";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  ThemePreferenceProvider,
  useThemePreference,
} from "./contexts/ThemePreferenceContext";
import { UpgradeProvider, useUpgrade } from "./contexts/UpgradeContext";
import { queryKeys } from "./hooks/queryKeys";
import { useNotifications } from "./hooks/useNotifications";
import { fetchActivity } from "./hooks/useActivity";
import { fetchBalances } from "./hooks/useBalances";
import { redeemGroupInviteLinkRPC } from "./hooks/useGroupInvitations";
import {
  useAddMember,
  useCreateGroup,
  useRemoveMember,
} from "./hooks/useGroupMutations";
import { fetchGroupDetails, useGroupDetails } from "./hooks/useGroups";
import { useProfile } from "./hooks/useProfile";
import {
  fetchTransactionsPage,
  TransactionsCursor,
  TransactionsPageResponse,
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from "./hooks/useTransactions";
import { AddMemberScreen } from "./screens/AddMemberScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { GroupDetailsScreen } from "./screens/GroupDetailsScreen";
import { GroupStatsMode, GroupStatsScreen } from "./screens/GroupStatsScreen";
import { GroupsListScreen } from "./screens/GroupsListScreen";
import { NotificationDetailScreen } from "./screens/NotificationDetailScreen";
import { NotificationsScreen } from "./screens/NotificationsScreen";
import { ProfileSetupScreen } from "./screens/ProfileSetupScreen";
import { SplitwiseImportScreen } from "./screens/SplitwiseImportScreen";
import { TermsAcceptanceScreen } from "./screens/TermsAcceptanceScreen";
import { TransactionFormScreen } from "./screens/TransactionFormScreen";
import {
  getLastNotificationResponseData,
  syncEnabledPushRegistration,
  subscribeToNotificationResponses,
} from "./services/pushNotifications";
import { darkTheme, lightTheme } from "./theme";
import { Group, GroupWithMembers } from "./types";
import { getDefaultCurrency } from "./utils/currency";
import {
  extractGroupDeepLinkId,
  extractInviteToken,
  getConfiguredWebAppPath,
  getInviteLinkErrorMessage,
} from "./utils/inviteLinks";
import { log, logError } from "./utils/logger";
import { needsTermsAcceptance } from "./utils/onboardingFlow";

const PENDING_INVITE_TOKEN_KEY = "pending_invite_token";
const PENDING_GROUP_DEEP_LINK_KEY = "pending_group_deep_link";

if (Platform.OS === "web") {
  const ignoredWebWarning =
    "Animated: `useNativeDriver` is not supported because the native animated module is missing.";

  LogBox.ignoreLogs([
    ignoredWebWarning,
  ]);

  if (typeof console !== "undefined") {
    const originalWarn = console.warn;
    console.warn = (...args) => {
      if (
        typeof args[0] === "string" &&
        args[0].startsWith(ignoredWebWarning)
      ) {
        return;
      }

      originalWarn(...args);
    };
  }
}

/** Removes the invite token path from the web URL after handling it. */
function clearJoinPathFromWebUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.history.replaceState({}, "", getConfiguredWebAppPath() || "/");
  }
}

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
    error: profileError,
    refetch: refetchProfile,
  } = useProfile();
  const notificationInbox = useNotifications();
  const hasAcceptedCurrentTerms =
    !!profile && !needsTermsAcceptance(profile);
  const [isSignUp, setIsSignUp] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string>("groups");
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [notificationsReturnRoute, setNotificationsReturnRoute] = useState<"groups" | "group-details">("groups");
  const [groupInitialListMode, setGroupInitialListMode] = useState<"transactions" | "activity">("transactions");
  const [invitationsRefreshTrigger, setInvitationsRefreshTrigger] =
    useState<number>(0);
  const [groupRefreshTrigger, setGroupRefreshTrigger] = useState<number>(0);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [banner, setBanner] = useState<BannerNotice | null>(null);
  const dismissBanner = React.useCallback(() => setBanner(null), []);
  const [statsContext, setStatsContext] = useState<{
    groupId: string;
    mode: GroupStatsMode;
  } | null>(null);
  const prevSessionRef = React.useRef<Session | null>(null);
  const groupsListRefetchRef = React.useRef<(() => void) | null>(null);
  const lastLoggedStateRef = React.useRef<string | null>(null);
  const stuckTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const initialUrlHandledRef = React.useRef(false);
  const initialNotificationHandledRef = React.useRef(false);
  const pushRegistrationSyncedUserRef = React.useRef<string | null>(null);
  const redeemingTokenRef = React.useRef<string | null>(null);
  const openingGroupDeepLinkRef = React.useRef<string | null>(null);
  const prefetchGroupData = React.useCallback(
    async (groupId: string) => {
      await Promise.all([
        queryClientInstance.prefetchQuery({
          queryKey: queryKeys.group(groupId),
          queryFn: () => fetchGroupDetails(groupId),
        }),
        queryClientInstance.prefetchInfiniteQuery({
          queryKey: queryKeys.transactionsFeed(groupId),
          queryFn: ({ pageParam }) =>
            fetchTransactionsPage({ groupId, cursor: pageParam ?? null }),
          initialPageParam: null as TransactionsCursor | null,
          getNextPageParam: (lastPage: TransactionsPageResponse) =>
            lastPage.has_more ? lastPage.next_cursor : null,
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

  // Clear and isolate cache on logout
  useEffect(() => {
    if (!session) {
      queryClientInstance.clear();
    }
  }, [queryClientInstance, session?.user?.id]);

  /**
   * Redeems an invite-link token for the signed-in user immediately — no
   * confirmation ceremony. The outcome is reported through the non-blocking
   * top banner on the groups screen instead of dialogs.
   */
  const redeemInviteToken = React.useCallback(async (token: string) => {
    // Guard against double-processing (initial URL + url event, re-renders)
    if (redeemingTokenRef.current === token) return;
    redeemingTokenRef.current = token;

    // Land on the groups screen, where the banner lives.
    setSelectedGroup(null);
    setStatsContext(null);
    setCurrentRoute("groups");

    try {
      const result = await redeemGroupInviteLinkRPC(token);
      groupsListRefetchRef.current?.();
      setGroupRefreshTrigger((prev) => prev + 1);

      if (result.status === "expired") {
        setBanner({
          type: "error",
          message: "This invite link has expired. Ask for a new one.",
        });
      }
      // 'joined' and 'already_member' are intentionally silent: the joined
      // group appears in the list with a NEW tag until first opened.
    } catch (err) {
      logError(err, { context: "redeemInviteToken" });
      setBanner({ type: "error", message: getInviteLinkErrorMessage(err) });
    } finally {
      // Consume the token exactly once: clear storage and the URL so no
      // re-render, remount, or auth-state change can re-trigger a redeem.
      redeemingTokenRef.current = null;
      await AsyncStorage.removeItem(PENDING_INVITE_TOKEN_KEY).catch(() => {});
      clearJoinPathFromWebUrl();
    }
  }, []);

  const openGroupDeepLink = React.useCallback(async (
    groupId: string,
    initialMode: "transactions" | "activity" = "transactions"
  ) => {
    if (openingGroupDeepLinkRef.current === groupId) return;
    openingGroupDeepLinkRef.current = groupId;

    try {
      const group = await queryClientInstance.fetchQuery({
        queryKey: queryKeys.group(groupId),
        queryFn: () => fetchGroupDetails(groupId),
        staleTime: 60_000,
      });

      setBanner(null);
      setShowAddMember(false);
      setEditingTransaction(null);
      setStatsContext(null);
      setGroupInitialListMode(initialMode);
      setSelectedGroup(group);
      setCurrentRoute("group-details");
    } catch (err) {
      logError(err, { context: "openGroupDeepLink", groupId });
      setSelectedGroup(null);
      setStatsContext(null);
      setCurrentRoute("groups");
      setBanner({
        type: "error",
        message: "We couldn't open that group. Make sure you have access.",
      });
    } finally {
      await AsyncStorage.removeItem(PENDING_GROUP_DEEP_LINK_KEY).catch(
        () => {}
      );
      openingGroupDeepLinkRef.current = null;
    }
  }, [queryClientInstance]);

  const openNotifications = React.useCallback(() => {
    setNotificationsReturnRoute(selectedGroup ? "group-details" : "groups");
    setSelectedNotificationId(null);
    setCurrentRoute("notifications");
  }, [selectedGroup]);

  const handleNotificationResponse = React.useCallback((data: Record<string, unknown>) => {
    const notificationId = typeof data.notification_id === "string" ? data.notification_id : null;
    setNotificationsReturnRoute("groups");
    setSelectedGroup(null);
    if (notificationId) {
      setSelectedNotificationId(notificationId);
      setCurrentRoute("notification-detail");
    } else {
      setSelectedNotificationId(null);
      setCurrentRoute("notifications");
    }
  }, []);

  useEffect(() => {
    if (!session?.user?.id || !hasAcceptedCurrentTerms) return;
    const unsubscribe = subscribeToNotificationResponses(handleNotificationResponse);
    if (!initialNotificationHandledRef.current) {
      initialNotificationHandledRef.current = true;
      getLastNotificationResponseData()
        .then((data) => {
          if (data) handleNotificationResponse(data);
        })
        .catch((error) => logError(error, { context: "initial notification response" }));
    }
    return unsubscribe;
  }, [session?.user?.id, hasAcceptedCurrentTerms, handleNotificationResponse]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      pushRegistrationSyncedUserRef.current = null;
      return;
    }
    if (
      notificationInbox.data?.preference.push_enabled &&
      notificationInbox.data.preference.permission_status === "granted" &&
      pushRegistrationSyncedUserRef.current !== userId
    ) {
      pushRegistrationSyncedUserRef.current = userId;
      syncEnabledPushRegistration().catch((error) => {
        pushRegistrationSyncedUserRef.current = null;
        logError(error, { context: "sync push registration" });
      });
    }
  }, [session?.user?.id, notificationInbox.data?.preference]);

  // Handle deep links: initial URL (cold start / web navigation) + url events.
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      const token = extractInviteToken(url);
      if (token) {
        if (session?.user?.id && hasAcceptedCurrentTerms) {
          await redeemInviteToken(token);
        } else {
          // Stash the token until authentication and onboarding are complete.
          // straight to the sign-in screen (no preview step). Clean the URL
          // immediately — leaving /join/<token> in the address bar during the
          // auth flow is what allowed re-processing (remounts, url events) to
          // yank users back to a join screen mid-sign-in.
          await AsyncStorage.setItem(PENDING_INVITE_TOKEN_KEY, token).catch(
            () => {}
          );
          clearJoinPathFromWebUrl();
        }
        return;
      }

      const groupId = extractGroupDeepLinkId(url);
      if (!groupId) return;

      if (session?.user?.id && hasAcceptedCurrentTerms) {
        await openGroupDeepLink(groupId);
      } else {
        await AsyncStorage.setItem(PENDING_GROUP_DEEP_LINK_KEY, groupId).catch(
          () => {}
        );
      }
    };

    const subscription = Linking.addEventListener("url", (event) =>
      handleUrl(event.url)
    );

    if (!initialUrlHandledRef.current) {
      initialUrlHandledRef.current = true;
      (async () => {
        try {
          let url = await Linking.getInitialURL();
          if (
            !url &&
            Platform.OS === "web" &&
            typeof window !== "undefined"
          ) {
            url = window.location.href;
          }
          await handleUrl(url);
        } catch (err) {
          logError(err, { context: "deep link initial URL" });
        }
      })();
    }

    return () => subscription.remove();
  }, [
    session?.user?.id,
    hasAcceptedCurrentTerms,
    redeemInviteToken,
    openGroupDeepLink,
  ]);

  // After authentication and onboarding, consume any saved invite token.
  useEffect(() => {
    if (!session?.user?.id || !hasAcceptedCurrentTerms) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await AsyncStorage.getItem(PENDING_INVITE_TOKEN_KEY);
        if (!token || cancelled) return;
        await redeemInviteToken(token);
      } catch (err) {
        logError(err, { context: "pending invite token processing" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, hasAcceptedCurrentTerms, redeemInviteToken]);

  // After authentication and onboarding, open any saved group deep link.
  useEffect(() => {
    if (!session?.user?.id || !hasAcceptedCurrentTerms) return;

    let cancelled = false;
    (async () => {
      try {
        const groupId = await AsyncStorage.getItem(PENDING_GROUP_DEEP_LINK_KEY);
        if (!groupId || cancelled) return;
        await openGroupDeepLink(groupId);
      } catch (err) {
        logError(err, { context: "pending group deep link processing" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, hasAcceptedCurrentTerms, openGroupDeepLink]);

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

  const handleAddMember = async (person: {
    fullName?: string;
    email?: string | null;
    sourceParticipantId?: string;
  }) => {
    if (!selectedGroup) {
      throw new Error("Invalid request");
    }

    const result = await addMemberMutation.mutate({
      groupId: selectedGroup.id,
      fullName: person.fullName,
      email: person.email || null,
      sourceParticipantId: person.sourceParticipantId,
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
    setGroupInitialListMode("transactions");
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
    // Join links land here directly: the token is already stashed and will
    // be redeemed right after sign-in/sign-up (no preview step).
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

  if (profileLoading) {
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

  if (profileError || !profile) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <RNText style={{ color: theme.colors.onBackground }}>
          We couldn't load your account setup.
        </RNText>
        <Button onPress={() => void refetchProfile()}>Try again</Button>
        <Button mode="text" onPress={() => void signOut()}>
          Sign out
        </Button>
        <StatusBar style={theme.dark ? "light" : "dark"} />
      </View>
    );
  }

  if (needsTermsAcceptance(profile)) {
    return (
      <>
        <TermsAcceptanceScreen />
        <StatusBar style={theme.dark ? "light" : "dark"} />
      </>
    );
  }

  if (currentRoute === "notifications") {
    return (
      <>
        <NotificationsScreen
          onBack={() => setCurrentRoute(notificationsReturnRoute)}
          onOpenNotification={(notification) => {
            setSelectedNotificationId(notification.id);
            setCurrentRoute("notification-detail");
          }}
          onViewGroups={() => {
            setSelectedGroup(null);
            setCurrentRoute("groups");
          }}
        />
        <StatusBar style={theme.dark ? "light" : "dark"} />
      </>
    );
  }

  if (currentRoute === "notification-detail" && selectedNotificationId) {
    return (
      <>
        <NotificationDetailScreen
          notificationId={selectedNotificationId}
          onBack={() => setCurrentRoute("notifications")}
          onViewGroup={(groupId, showActivity) => {
            void openGroupDeepLink(groupId, showActivity ? "activity" : "transactions");
          }}
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

  // Show Splitwise import screen
  if (currentRoute === "splitwise-import" && selectedGroup) {
    return (
      <>
        <SplitwiseImportScreen
          groupId={selectedGroup.id}
          groupName={selectedGroup.name}
          onBack={() => setCurrentRoute("group-details")}
          onDone={() => setCurrentRoute("group-details")}
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
          onImportSplitwise={() => {
            setCurrentRoute("splitwise-import");
          }}
          onStatsPress={(mode) => {
            if (!groupToDisplay.id) return;
            setStatsContext({ groupId: groupToDisplay.id, mode });
            setCurrentRoute("group-stats");
          }}
          onNotificationsPress={openNotifications}
          unreadNotificationCount={notificationInbox.data?.unread_count ?? 0}
          initialListMode={groupInitialListMode}
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
            onAddMember={async (person) => {
              const result = await handleAddMember(person);
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
        onNotificationsPress={openNotifications}
      />
      <InAppBanner notice={banner} onDismiss={dismissBanner} />
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
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(
      "[Sentry] EXPO_PUBLIC_SENTRY_DSN is not set; Sentry will not be initialized."
    );
  }
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
          <ThemePreferenceProvider systemColorScheme={colorScheme}>
            <ThemedAppShell />
          </ThemePreferenceProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function ThemedAppShell() {
  const { resolvedTheme } = useThemePreference();
  const theme = resolvedTheme === "dark" ? darkTheme : lightTheme;

  return (
    <PaperProvider theme={theme}>
      <View
        style={[
          styles.mainContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <UpgradeProvider>
          <AuthProvider>
            <AppFrame />
          </AuthProvider>
        </UpgradeProvider>
      </View>
    </PaperProvider>
  );
}

function AppFrame() {
  const { loading, session } = useAuth();
  const theme = useTheme();
  const isAuthFrame = !loading && !session;

  return (
    <View
      style={[
        styles.appWrapper,
        isAuthFrame && styles.authAppWrapper,
        {
          backgroundColor: isAuthFrame
            ? theme.colors.background
            : theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <AppContent />
      <ForceUpdateOverlay />
    </View>
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
    zIndex: 1,
    // Border and shadow only on web for premium desktop experience
    ...(Platform.OS === "web" && {
      borderWidth: 1,
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
  authAppWrapper: {
    ...(Platform.OS === "web" && {
      maxWidth: 480,
      borderWidth: 0,
      shadowOpacity: 0,
      elevation: 0,
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
