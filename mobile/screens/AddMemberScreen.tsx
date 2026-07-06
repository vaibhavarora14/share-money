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
    SegmentedButtons,
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
  const [linkMaxUses, setLinkMaxUses] = useState<string>("1");
  const [linkValidDays, setLinkValidDays] = useState<string>("7");
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
    // don't mint a new invitation each time (options changes reset it).
    if (inviteLink) return inviteLink;
    const token = await createShareLink.mutateAsync({
      groupId,
      maxUses: parseInt(linkMaxUses, 10),
      validDays: parseInt(linkValidDays, 10),
    });
    const url = `${getInviteLinkBaseUrl()}/join/${token}`;
    setInviteLink(url);
    return url;
  };

  const handleLinkOptionChange = (
    setter: (value: string) => void,
    value: string
  ) => {
    setter(value);
    // Different limits mean a different link; drop the cached one.
    setInviteLink(null);
    setLinkCopied(false);
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

  const bottomSheetHeight = Math.min(screenHeight * 0.72, 620);
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

              <Text
                variant="labelMedium"
                style={[styles.linkOptionLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                People who can join with this link
              </Text>
              <SegmentedButtons
                value={linkMaxUses}
                onValueChange={(value) =>
                  handleLinkOptionChange(setLinkMaxUses, value)
                }
                density="small"
                buttons={[
                  { value: "1", label: "1" },
                  { value: "5", label: "5" },
                  { value: "10", label: "10" },
                  { value: "25", label: "25" },
                ]}
                style={styles.linkOptionRow}
              />

              <Text
                variant="labelMedium"
                style={[styles.linkOptionLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                Link valid for
              </Text>
              <SegmentedButtons
                value={linkValidDays}
                onValueChange={(value) =>
                  handleLinkOptionChange(setLinkValidDays, value)
                }
                density="small"
                buttons={[
                  { value: "1", label: "1 day" },
                  { value: "7", label: "7 days" },
                  { value: "30", label: "30 days" },
                ]}
                style={styles.linkOptionRow}
              />

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
                {`This link can be used by ${
                  linkMaxUses === "1" ? "one person" : `up to ${linkMaxUses} people`
                } and expires in ${
                  linkValidDays === "1" ? "1 day" : `${linkValidDays} days`
                }.`}
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
  linkOptionLabel: {
    marginBottom: 6,
  },
  linkOptionRow: {
    marginBottom: 16,
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
