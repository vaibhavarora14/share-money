import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import {
  Button,
  Divider,
  HelperText,
  Icon,
  Surface,
  Text,
  TextInput,
  useTheme
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { PRIVACY_POLICY_URL } from "../constants/links";
import { useAuth } from "../contexts/AuthContext";
import { showAlert } from "../utils/alert";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AuthScreenProps {
  onToggleMode: () => void;
  isSignUp: boolean;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onToggleMode,
  isSignUp,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [showResetForm, setShowResetForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp, signInWithGoogle, signInWithApple, resetPassword } =
    useAuth();
  const theme = useTheme();

  // Native Sign in with Apple is iOS-only; the web build uses the browser
  // OAuth flow. Android is intentionally excluded (no Apple requirement there).
  const showAppleSignIn = Platform.OS === "ios" || Platform.OS === "web";
  const anyLoading = loading || googleLoading || appleLoading;

  const validateEmail = (): boolean => {
    if (!email.trim()) {
      setEmailError("Please enter your email");
      return false;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError("Please enter a valid email address");
      return false;
    }
    return true;
  };

  const validatePassword = (): boolean => {
    if (!password.trim()) {
      setPasswordError("Please enter your password");
      return false;
    }
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setInfoMessage("");
    const emailValid = validateEmail();
    const passwordValid = validatePassword();
    if (!emailValid || !passwordValid) return;

    setLoading(true);
    try {
      const result = isSignUp
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);

      if (result.error) {
        const errorMessage = result.error.message || "An error occurred";
        const errorTitle = isSignUp ? "Sign Up Failed" : "Sign In Failed";
        showAlert(errorTitle, errorMessage);
        return;
      }

      // Email confirmation required: no session yet, so the auth screen stays
      // mounted — tell the user what to do instead of silently doing nothing.
      if (isSignUp && "needsEmailConfirmation" in result && result.needsEmailConfirmation) {
        setInfoMessage(
          `Account created! Check ${email.trim()} for a confirmation link, then sign in.`
        );
        setPassword("");
      }
    } catch (err) {
      console.error("Unexpected error in authentication:", err);
      showAlert("Error", "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleProviderSignIn = async (provider: "google" | "apple") => {
    const providerName = provider === "google" ? "Google" : "Apple";
    const setProviderLoading =
      provider === "google" ? setGoogleLoading : setAppleLoading;

    setProviderLoading(true);
    try {
      const result =
        provider === "google" ? await signInWithGoogle() : await signInWithApple();

      // The user backed out of the auth sheet on purpose — stay quiet.
      if (result.cancelled) {
        return;
      }

      if (result.error) {
        const errorMessage =
          result.error.message || `Failed to sign in with ${providerName}`;
        showAlert(`${providerName} Sign In Failed`, errorMessage);
      }
    } catch (err) {
      console.error(`Error in ${providerName} sign in:`, err);
      showAlert("Error", "An unexpected error occurred. Please try again.");
    } finally {
      setProviderLoading(false);
    }
  };

  const handleSendResetLink = async () => {
    setInfoMessage("");
    if (!validateEmail()) return;

    setLoading(true);
    try {
      const { error } = await resetPassword(email.trim());
      if (error) {
        showAlert("Could Not Send Reset Link", error.message);
        return;
      }
      setInfoMessage(
        `If an account exists for ${email.trim()}, a password reset link is on its way. Check your inbox.`
      );
    } finally {
      setLoading(false);
    }
  };

  const openPrivacyPolicy = () => {
    Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
      showAlert("Error", "Could not open the privacy policy");
    });
  };

  const title = showResetForm
    ? "Reset Password"
    : isSignUp
    ? "Create Account"
    : "Welcome Back";
  const subtitle = showResetForm
    ? "Enter your email and we'll send you a reset link"
    : isSignUp
    ? "Sign up to start tracking your transactions"
    : "Sign in to continue";

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
            <View style={[styles.logoContainer, { backgroundColor: 'transparent' }]}>
              <Image 
                source={require('../assets/logo.png')} 
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel="ShareMoney app icon"
              />
            </View>
            <Text variant="displaySmall" style={styles.title}>
              {title}
            </Text>
            <Text
              variant="bodyLarge"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {subtitle}
            </Text>
          </View>

          <Surface style={styles.formContainer} elevation={0}>
            {!!infoMessage && (
              <Surface
                style={[
                  styles.infoBox,
                  { backgroundColor: theme.colors.secondaryContainer },
                ]}
                elevation={0}
              >
                <Icon
                  source="email-check-outline"
                  size={22}
                  color={theme.colors.onSecondaryContainer}
                />
                <Text
                  variant="bodyMedium"
                  style={[
                    styles.infoText,
                    { color: theme.colors.onSecondaryContainer },
                  ]}
                >
                  {infoMessage}
                </Text>
              </Surface>
            )}

            <TextInput
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (emailError) setEmailError("");
              }}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              disabled={anyLoading}
              error={!!emailError}
              style={styles.input}
              left={<TextInput.Icon icon="email" />}
            />
            {!!emailError && (
              <HelperText type="error" visible style={styles.helperText}>
                {emailError}
              </HelperText>
            )}

            {showResetForm ? (
              <>
                <Button
                  mode="contained"
                  onPress={handleSendResetLink}
                  disabled={anyLoading}
                  loading={loading}
                  style={styles.button}
                  contentStyle={styles.buttonContent}
                >
                  Send Reset Link
                </Button>

                <Button
                  mode="text"
                  onPress={() => {
                    setShowResetForm(false);
                    setInfoMessage("");
                    setEmailError("");
                  }}
                  disabled={anyLoading}
                  style={styles.toggleButton}
                >
                  Back to Sign In
                </Button>
              </>
            ) : (
              <>
                <TextInput
                  label="Password"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (passwordError) setPasswordError("");
                  }}
                  mode="outlined"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  textContentType={isSignUp ? "newPassword" : "password"}
                  disabled={anyLoading}
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

                {!isSignUp && (
                  <Button
                    mode="text"
                    compact
                    onPress={() => {
                      setShowResetForm(true);
                      setInfoMessage("");
                      setPasswordError("");
                    }}
                    disabled={anyLoading}
                    style={styles.forgotButton}
                  >
                    Forgot password?
                  </Button>
                )}

                <Button
                  mode="contained"
                  onPress={handleSubmit}
                  disabled={anyLoading}
                  loading={loading}
                  style={styles.button}
                  contentStyle={styles.buttonContent}
                >
                  {isSignUp ? "Sign Up" : "Sign In"}
                </Button>

                <View style={styles.dividerContainer}>
                  <Divider style={styles.divider} />
                  <Text
                    variant="bodySmall"
                    style={[
                      styles.dividerText,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    OR
                  </Text>
                  <Divider style={styles.divider} />
                </View>

                {showAppleSignIn && (
                  <Button
                    mode="outlined"
                    onPress={() => handleProviderSignIn("apple")}
                    disabled={anyLoading}
                    loading={appleLoading}
                    style={styles.providerButton}
                    contentStyle={styles.buttonContent}
                    icon="apple"
                    accessibilityLabel="Continue with Apple"
                  >
                    Continue with Apple
                  </Button>
                )}

                <Button
                  mode="outlined"
                  onPress={() => handleProviderSignIn("google")}
                  disabled={anyLoading}
                  loading={googleLoading}
                  style={styles.providerButton}
                  contentStyle={styles.buttonContent}
                  icon="google"
                  accessibilityLabel="Continue with Google"
                >
                  Continue with Google
                </Button>

                <Button
                  mode="text"
                  onPress={() => {
                    setInfoMessage("");
                    setEmailError("");
                    setPasswordError("");
                    onToggleMode();
                  }}
                  disabled={anyLoading}
                  style={styles.toggleButton}
                >
                  {isSignUp
                    ? "Already have an account? Sign In"
                    : "Don't have an account? Sign Up"}
                </Button>

                <Text
                  variant="bodySmall"
                  style={[
                    styles.legalText,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  By continuing, you agree to our{" "}
                  <Text
                    variant="bodySmall"
                    style={[styles.legalLink, { color: theme.colors.primary }]}
                    onPress={openPrivacyPolicy}
                    accessibilityRole="link"
                    accessibilityLabel="Open privacy policy"
                  >
                    Privacy Policy
                  </Text>
                </Text>
              </>
            )}
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
    overflow: 'hidden', // Ensure proper clipping of rounded corners
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
    backgroundColor: 'transparent',
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
  },
  input: {
    marginBottom: 16,
  },
  helperText: {
    marginTop: -14,
    marginBottom: 4,
  },
  forgotButton: {
    alignSelf: "flex-end",
    marginTop: -8,
  },
  button: {
    marginTop: 8,
    marginBottom: 24,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  divider: {
    flex: 1,
  },
  dividerText: {
    marginHorizontal: 16,
  },
  providerButton: {
    marginBottom: 16,
  },
  toggleButton: {
    marginTop: 8,
  },
  legalText: {
    textAlign: "center",
    marginTop: 16,
  },
  legalLink: {
    textDecorationLine: "underline",
  },
});
