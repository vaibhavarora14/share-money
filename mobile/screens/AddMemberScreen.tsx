import React, { useEffect, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Appbar,
  Button,
  Divider,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_MAX_WIDTH } from "../constants/layout";
import { useAuth } from "../contexts/AuthContext";
import { useCreateGroupShareLink } from "../hooks/useGroupInvitations"; // New hook
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
  const createShareLink = useCreateGroupShareLink(); // Use hook

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
      if (
        result &&
        typeof result === "object" &&
        "invitation" in result &&
        result.invitation
      ) {
        Alert.alert(
          "Invitation Sent",
          result.message ||
            "Invitation sent successfully! The user will be added to the group when they sign up.",
          [{ text: "OK", onPress: handleDismiss }]
        );
      } else {
        Alert.alert("Success", "Member added successfully!", [
          { text: "OK", onPress: handleDismiss },
        ]);
      }
    } catch (error) {
      showErrorAlert(error, signOut, "Error");
    } finally {
      setLoading(false);
    }
  };

  const getShareUrl = async (): Promise<string> => {
    const token = await createShareLink.mutateAsync(groupId);

    // Always use HTTP/HTTPS URL for Universal Links (iOS) and App Links (Android)
    // These URLs will open the app if installed, or fallback to web
    if (!process.env.EXPO_PUBLIC_APP_URL) {
      throw new Error(
        "Unable to generate invite link due to a configuration issue. Please contact support and let them know you're unable to create share links."
      );
    }

    const baseUrl = process.env.EXPO_PUBLIC_APP_URL;
    return `${baseUrl}/join/${token}`;
  };

  const handleCopyLink = async () => {
    setLoading(true);
    try {
      const url = await getShareUrl();

      // Copy to clipboard - cross-platform
      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          Alert.alert("Copied!", "Invite link copied to clipboard");
        } else {
          // Clipboard API not available - fallback to showing URL
          Alert.alert("Invite Link", `Copy this link:\n\n${url}`, [
            { text: "OK" },
          ]);
        }
      } else {
        // For React Native mobile, use Share API with the URL
        // This allows users to copy from the share sheet on most platforms
        try {
          await Share.share({
            message: url, // Just the URL, so it's easy to copy
            url: url,
          });
        } catch (shareErr: any) {
          // If user cancels share, that's fine - don't show error
          if (shareErr?.message !== "User cancelled") {
            // If share fails, show URL in alert as fallback
            Alert.alert("Invite Link", `Copy this link:\n\n${url}`, [
              { text: "OK" },
            ]);
          }
        }
      }
    } catch (err) {
      showErrorAlert(err, signOut, "Error copying link");
    } finally {
      setLoading(false);
    }
  };

  const handleShareLink = async () => {
    setLoading(true);
    try {
      const url = await getShareUrl();

      await Share.share({
        message: `Join my group on ShareMoney! ${url}`,
        url: url, // iOS only
      });
      // Optionally dismiss? No, let them share again or close manually.
    } catch (err) {
      showErrorAlert(err, signOut, "Error creating link");
    } finally {
      setLoading(false);
    }
  };

  const bottomSheetHeight = screenHeight; // Full height
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
              paddingTop: insets.top,
              backgroundColor: theme.colors.background,
            },
          ]}
        >
          {/* Handle removed for full screen, or keep as visual indicator if desired, but typically removed. */}
          {/* <View style={styles.handleContainer}> ... </View> */}
          <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
            <Appbar.BackAction onPress={handleDismiss} />
            <Appbar.Content
              title="Add Member"
              titleStyle={{ fontWeight: "bold" }}
            />
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
                Enter the email address of the user you want to add to this
                group. If the user doesn't have an account yet, an invitation
                will be sent and they'll be added automatically when they sign
                up.
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

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginVertical: 24,
                }}
              >
                <Divider style={{ flex: 1 }} />
                <Text
                  style={{ marginHorizontal: 16, color: theme.colors.outline }}
                >
                  OR
                </Text>
                <Divider style={{ flex: 1 }} />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <Button
                  mode="outlined"
                  onPress={handleCopyLink}
                  disabled={loading}
                  loading={createShareLink.isPending && !loading}
                  icon="content-copy"
                  style={[styles.addButton, { flex: 1 }]}
                >
                  Copy Link
                </Button>
                <Button
                  mode="outlined"
                  onPress={handleShareLink}
                  disabled={loading}
                  loading={createShareLink.isPending && !loading}
                  icon="share-variant"
                  style={[styles.addButton, { flex: 1 }]}
                >
                  Share
                </Button>
              </View>
              <Text
                variant="bodySmall"
                style={{
                  textAlign: "center",
                  marginTop: 8,
                  color: theme.colors.outline,
                }}
              >
                Anyone with this link can join instantly
              </Text>
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
    width: "100%",
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheet: {
    width: "100%",
    maxWidth: WEB_MAX_WIDTH,
    alignSelf: "center",
    // borderTopLeftRadius: 20, // Removed for full screen
    // borderTopRightRadius: 20, // Removed for full screen
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
