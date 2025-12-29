import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { getGroupInfoFromTokenRPC } from "../hooks/useGroupInvitations";
import { logError } from "../utils/logger";

interface JoinGroupPreviewProps {
  token: string;
  onLogin: () => void;
  onCancel: () => void;
}

export const JoinGroupPreview: React.FC<JoinGroupPreviewProps> = ({
  token,
  onLogin,
  onCancel,
}) => {
  const [groupInfo, setGroupInfo] = useState<{
    group_name: string;
    member_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const info = await getGroupInfoFromTokenRPC(token);
        if (
          info &&
          info.is_valid &&
          info.group_name &&
          info.member_count !== null
        ) {
          setGroupInfo({
            group_name: info.group_name,
            member_count: info.member_count,
          });
        } else {
          setError("This invite link is invalid or has expired.");
        }
      } catch (err) {
        logError(err, "Failed to load group information from token");
        setError(
          "Failed to load group information. Please check your connection and try again."
        );
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, [token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Surface style={styles.card} elevation={1}>
          <Avatar.Icon
            icon="alert-circle"
            size={64}
            style={{ backgroundColor: theme.colors.errorContainer }}
            color={theme.colors.error}
          />
          <Text variant="headlineSmall" style={styles.title}>
            Link Error
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {error}
          </Text>
          <Button mode="contained" onPress={onCancel} style={styles.button}>
            Go Back
          </Button>
        </Surface>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Surface style={styles.card} elevation={2}>
          <Avatar.Text
            label={groupInfo?.group_name.substring(0, 2).toUpperCase() || "??"}
            size={80}
            style={[
              styles.avatar,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
            color={theme.colors.onPrimaryContainer}
          />
          <Text variant="headlineMedium" style={styles.title}>
            Join Group
          </Text>
          <Text variant="titleLarge" style={styles.groupName}>
            {groupInfo?.group_name}
          </Text>
          <Text variant="bodyLarge" style={styles.memberCount}>
            {groupInfo?.member_count}{" "}
            {groupInfo?.member_count === 1 ? "member" : "members"}
          </Text>

          <View style={styles.infoBox}>
            <Text variant="bodyMedium" style={styles.infoText}>
              You've been invited to join this group. You'll be able to track
              shared expenses and settle balances.
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={onLogin}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Sign In to Join
          </Button>

          <Button mode="text" onPress={onCancel} style={styles.cancelButton}>
            Not now
          </Button>
        </Surface>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    padding: 32,
    borderRadius: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 450,
    alignSelf: "center",
  },
  avatar: {
    marginBottom: 20,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  groupName: {
    marginBottom: 4,
    textAlign: "center",
  },
  memberCount: {
    opacity: 0.7,
    marginBottom: 24,
  },
  infoBox: {
    backgroundColor: "rgba(0,0,0,0.03)",
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
    width: "100%",
  },
  infoText: {
    textAlign: "center",
    opacity: 0.8,
  },
  button: {
    width: "100%",
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  cancelButton: {
    marginTop: 12,
  },
});
