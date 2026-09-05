import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  FAB,
  IconButton,
  List,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { GroupBalanceBadge } from "../components/GroupBalanceBadge";
import { NotificationBell } from "../components/NotificationBell";
import { useAuth } from "../contexts/AuthContext";
import { useBalances } from "../hooks/useBalances";
import { useGroups } from "../hooks/useGroups";
import {
  setCachedNotificationPreference,
  useNotifications,
  useUpdateNotificationPreference,
} from "../hooks/useNotifications";
import { enablePushNotifications } from "../services/pushNotifications";
import { Group } from "../types";
import { showErrorAlert } from "../utils/errorHandling";
import {
  getUserFriendlyErrorMessage,
  isSessionExpiredError,
} from "../utils/errorMessages";
import { isTransactionNotificationsEnabled } from "../utils/featureFlags";
import { shouldShowNotificationPrimer } from "../utils/notificationPermission";
import { logError } from "../utils/logger";
import { getSeenGroupIds, markGroupSeen } from "../utils/seenGroups";
import { CreateGroupScreen } from "./CreateGroupScreen";

interface GroupsListScreenProps {
  onGroupPress: (group: Group) => void;
  onCreateGroup: (groupData: {
    name: string;
    description?: string;
  }) => Promise<void>;
  onLogout?: () => void;
  onRefetchReady?: (refetch: () => Promise<any>) => void;
  refetchTrigger?: number; // Added to trigger refetch from parent
  onNotificationsPress: () => void;
}

