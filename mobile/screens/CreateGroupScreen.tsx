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
import { Group } from "../types";

interface CreateGroupScreenProps {
  onCreateGroup: (groupData: { name: string; description?: string }) => Promise<void>;
  onCancel: () => void;
}

export const CreateGroupScreen: React.FC<CreateGroupScreenProps> = ({
  onCreateGroup,
  onCancel,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const handleCreate = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a group name");
      return;
    }

    setLoading(true);
    try {
      await onCreateGroup({
        name: name.trim(),
        description: description.trim() || undefined,
      });
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to create group"
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
                Create New Group
              </Text>

              <TextInput
                label="Group Name"
                value={name}
                onChangeText={setName}
                mode="outlined"
                disabled={loading}
                style={styles.input}
                left={<TextInput.Icon icon="account-group" />}
                placeholder="e.g., Weekend Trip, Roommates"
              />

              <TextInput
                label="Description (Optional)"
                value={description}
                onChangeText={setDescription}
                mode="outlined"
                disabled={loading}
                style={styles.input}
                multiline
                numberOfLines={3}
                left={<TextInput.Icon icon="text" />}
                placeholder="Add a description for this group"
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
                  onPress={handleCreate}
                  disabled={loading}
                  loading={loading}
                  style={[styles.button, styles.saveButton]}
                >
                  Create
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
    marginBottom: 24,
    textAlign: "center",
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
