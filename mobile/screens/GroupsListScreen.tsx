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
import { Group } from "../types";

// API URL - must be set via EXPO_PUBLIC_API_URL environment variable
const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface GroupsListScreenProps {
  onGroupPress: (group: Group) => void;
  onCreateGroup: () => void;
  onNavigateToTransactions?: () => void;
}

export const GroupsListScreen: React.FC<GroupsListScreenProps> = ({
  onGroupPress,
  onCreateGroup,
  onNavigateToTransactions,
}) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { session, signOut } = useAuth();
  const fetchingRef = React.useRef<boolean>(false);
  const theme = useTheme();

  const fetchGroups = useCallback(async (): Promise<void> => {
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

    if (fetchingRef.current) {
      return;
    }

    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      // Get the latest session from Supabase
      let {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        setLoading(false);
        return;
      }

      const token = currentSession.access_token;

      const response = await fetch(`${API_URL}/groups`, {
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

      const data: Group[] = await response.json();
      setGroups(data);
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
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [session, signOut]);

  useEffect(() => {
    if (session) {
      fetchGroups();
    } else {
      setGroups([]);
      setLoading(false);
      setError(null);
    }
  }, [session, fetchGroups]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={{ marginTop: 16 }}>
          Loading groups...
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
        <Button mode="contained" onPress={fetchGroups}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Appbar.Header>
        <Appbar.Content title="Groups" subtitle={`${groups.length} total`} />
        <Appbar.Action 
          icon="wallet" 
          onPress={onNavigateToTransactions || (() => {})}
        />
        <Appbar.Action icon="logout" onPress={signOut} />
      </Appbar.Header>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant="headlineSmall" style={{ marginBottom: 8 }}>
              No groups
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Create a group to get started
            </Text>
          </View>
        ) : (
          groups.map((group, index) => (
            <React.Fragment key={group.id}>
              <Card
                style={styles.groupCard}
                mode="outlined"
                onPress={() => onGroupPress(group)}
              >
                <Card.Content style={styles.cardContent}>
                  <View style={styles.groupLeft}>
                    <Text variant="titleMedium" style={styles.groupName}>
                      {group.name}
                    </Text>
                    {group.description && (
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                        numberOfLines={2}
                      >
                        {group.description}
                      </Text>
                    )}
                    <Text
                      variant="bodySmall"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        marginTop: 4,
                      }}
                    >
                      Created {formatDate(group.created_at)}
                    </Text>
                  </View>
                  <IconButton
                    icon="chevron-right"
                    size={24}
                    onPress={() => onGroupPress(group)}
                  />
                </Card.Content>
              </Card>
              {index < groups.length - 1 && <View style={{ height: 8 }} />}
            </React.Fragment>
          ))
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={onCreateGroup}
        label="Create Group"
      />
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  groupCard: {
    marginBottom: 0,
  },
  cardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  groupLeft: {
    flex: 1,
    marginRight: 8,
  },
  groupName: {
    fontWeight: "600",
    marginBottom: 4,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
