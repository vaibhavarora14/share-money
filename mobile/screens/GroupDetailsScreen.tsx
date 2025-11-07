import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  FAB,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabase";
import { GroupWithMembers } from "../types";

// API URL - must be set via EXPO_PUBLIC_API_URL environment variable
const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface GroupDetailsScreenProps {
  group: GroupWithMembers;
  onBack: () => void;
  onAddMember: () => void;
  onLeaveGroup?: () => void;
}

export const GroupDetailsScreen: React.FC<GroupDetailsScreenProps> = ({
  group: initialGroup,
  onBack,
  onAddMember,
  onLeaveGroup,
}) => {
  const [group, setGroup] = useState<GroupWithMembers>(initialGroup);
  const [loading, setLoading] = useState<boolean>(false);
  const [leaving, setLeaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { session, signOut } = useAuth();
  const theme = useTheme();

  const fetchGroupDetails = useCallback(async (): Promise<void> => {
    if (!API_URL) {
      setError(
        "Unable to connect to the server. Please check your app configuration and try again."
      );
      setLoading(false);
      return;
    }

    if (!session) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        setLoading(false);
        return;
      }

      const token = currentSession.access_token;

      const response = await fetch(`${API_URL}/groups/${group.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          await signOut();
          return;
        }

        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data: GroupWithMembers = await response.json();
      setGroup(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      if (
        !errorMessage.includes("401") &&
        !errorMessage.includes("Unauthorized")
      ) {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [group.id, session, signOut]);

  useEffect(() => {
    fetchGroupDetails();
  }, [fetchGroupDetails]);

  const handleLeaveGroup = async () => {
    Alert.alert(
      "Leave Group",
      `Are you sure you want to leave "${group.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            if (!API_URL) {
              Alert.alert("Error", "Unable to connect to the server");
              return;
            }

            try {
              setLeaving(true);

              let {
                data: { session: currentSession },
              } = await supabase.auth.getSession();

              if (!currentSession) {
                Alert.alert("Error", "Not authenticated");
                return;
              }

              const token = currentSession.access_token;
              const currentUserId = session?.user?.id;

              if (!currentUserId) {
                Alert.alert("Error", "Unable to identify user");
                return;
              }

              const response = await fetch(
                `${API_URL}/group-members?group_id=${group.id}&user_id=${currentUserId}`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                }
              );

              if (!response.ok) {
                if (response.status === 401) {
                  await signOut();
                  return;
                }

                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
              }

              // Call the onLeaveGroup callback if provided, otherwise just go back
              if (onLeaveGroup) {
                onLeaveGroup();
              } else {
                onBack();
              }
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Failed to leave group"
              );
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const currentUserId = session?.user?.id;
  const isOwner = group.created_by === currentUserId || 
    group.members?.some(m => m.user_id === currentUserId && m.role === 'owner');
  const isMember = group.members?.some(m => m.user_id === currentUserId);

  if (loading && !group.members) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={{ marginTop: 16 }}>
          Loading group details...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
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
          {error}
        </Text>
        <Button mode="contained" onPress={fetchGroupDetails}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={onBack} />
        <Appbar.Content title={group.name} />
      </Appbar.Header>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {group.description && (
          <Card style={styles.descriptionCard} mode="outlined">
            <Card.Content>
              <Text variant="bodyMedium">{group.description}</Text>
            </Card.Content>
          </Card>
        )}

        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Members ({group.members?.length || 0})
          </Text>

          {group.members && group.members.length > 0 ? (
            group.members.map((member, index) => (
              <React.Fragment key={member.id}>
                <Card style={styles.memberCard} mode="outlined">
                  <Card.Content style={styles.memberContent}>
                    <View style={styles.memberLeft}>
                      <Text variant="titleSmall" style={styles.memberName}>
                        {member.email || "Unknown User"}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        Joined {formatDate(member.joined_at)}
                      </Text>
                    </View>
                    <Chip
                      style={[
                        styles.roleChip,
                        {
                          backgroundColor:
                            member.role === "owner"
                              ? theme.colors.primaryContainer
                              : theme.colors.surfaceVariant,
                        },
                      ]}
                      textStyle={{
                        color:
                          member.role === "owner"
                            ? theme.colors.onPrimaryContainer
                            : theme.colors.onSurfaceVariant,
                      }}
                    >
                      {member.role}
                    </Chip>
                  </Card.Content>
                </Card>
                {index < group.members!.length - 1 && (
                  <View style={{ height: 8 }} />
                )}
              </React.Fragment>
            ))
          ) : (
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}
            >
              No members yet
            </Text>
          )}
        </View>
      </ScrollView>

      {isOwner && (
        <FAB
          icon="account-plus"
          style={styles.fab}
          onPress={onAddMember}
          label="Add Member"
        />
      )}

      {isMember && (
        <Button
          mode="outlined"
          onPress={handleLeaveGroup}
          disabled={leaving}
          loading={leaving}
          style={[styles.leaveButton, { borderColor: theme.colors.error }]}
          textColor={theme.colors.error}
        >
          Leave Group
        </Button>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
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
  descriptionCard: {
    marginBottom: 16,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: 12,
  },
  memberCard: {
    marginBottom: 0,
  },
  memberContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  memberLeft: {
    flex: 1,
    marginRight: 8,
  },
  memberName: {
    fontWeight: "600",
    marginBottom: 4,
  },
  roleChip: {
    height: 28,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
  leaveButton: {
    margin: 16,
    marginTop: 8,
  },
});
