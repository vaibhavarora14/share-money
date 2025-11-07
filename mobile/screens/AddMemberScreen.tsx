import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Card,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

interface AddMemberScreenProps {
  groupId: string;
  onAddMember: (email: string) => Promise<void>;
  onCancel: () => void;
}

export const AddMemberScreen: React.FC<AddMemberScreenProps> = ({
  groupId,
  onAddMember,
  onCancel,
}) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const handleAdd = async () => {
    // Validation
    if (!email.trim()) {
      Alert.alert("Error", "Please enter an email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      await onAddMember(email.trim());
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to add member"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.card} mode="elevated" elevation={2}>
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={styles.title}>
                Add Member
              </Text>

              <Text
                variant="bodyMedium"
                style={[
                  styles.subtitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Enter the email address of the user you want to add to this group.
              </Text>

              <TextInput
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                disabled={loading}
                style={styles.input}
                left={<TextInput.Icon icon="email" />}
                placeholder="user@example.com"
              />

              <View style={styles.buttonRow}>
                <Button
                  mode="outlined"
                  onPress={onCancel}
                  disabled={loading}
                  style={[styles.button, styles.cancelButton]}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleAdd}
                  disabled={loading}
                  loading={loading}
                  style={[styles.button, styles.saveButton]}
                >
                  Add Member
                </Button>
              </View>
            </Card.Content>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  card: {
    borderRadius: 16,
  },
  cardContent: {
    paddingVertical: 8,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  button: {
    flex: 1,
    marginHorizontal: 6,
  },
  cancelButton: {},
  saveButton: {},
});
