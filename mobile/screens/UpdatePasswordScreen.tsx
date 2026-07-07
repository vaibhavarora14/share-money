import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  HelperText,
  Icon,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { showAlert } from "../utils/alert";

interface UpdatePasswordScreenProps {
  /** Called after the password was changed (or the user skipped). */
  onComplete: () => void;
}

/**
 * Shown when the user arrives via a password-recovery link. The recovery
 * session is already established; this screen just sets the new password.
 */
export const UpdatePasswordScreen: React.FC<UpdatePasswordScreenProps> = ({
  onComplete,
}) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { updatePassword, clearPasswordRecovery } = useAuth();
  const theme = useTheme();

  const handleSave = async () => {
    let valid = true;
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      valid = false;
    }
    if (confirmPassword !== password) {
      setConfirmError("Passwords do not match");
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        showAlert("Could Not Update Password", error.message);
        return;
      }
      showAlert(
        "Password Updated",
        "Your password has been changed. You are now signed in."
      );
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    clearPasswordRecovery();
    onComplete();
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Icon
              source="lock-reset"
              size={56}
              color={theme.colors.primary}
            />
            <Text variant="headlineSmall" style={styles.title}>
              Set a New Password
            </Text>
            <Text
              variant="bodyMedium"
              style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Choose a new password for your account.
            </Text>
          </View>

          <TextInput
            label="New Password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError("");
            }}
            mode="outlined"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            disabled={loading}
            error={!!passwordError}
            style={styles.input}
            left={<TextInput.Icon icon="lock" />}
            right={
              <TextInput.Icon
                icon={showPassword ? "eye-off" : "eye"}
                onPress={() => setShowPassword(!showPassword)}
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
              />
            }
          />
          {!!passwordError && (
            <HelperText type="error" visible style={styles.helperText}>
              {passwordError}
            </HelperText>
          )}

          <TextInput
            label="Confirm New Password"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (confirmError) setConfirmError("");
            }}
            mode="outlined"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            disabled={loading}
            error={!!confirmError}
            style={styles.input}
            left={<TextInput.Icon icon="lock-check" />}
          />
          {!!confirmError && (
            <HelperText type="error" visible style={styles.helperText}>
              {confirmError}
            </HelperText>
          )}

          <Button
            mode="contained"
            onPress={handleSave}
            disabled={loading}
            loading={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Update Password
          </Button>

          <Button mode="text" onPress={handleSkip} disabled={loading}>
            Skip for now
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
  },
  input: {
    marginBottom: 4,
  },
  helperText: {
    marginBottom: 4,
  },
  button: {
    marginTop: 20,
    marginBottom: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
