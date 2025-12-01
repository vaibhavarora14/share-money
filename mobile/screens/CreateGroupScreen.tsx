import React, { useEffect, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Appbar,
  Button,
  TextInput,
  useTheme,
} from "react-native-paper";
import { showErrorAlert } from "../utils/errorHandling";
import { useAuth } from "../contexts/AuthContext";

interface CreateGroupScreenProps {
  visible: boolean;
  onCreateGroup: (groupData: { name: string; description?: string }) => Promise<void>;
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
  const [slideAnim] = useState(new Animated.Value(0));
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get("window").height;
  const { signOut } = useAuth();

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

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

  const bottomSheetHeight = screenHeight * 0.7;
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [bottomSheetHeight, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              height: bottomSheetHeight,
              transform: [{ translateY }],
              paddingBottom: insets.bottom,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <View style={styles.handleContainer}>
            <View
              style={[
                styles.handle,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
          </View>
          <Appbar.Header style={styles.header}>
            <Appbar.Content title="Create New Group" />
            <Appbar.Action icon="close" onPress={handleDismiss} />
          </Appbar.Header>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardView}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
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
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    elevation: 0,
    backgroundColor: "transparent",
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
