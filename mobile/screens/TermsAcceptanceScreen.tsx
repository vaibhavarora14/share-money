import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  Button,
  Checkbox,
  Icon,
  Surface,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { openAppExternalUrl } from "../utils/openAppExternalUrl";
import { styles } from "./TermsAcceptanceScreen.styles";

const TERMS_URL = "https://sharedmoney.app/terms";
const PRIVACY_URL = "https://sharedmoney.app/privacy";

export const TermsAcceptanceScreen: React.FC = () => {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const { signOut } = useAuth();
  const { updateProfile, updateProfileLoading } = useProfile();

  const handleContinue = async () => {
    if (!accepted || updateProfileLoading) return;

    setError(null);
    try {
      await updateProfile({ accept_terms: true });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't save your agreement. Please try again."
      );
    }
  };

  const handleOpenLegalUrl = (url: string) => {
    void (async () => {
      const result = await openAppExternalUrl(url, { showUserError: false });
      if (!result.ok) {
        setError(result.error);
      }
    })();
  };  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Icon
              source="shield-check-outline"
              size={32}
              color={theme.colors.onPrimaryContainer}
            />
          </View>
          <Text
            variant="headlineSmall"
            style={[styles.title, { color: theme.colors.onBackground }]}
          >
            Before you continue
          </Text>
          <Text
            variant="bodyLarge"
            style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
          >
            SharedMoney works best when every group is respectful and safe.
          </Text>
        </View>

        <Surface
          style={[styles.rulesCard, { backgroundColor: theme.colors.surface }]}
          elevation={1}
        >
          <Text
            variant="titleMedium"
            style={[styles.rulesTitle, { color: theme.colors.onSurface }]}
          >
            Community rules
          </Text>
          <Rule text="Keep names, notes, and activity respectful." />
          <Rule text="Do not post harassment, hate, sexual content, violence, or spam." />
          <Rule text="Report objectionable content and block abusive members when needed." />
        </Surface>

        <Pressable
          onPress={() => setAccepted((current) => !current)}
          disabled={updateProfileLoading}
          accessibilityRole="checkbox"
          accessibilityState={{
            checked: accepted,
            disabled: updateProfileLoading,
          }}
          accessibilityLabel="Agree to the Terms of Use and Privacy Policy"
          style={({ pressed }) => [
            styles.agreement,
            {
              borderColor: accepted
                ? theme.colors.primary
                : theme.colors.outline,
              backgroundColor: accepted
                ? theme.colors.primaryContainer
                : theme.colors.surface,
            },
            pressed && !updateProfileLoading ? styles.pressed : null,
          ]}
        >
          <View pointerEvents="none">
            <Checkbox.Android
              status={accepted ? "checked" : "unchecked"}
              disabled={updateProfileLoading}
            />
          </View>
          <Text
            variant="bodyMedium"
            style={[styles.agreementText, { color: theme.colors.onSurface }]}
          >
            I agree to the Terms of Use and Privacy Policy.
          </Text>
        </Pressable>

        <View style={styles.links}>
          <Button
            mode="text"
            compact
            accessibilityRole="link"
            onPress={() => handleOpenLegalUrl(TERMS_URL)}
          >
            Terms of Use
          </Button>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>·</Text>
          <Button
            mode="text"
            compact
            accessibilityRole="link"
            onPress={() => handleOpenLegalUrl(PRIVACY_URL)}
          >
            Privacy Policy
          </Button>
        </View>
        {error ? (
          <Text
            accessibilityRole="alert"
            variant="bodyMedium"
            style={[styles.error, { color: theme.colors.error }]}
          >
            {error}
          </Text>
        ) : null}

        <Button
          mode="contained"
          onPress={handleContinue}
          disabled={!accepted || updateProfileLoading}
          loading={updateProfileLoading}
          contentStyle={styles.continueButtonContent}
        >
          Agree and continue
        </Button>
        <Button
          mode="text"
          onPress={() => void signOut()}
          disabled={updateProfileLoading}
          style={styles.signOutButton}
        >
          Sign out
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
};

const Rule: React.FC<{ text: string }> = ({ text }) => {
  const theme = useTheme();

  return (
    <View style={styles.rule}>
      <Icon
        source="check-circle-outline"
        size={20}
        color={theme.colors.primary}
      />
      <Text
        variant="bodyMedium"
        style={[styles.ruleText, { color: theme.colors.onSurfaceVariant }]}
      >
        {text}
      </Text>
    </View>
  );
};