export const GroupsListScreen: React.FC<GroupsListScreenProps> = ({
  onGroupPress,
  onCreateGroup,
  onRefetchReady,
  refetchTrigger,
  onNotificationsPress,
}) => {
  const [showCreateGroup, setShowCreateGroup] = useState<boolean>(false);
  const [formerGroupsExpanded, setFormerGroupsExpanded] = useState<boolean>(false);
  const [seenGroupIds, setSeenGroupIds] = useState<Set<string> | null>(null);
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { signOut, user } = useAuth();
  const notifications = useNotifications();
  const notificationsEnabled =
    isTransactionNotificationsEnabled(notifications.data);
  const preferenceMutation = useUpdateNotificationPreference();
  const [pushError, setPushError] = useState<string | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);
  const { data: groups, isLoading: loading, error, refetch } = useGroups();
  const {
    data: balancesData,
    refetch: refetchBalances,
  } = useBalances();
  // Load which groups the user has already opened (for the NEW badge).
  // First run baselines all current groups so existing members see no badges
  // (an empty list stores an empty baseline, so a user's first joined group
  // still gets the badge).
  useEffect(() => {
    if (!user?.id || loading) return;
    let mounted = true;
    getSeenGroupIds(
      user.id,
      groups.map((g) => g.id)
    ).then((ids) => {
      if (mounted) setSeenGroupIds(ids);
    });
    return () => {
      mounted = false;
    };
  }, [user?.id, loading, groups]);

  const handleGroupPress = (group: Group) => {
    if (user?.id) {
      // Clear the NEW badge as soon as the group is opened.
      setSeenGroupIds((prev) => {
        if (!prev || prev.has(group.id)) return prev;
        const next = new Set(prev);
        next.add(group.id);
        return next;
      });
      markGroupSeen(user.id, group.id);
    }
    onGroupPress(group);
  };

  // Expose refetch functions to parent component
  React.useEffect(() => {
    if (onRefetchReady) {
      onRefetchReady(async () => {
        await Promise.all([refetch(), refetchBalances()]);
      });
    }
  }, [onRefetchReady, refetch, refetchBalances]);

  // Handle manual trigger from parent
  React.useEffect(() => {
    if (refetchTrigger) {
      refetch();
      refetchBalances();
    }
  }, [refetchTrigger, refetch, refetchBalances]);

  // Auto sign-out on session expiration with alert
  useEffect(() => {
    if (error && isSessionExpiredError(error)) {
      showErrorAlert(error, signOut, "Session Expired");
    }
  }, [error, signOut]);

  const isInitialLoading = loading && groups.length === 0;

  // Separate groups into active and former
  const activeGroups = groups.filter(
    (group) => group.user_status !== "left"
  );
  const formerGroups = groups.filter(
    (group) => group.user_status === "left"
  );

  // Helper function to render a group item
  const renderGroupItem = (group: Group) => {
    const isNew =
      seenGroupIds !== null &&
      !seenGroupIds.has(group.id) &&
      group.user_status !== "left";
    const unreadActivityCount = notificationsEnabled
      ? notifications.data?.unread_by_group[group.id] ?? 0
      : 0;
    const hasUnreadActivity = unreadActivityCount > 0;

    return (
    <Surface
      key={group.id}
      style={[
        styles.groupItem,
        { backgroundColor: theme.colors.surface },
      ]}
      elevation={1}
    >
      <TouchableOpacity
        testID={`group-card-${group.id}`}
        style={styles.groupTouchable}
        onPress={() => handleGroupPress(group)}
        activeOpacity={0.7}
        accessibilityLabel={`${group.name}${isNew ? ", new group" : ""}${hasUnreadActivity ? `, ${unreadActivityCount} unread ${unreadActivityCount === 1 ? "notification" : "notifications"}` : ""}`}
      >
        <View style={styles.groupMainContent}>
          <View style={styles.groupIconContainer}>
            <Surface
              style={[
                styles.groupIcon,
                { backgroundColor: theme.colors.primaryContainer },
              ]}
              elevation={0}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "bold",
                  color: theme.colors.onPrimaryContainer,
                }}
              >
                {group.name.charAt(0).toUpperCase()}
              </Text>
            </Surface>
          </View>

          <View style={styles.groupInfo}>
            <View style={styles.groupNameRow}>
              <Text
                variant="titleMedium"
                style={[
                  styles.groupName,
                  group.user_status === 'left' && { color: theme.colors.onSurfaceVariant }
                ]}
                numberOfLines={1}
              >
                {group.name}
              </Text>
              {isNew && (
                <View
                  style={[
                    styles.newBadge,
                    { backgroundColor: theme.colors.primary },
                  ]}
                  testID={`new-badge-${group.id}`}
                >
                  <Text
                    variant="labelSmall"
                    style={[styles.newBadgeText, { color: theme.colors.onPrimary }]}
                  >
                    NEW
                  </Text>
                </View>
              )}
              {hasUnreadActivity ? (
                <View
                  style={[styles.activityDot, { backgroundColor: theme.colors.primary }]}
                  testID={`notification-dot-${group.id}`}
                  accessibilityElementsHidden
                />
              ) : null}
            </View>
            <View style={styles.groupMetadata}>
              {group.user_status === 'left' && (
                <Text 
                  variant="bodySmall"
                  style={[styles.formerStatusText, { color: theme.colors.error }]}
                >
                  Former Member
                </Text>
              )}
              {group.user_status === 'left' && (
                <Text
                  variant="bodySmall"
                  style={[styles.metadataSeparator, { color: theme.colors.onSurfaceVariant }]}
                >
                  •
                </Text>
              )}
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}
                numberOfLines={1}
              >
                {group.description || "No description"}
              </Text>
            </View>
          </View>
        </View>

        {/* Balance Badge */}
        <GroupBalanceBadge 
          balanceData={balancesData?.group_balances?.find(gb => gb.group_id === group.id)} 
          currentUserId={user?.id}
        />
      </TouchableOpacity>
    </Surface>
    );
  };

  if (error) {
    // Don't show Retry button for session expiration - user will be signed out automatically
    if (isSessionExpiredError(error)) {
      return (
        <View
          style={[
            styles.centerContainer,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <Text
            variant="headlineSmall"
            style={{ color: theme.colors.error, marginBottom: 16 }}
          >
            Session Expired
          </Text>
          <Text
            variant="bodyMedium"
            style={{ marginBottom: 24, textAlign: "center" }}
          >
            {getUserFriendlyErrorMessage(error)}
          </Text>
          <ActivityIndicator size="small" />
        </View>
      );
    }

    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Text
          variant="headlineSmall"
          style={{ color: theme.colors.error, marginBottom: 16 }}
        >
          Error
        </Text>
        <Text
          variant="bodyMedium"
          style={{ marginBottom: 24, textAlign: "center" }}
        >
          {getUserFriendlyErrorMessage(error)}
        </Text>
        <Button mode="contained" onPress={() => refetch()}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
        <Appbar.Content
          title="Your Groups"
          titleStyle={{ fontWeight: "bold" }}
        />
        {notificationsEnabled ? (
          <NotificationBell
            unreadCount={notifications.data?.unread_count ?? 0}
            onPress={onNotificationsPress}
          />
        ) : null}
      </Appbar.Header>

      {isInitialLoading && (
        <View
          style={[
            styles.centerContainer,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <ActivityIndicator size="large" />
          <Text variant="bodyLarge" style={{ marginTop: 16 }}>
            Loading groups...
          </Text>
        </View>
      )}

      {!isInitialLoading && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {notificationsEnabled && shouldShowNotificationPrimer({
            platform: Platform.OS,
            activeGroupCount: activeGroups.length,
            preference: notifications.data?.preference,
          }) ? (
            <Surface style={[styles.permissionCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
              <Text variant="titleMedium" style={styles.permissionTitle}>Know when an expense affects you</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Get a notification when someone adds, changes, or removes an expense involving you.
              </Text>
              {pushError ? <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>{pushError}</Text> : null}
              <View style={styles.permissionActions}>
                <Button
                  mode="contained"
                  loading={enablingPush}
                  disabled={enablingPush}
                  onPress={async () => {
                    setEnablingPush(true);
                    setPushError(null);
                    try {
                      const preference = await enablePushNotifications();
                      if (user?.id) {
                        setCachedNotificationPreference(queryClient, user.id, preference);
                      }
                    } catch (error) {
                      logError(error, {
                        context: "enable push notifications",
                        platform: Platform.OS,
                        surface: "groups primer",
                      });
                      setPushError("We couldn’t turn on notifications. You can try again in Profile.");
                    } finally {
                      setEnablingPush(false);
                    }
                  }}
                >
                  Turn on notifications
                </Button>
                <Button
                  mode="text"
                  onPress={() => preferenceMutation.mutate({ action: "dismiss_nudge" })}
                >
                  Not now
                </Button>
              </View>
            </Surface>
          ) : null}
          {groups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Surface style={styles.emptySurface} elevation={0}>
                <IconButton
                  icon="account-group-outline"
                  size={48}
                  iconColor={theme.colors.primary}
                />
                <Text
                  variant="titleLarge"
                  style={{ marginBottom: 8, fontWeight: "bold" }}
                >
                  No groups yet
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    textAlign: "center",
                    marginBottom: 24,
                  }}
                >
                  Create a group to start sharing expenses with friends and
                  family.
                </Text>
                <Button
                  mode="contained"
                  onPress={() => setShowCreateGroup(true)}
                >
                  Create your first group
                </Button>
              </Surface>
            </View>
          ) : (
            <>
              {/* Active Groups */}
              {activeGroups.map((group) => renderGroupItem(group))}

              {/* Former Groups in Accordion */}
              {formerGroups.length > 0 && (
                <List.Accordion
                  title={`Former Groups (${formerGroups.length})`}
                  titleStyle={styles.accordionTitle}
                  style={[
                    styles.accordion,
                    { backgroundColor: theme.colors.surface },
                  ]}
                  left={(props) => (
                    <List.Icon {...props} icon="history" />
                  )}
                  expanded={formerGroupsExpanded}
                  onPress={() => setFormerGroupsExpanded(!formerGroupsExpanded)}
                >
                  <View style={styles.accordionContent}>
                    {formerGroups.map((group) => renderGroupItem(group))}
                  </View>
                </List.Accordion>
              )}
            </>
          )}

          {/* Bottom padding for FAB */}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primaryContainer }]}
        color={theme.colors.onPrimaryContainer}
        onPress={() => setShowCreateGroup(true)}
        label="New Group"
      />

      <CreateGroupScreen
        visible={showCreateGroup}
        onCreateGroup={async (groupData) => {
          await onCreateGroup(groupData);
          setShowCreateGroup(false);
        }}
        onDismiss={() => setShowCreateGroup(false)}
      />
    </View>
  );
};

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
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptySurface: {
    padding: 32,
    alignItems: "center",
    borderRadius: 8,
    width: "100%",
    backgroundColor: "transparent",
  },
  groupItem: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  groupTouchable: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  groupIconContainer: {
    marginRight: 16,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  groupContent: {
    flex: 1,
    justifyContent: "center",
  },
  groupNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  groupName: {
    fontWeight: "bold",
    flexShrink: 1,
  },
  newBadge: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  newBadgeText: {
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 3,
  },
  permissionCard: {
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
  },
  permissionTitle: {
    fontWeight: "700",
    marginBottom: 6,
  },
  permissionActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 10,
    borderRadius: 8,
  },
  // New Styles
  groupMetadata: {
    flexDirection: "row",
    alignItems: "center",
  },
  formerStatusText: {
    fontWeight: "bold",
  },
  metadataSeparator: {
    marginHorizontal: 4,
  },
  groupMainContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  groupInfo: {
    flex: 1,
    paddingRight: 8,
  },
  accordion: {
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  accordionTitle: {
    fontWeight: "600",
  },
  accordionContent: {
    paddingHorizontal: 0,
  },
});
