import React, { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Button, Surface, Text, TextInput, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { confirmPasswordReset } from "../utils/resetPassword";

interface ResetPasswordScreenProps {
  token?: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({
  token: initialToken,
  onBack,
  onSuccess,
}) => {
  const [useOTP, setUseOTP] = useState(false);
  const [token, setToken] = useState(initialToken || "");
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const theme = useTheme();

  // Extract token from URL if provided
  React.useEffect(() => {
    if (initialToken) {
      // If token is a URL, extract the access_token from hash or query params
      if (initialToken.includes("#") || initialToken.includes("?")) {
        try {
          const url = new URL(
            initialToken.includes("://")
              ? initialToken
              : `https://example.com${initialToken}`
          );
          const hash = url.hash.substring(1); // Remove the #
          const hashParams = new URLSearchParams(hash);
          const accessToken =
            hashParams.get("access_token") ||
            url.searchParams.get("access_token") ||
            initialToken;
          setToken(accessToken);
        } catch {
          // If URL parsing fails, use the token as-is
          setToken(initialToken);
        }
      } else {
        setToken(initialToken);
      }
    }
  }, [initialToken]);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return "Password must be at least 8 characters long";
    }
    if (pwd.length > 128) {
      return "Password must be 128 characters or less";
    }
    if (!/[A-Z]/.test(pwd)) {
      return "Password must contain at least one uppercase letter";
    }
    if (!/[a-z]/.test(pwd)) {
      return "Password must contain at least one lowercase letter";
    }
    if (!/[0-9]/.test(pwd)) {
      return "Password must contain at least one number";
    }
    return null;
  };

  const handleSubmit = async () => {
    if (useOTP) {
      if (!otp.trim()) {
        Alert.alert(
          "Error",
          "Please enter the 6-digit OTP code from your email"
        );
        return;
      }

      if (!email.trim()) {
        Alert.alert("Error", "Please enter your email address");
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        Alert.alert("Error", "Please enter a valid email address");
        return;
      }

      if (otp.trim().length !== 6 || !/^\d{6}$/.test(otp.trim())) {
        Alert.alert("Error", "OTP code must be 6 digits");
        return;
      }
    } else {
      if (!token.trim()) {
        Alert.alert("Error", "Please enter the reset token from your email");
        return;
      }
    }

    if (!password.trim()) {
      Alert.alert("Error", "Please enter a new password");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    const validationError = validatePassword(password);
    if (validationError) {
      Alert.alert("Error", validationError);
      return;
    }

    setLoading(true);
    try {
      if (useOTP) {
        // Use OTP code
        await confirmPasswordReset(
          otp.trim(),
          password,
          email.trim().toLowerCase()
        );
      } else {
        // Extract token from URL if needed
        let finalToken = token.trim();
        if (finalToken.includes("#") || finalToken.includes("?")) {
          try {
            const url = new URL(
              finalToken.includes("://")
                ? finalToken
                : `https://example.com${finalToken}`
            );
            const hash = url.hash.substring(1);
            const hashParams = new URLSearchParams(hash);
            finalToken =
              hashParams.get("access_token") ||
              url.searchParams.get("access_token") ||
              finalToken;
          } catch {
            // If URL parsing fails, use the token as-is
          }
        }
        await confirmPasswordReset(finalToken, password);
      }

      Alert.alert(
        "Password Reset",
        "Your password has been reset successfully. You can now sign in with your new password.",
        [
          {
            text: "OK",
            onPress: onSuccess,
          },
        ]
      );
    } catch (error: any) {
      const errorMessage =
        error.message || "Failed to reset password. Please try again.";
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
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
            <View
              style={[styles.logoContainer, { backgroundColor: "transparent" }]}
            >
              <Image
                source={require("../assets/logo.png")}
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel="ShareMoney app icon"
              />
            </View>
            <Text variant="displaySmall" style={styles.title}>
              Set New Password
            </Text>
            <Text
              variant="bodyLarge"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Enter your new password below
            </Text>
          </View>

          <Surface style={styles.formContainer} elevation={0}>
            {!initialToken && (
              <>
                <View style={styles.methodToggle}>
                  <Button
                    mode={!useOTP ? "contained" : "outlined"}
                    onPress={() => setUseOTP(false)}
                    disabled={loading}
                    compact
                    style={styles.toggleButton}
                  >
                    Use Reset Link
                  </Button>
                  <Button
                    mode={useOTP ? "contained" : "outlined"}
                    onPress={() => setUseOTP(true)}
                    disabled={loading}
                    compact
                    style={styles.toggleButton}
                  >
                    Use OTP Code
                  </Button>
                </View>

                {useOTP ? (
                  <>
                    <TextInput
                      label="Email"
                      value={email}
                      onChangeText={setEmail}
                      mode="outlined"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      disabled={loading}
                      style={styles.input}
                      left={<TextInput.Icon icon="email" />}
                    />
                    <TextInput
                      label="OTP Code"
                      value={otp}
                      onChangeText={(text) => {
                        // Only allow 6 digits
                        const digits = text.replace(/\D/g, "").slice(0, 6);
                        setOtp(digits);
                      }}
                      mode="outlined"
                      keyboardType="number-pad"
                      autoCapitalize="none"
                      disabled={loading}
                      style={styles.input}
                      placeholder="Enter 6-digit code"
                      left={<TextInput.Icon icon="numeric" />}
                      maxLength={6}
                    />
                    <Text
                      variant="bodySmall"
                      style={[
                        styles.tokenHint,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Enter the 6-digit code from your email
                    </Text>
                  </>
                ) : (
                  <>
                    <TextInput
                      label="Reset Token"
                      value={token}
                      onChangeText={setToken}
                      mode="outlined"
                      autoCapitalize="none"
                      disabled={loading}
                      style={styles.input}
                      placeholder="Paste the full reset URL or access_token from email"
                      left={<TextInput.Icon icon="key" />}
                      multiline={token.length > 50}
                      numberOfLines={token.length > 50 ? 3 : 1}
                    />
                    <Text
                      variant="bodySmall"
                      style={[
                        styles.tokenHint,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Tip: Copy the entire reset link from your email, or
                      extract just the access_token value (starts with "eyJ")
                    </Text>
                  </>
                )}
              </>
            )}

            <TextInput
              label="New Password"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              disabled={loading}
              style={styles.input}
              left={<TextInput.Icon icon="lock" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />

            <Text
              variant="bodySmall"
              style={[
                styles.passwordHint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Password must be at least 8 characters and contain uppercase,
              lowercase, and a number
            </Text>

            <TextInput
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              mode="outlined"
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              disabled={loading}
              style={styles.input}
              left={<TextInput.Icon icon="lock-check" />}
              right={
                <TextInput.Icon
                  icon={showConfirmPassword ? "eye-off" : "eye"}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                />
              }
            />

            <Button
              mode="contained"
              onPress={handleSubmit}
              disabled={loading}
              loading={loading}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              Reset Password
            </Button>

            <Button
              mode="text"
              onPress={onBack}
              disabled={loading}
              style={styles.backButton}
            >
              Back to Sign In
            </Button>
          </Surface>
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
    marginBottom: 48,
    alignItems: "center",
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
  },
  formContainer: {
    backgroundColor: "transparent",
  },
  input: {
    marginBottom: 16,
  },
  passwordHint: {
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  tokenHint: {
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 4,
    fontSize: 11,
  },
  button: {
    marginTop: 8,
    marginBottom: 16,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  backButton: {
    marginTop: 8,
  },
  methodToggle: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  toggleButton: {
    flex: 1,
  },
});
