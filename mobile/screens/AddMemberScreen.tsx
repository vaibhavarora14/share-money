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
import { useCreateGroupShareLink } from "../hooks/useGroupInvitations";
import { getInviteLinkBaseUrl } from "../utils/inviteLinks";
import { showErrorAlert } from "../utils/errorHandling";

interface AddMemberScreenProps {
  visible: boolean;
  groupId: string;
  onAddMember: (email: string) => Promise<any>;
  onDismiss: () => void;
}

// Fixed link settings for UI-created links; the RPC stays configurable
// server-side, the sheet just doesn't expose the knobs.
const LINK_MAX_USES = 10;
const LINK_VALID_DAYS = 30;

export const AddMemberScreen: React.FC<AddMemberScreenProps> = ({
  visible,
  groupId,
  onAddMember,
  onDismiss,
}) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [slideAnim] = useState(new Animated.Value(0));
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get("window").height;
  const { signOut } = useAuth();
  const createShareLink = useCreateGroupShareLink();

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
    setInviteLink(null);
    setLinkCopied(false);
    onDismiss();
  };

  const generateInviteLink = async (): Promise<string> => {
    // Reuse the link generated in this session so repeated Copy/Share taps
    // don't mint a new invitation each time.
    if (inviteLink) return inviteLink;
    const token = await createShareLink.mutateAsync({
      groupId,
      maxUses: LINK_MAX_USES,
      validDays: LINK_VALID_DAYS,
    });
    const url = `${getInviteLinkBaseUrl()}/join/${token}`;
    setInviteLink(url);
    return url;
  };

  const handleCopyLink = async () => {
    setLoading(true);
    try {
      const url = await generateInviteLink();

      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          setLinkCopied(true);
        }
        // Link is also shown inline below the buttons as a fallback.
      } else {
        // Native: the share sheet allows copying on both platforms.
        await Share.share({ message: url, url });
      }
    } catch (err) {
      showErrorAlert(err, signOut, "Error creating invite link");
    } finally {
      setLoading(false);
    }
  };

  const handleShareLink = async () => {
    setLoading(true);
    try {
      const url = await generateInviteLink();

      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({
            title: "Join my group on ShareMoney!",
            text: `Join my group on ShareMoney! ${url}`,
            url,
          });
        } else if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          setLinkCopied(true);
        }
      } else {
        await Share.share({
          message: `Join my group on ShareMoney! ${url}`,
          url, // iOS only
        });
      }
    } catch (err) {
      // Ignore user-cancelled shares
      const message = err instanceof Error ? err.message : "";
      if (!/abort|cancel/i.test(message)) {
        showErrorAlert(err, signOut, "Error sharing invite link");
      }
    } finally {
      setLoading(false);
    }
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

  const bottomSheetHeight = Math.min(screenHeight * 0.58, 520);
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

              <View style={styles.dividerRow}>
                <Divider style={styles.dividerLine} />
                <Text style={{ marginHorizontal: 16, color: theme.colors.outline }}>
                  OR
                </Text>
                <Divider style={styles.dividerLine} />
              </View>

              <View style={styles.linkButtonsRow}>
                <Button
                  mode="outlined"
                  onPress={handleCopyLink}
                  disabled={loading}
                  loading={createShareLink.isPending}
                  icon="content-copy"
                  style={styles.linkButton}
                  testID="copy-invite-link-button"
                >
                  {Platform.OS === "web" && linkCopied ? "Copied!" : "Copy Link"}
                </Button>
                <Button
                  mode="outlined"
                  onPress={handleShareLink}
                  disabled={loading}
                  loading={createShareLink.isPending}
                  icon="share-variant"
                  style={styles.linkButton}
                  testID="share-invite-link-button"
                >
                  Share
                </Button>
              </View>

              {inviteLink && (
                <Text
                  variant="bodySmall"
                  selectable
                  style={[styles.linkPreview, { color: theme.colors.primary }]}
                >
                  {inviteLink}
                </Text>
              )}

              <Text
                variant="bodySmall"
                style={[styles.linkHint, { color: theme.colors.onSurfaceVariant }]}
              >
                {`Link lets up to ${LINK_MAX_USES} people join · valid ${LINK_VALID_DAYS} days`}
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
  },
  linkButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  linkButton: {
    flex: 1,
  },
  linkPreview: {
    textAlign: "center",
    marginTop: 12,
  },
  linkHint: {
    textAlign: "center",
    marginTop: 12,
  },
});
