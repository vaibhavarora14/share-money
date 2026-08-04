import React, { useEffect, useState } from "react";
import {
    Alert,
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
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
  onAddMember: (person: { fullName: string; email?: string | null }) => Promise<any>;
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
  const [fullName, setFullName] = useState("");
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
  const useNativeDriver = Platform.OS !== "web";

  // Animation effect
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver,
      }).start();
    }
  }, [visible, slideAnim, useNativeDriver]);

  const handleDismiss = () => {
    setFullName("");
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
            title: "Join my group on SharedMoney!",
            text: `Join my group on SharedMoney! ${url}`,
            url,
          });
        } else if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          setLinkCopied(true);
        }
      } else {
        await Share.share({
          message: `Join my group on SharedMoney! ${url}`,
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
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      Alert.alert("Error", "Please enter a name");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      await onAddMember({
        fullName: trimmedName,
        email: trimmedEmail || null,
      });
      Alert.alert(
        "Added",
        "This person can now be included in expenses.",
        [{ text: "OK", onPress: handleDismiss }]
      );
    } catch (error) {
      showErrorAlert(error, signOut, "Error");
    } finally {
      setLoading(false);
    }
  };

  const bottomSheetHeight = Math.min(screenHeight * 0.64, 560);
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
        <Pressable
          style={styles.backdrop}
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
            <Appbar.Content title="Add person" titleStyle={{ fontWeight: 'bold' }} />
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
                Add them now and include them in expenses. Email is optional.
              </Text>

              <TextInput
                label="Name"
                value={fullName}
                onChangeText={setFullName}
                mode="outlined"
                autoCapitalize="words"
                disabled={loading}
                style={styles.input}
                left={<TextInput.Icon icon="account" />}
                placeholder="Ayaan"
                testID="person-name-input"
              />

              <TextInput
                label="Email (optional)"
                value={email}
                onChangeText={setEmail}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                disabled={loading}
                style={styles.input}
                left={<TextInput.Icon icon="email" />}
                placeholder="ayaan@example.com"
                testID="person-email-input"
              />

              <Button
                mode="contained"
                onPress={handleAdd}
                disabled={loading}
                loading={loading}
                style={styles.addButton}
                testID="add-member-submit-button"
              >
                Add person
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
                  {Platform.OS === "web" && linkCopied ? "Copied!" : "Copy invite link"}
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
                  Invite to SharedMoney
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
