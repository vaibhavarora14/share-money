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
import {
    Appbar,
    Button,
    Text,
    TextInput,
    useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { showErrorAlert } from "../utils/errorHandling";

interface AddMemberScreenProps {
  visible: boolean;
  groupId: string;
  onAddMember: (email: string) => Promise<any>;
  onDismiss: () => void;
}

export const AddMemberScreen: React.FC<AddMemberScreenProps> = ({
  visible,
  groupId,
  onAddMember,
  onDismiss,
}) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [slideAnim] = useState(new Animated.Value(0));
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get("window").height;
  const { signOut } = useAuth();

  // Animation effect
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
    setEmail("");
    onDismiss();
  };

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
      const result = await onAddMember(email.trim());
      // Check if result indicates an invitation was created
      if (result && typeof result === 'object' && 'invitation' in result && result.invitation) {
        Alert.alert(
          "Invitation Sent",
          result.message || "Invitation sent successfully! The user will be added to the group when they sign up.",
          [{ text: "OK", onPress: handleDismiss }]
        );
      } else {
        Alert.alert(
          "Success",
          "Member added successfully!",
          [{ text: "OK", onPress: handleDismiss }]
        );
      }
    } catch (error) {
      showErrorAlert(error, signOut, "Error");
    } finally {
      setLoading(false);
    }
  };

  const bottomSheetHeight = screenHeight * 0.5;
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
            <Appbar.Content title="Add Member" titleStyle={{ fontWeight: 'bold' }} />
            <Appbar.Action icon="close" onPress={handleDismiss} />
          </Appbar.Header>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.keyboardView}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text
                variant="bodyMedium"
                style={[
                  styles.subtitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Enter the email address of the user you want to add to this group. If the user doesn't have an account yet, an invitation will be sent and they'll be added automatically when they sign up.
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

              <Button
                mode="contained"
                onPress={handleAdd}
                disabled={loading}
                loading={loading}
                style={styles.addButton}
                testID="add-member-submit-button"
              >
                Add Member
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
  subtitle: {
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    marginBottom: 16,
  },
  addButton: {
    marginTop: 8,
  },
});
