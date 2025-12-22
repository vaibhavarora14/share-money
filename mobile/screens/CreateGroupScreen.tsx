import React, { useRef, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
} from "react-native";
import { Appbar, Button, TextInput, useTheme } from "react-native-paper";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { showErrorAlert } from "../utils/errorHandling";
import { WEB_MAX_WIDTH } from "../constants/layout";

interface CreateGroupScreenProps {
  visible: boolean;
  onCreateGroup: (groupData: {
    name: string;
    description?: string;
  }) => Promise<void>;
  onDismiss: () => void;
}

export const CreateGroupScreen: React.FC<CreateGroupScreenProps> = ({
  visible,
  onCreateGroup,
  onDismiss,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  const handleDismiss = () => {
    setName("");
    setDescription("");
    onDismiss();
  };

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
      setName("");
      setDescription("");
      onDismiss();
    } catch (error) {
      showErrorAlert(error, signOut, "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleDismiss}
      presentationStyle="fullScreen"
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={["top", "left", "right"]}
      >
        <Appbar.Header
          style={[styles.header, { backgroundColor: theme.colors.surface }]}
          elevated
        >
          <Appbar.BackAction onPress={handleDismiss} />
          <Appbar.Content
            title="Create New Group"
            titleStyle={{ fontWeight: "bold" }}
          />
        </Appbar.Header>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
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

            <Button
              mode="contained"
              onPress={handleCreate}
              disabled={loading}
              loading={loading}
              style={styles.createButton}
            >
              Create
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    maxWidth: WEB_MAX_WIDTH,
    alignSelf: "center",
  },
  header: {
    elevation: 0,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  input: {
    marginBottom: 16,
  },
  createButton: {
    marginTop: 8,
  },
});
