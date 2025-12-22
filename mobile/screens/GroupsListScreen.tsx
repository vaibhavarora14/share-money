import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  FAB,
  IconButton,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { GroupBalanceBadge } from "../components/GroupBalanceBadge";
import { useAuth } from "../contexts/AuthContext";
import { useBalances } from "../hooks/useBalances";
import { useGroups } from "../hooks/useGroups";
import { Group } from "../types";
import { showErrorAlert } from "../utils/errorHandling";
import {
  getUserFriendlyErrorMessage,
  isSessionExpiredError,
} from "../utils/errorMessages";
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
}

export const GroupsListScreen: React.FC<GroupsListScreenProps> = ({
  onGroupPress,
  onCreateGroup,
  onRefetchReady,
  refetchTrigger,
}) => {
  const [showCreateGroup, setShowCreateGroup] = useState<boolean>(false);
  const theme = useTheme();
  const { signOut, user } = useAuth();
  const { data: groups, isLoading: loading, error, refetch } = useGroups();
  const {
    data: balancesData,
    refetch: refetchBalances,
  } = useBalances();

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
            groups.map((group) => (
              <Surface
                key={group.id}
                style={[
                  styles.groupItem,
                  { backgroundColor: theme.colors.surface },
                ]}
                elevation={1}
              >
                <TouchableOpacity
                  style={styles.groupTouchable}
                  onPress={() => onGroupPress(group)}
                  activeOpacity={0.7}
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
            ))
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
    borderRadius: 24,
    width: "100%",
    backgroundColor: "transparent",
  },
  groupItem: {
    marginBottom: 12,
    borderRadius: 16,
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
    borderRadius: 24,
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
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 10,
    borderRadius: 16,
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
});
