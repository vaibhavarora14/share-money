import * as AppleAuthentication from "expo-apple-authentication";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import {
  Button,
  Divider,
  Surface,
  Text,
  TextInput,
  useTheme
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";

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
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { signIn, signUp, signInWithGoogle, signInWithApple } = useAuth();
  const theme = useTheme();
  const socialLoading = googleLoading || appleLoading;
  const formDisabled = loading || socialLoading;
  const emailInvalid = Boolean(formError && formError.toLowerCase().includes("email"));
  const passwordInvalid = Boolean(
    formError && formError.toLowerCase().includes("password")
  );

  useEffect(() => {
    let mounted = true;

    if (Platform.OS !== "ios") {
      setAppleSignInAvailable(false);
      return () => {
        mounted = false;
      };
    }

    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (mounted) {
          setAppleSignInAvailable(available);
        }
      })
      .catch(() => {
        if (mounted) {
          setAppleSignInAvailable(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    setFormError(null);

    if (!trimmedEmail) {
      setFormError("Enter your email address.");
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError("Enter a valid email address.");
      return;
    }

    if (!password.trim()) {
      setFormError("Enter your password.");
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const result = isSignUp
        ? await signUp(trimmedEmail, password)
        : await signIn(trimmedEmail, password);

      if (result.error) {
        const errorMessage = result.error.message || "An error occurred";
        const errorTitle = isSignUp ? "Sign Up Failed" : "Sign In Failed";
        setFormError(errorMessage);
        
        Alert.alert(
          errorTitle,
          errorMessage,
          [{ text: "OK", style: "default" }]
        );
      }
    } catch (err) {
      console.error("Unexpected error in authentication:", err);
      Alert.alert("Error", "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        const errorMessage = error.message || "Failed to sign in with Google";
        Alert.alert(
          "Google Sign In Failed",
          errorMessage,
          [{ text: "OK", style: "default" }]
        );
      }
    } catch (err) {
      console.error("Error in Google sign in:", err);
      Alert.alert(
        "Error",
        "An unexpected error occurred. Please try again.",
        [{ text: "OK", style: "default" }]
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    try {
      const { error } = await signInWithApple();
      if (error) {
        const errorMessage = error.message || "Failed to sign in with Apple";
        Alert.alert("Apple Sign In Failed", errorMessage, [
          { text: "OK", style: "default" },
        ]);
      }
    } catch (err) {
      console.error("Error in Apple sign in:", err);
      Alert.alert("Error", "An unexpected error occurred. Please try again.", [
        { text: "OK", style: "default" },
      ]);
    } finally {
      setAppleLoading(false);
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
            <Surface
              style={[
                styles.logoContainer,
                { backgroundColor: theme.colors.surface },
              ]}
              elevation={1}
            >
              <Image 
                source={require('../assets/logo.png')} 
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel="SharedMoney app icon"
              />
            </Surface>
            <Text variant="displaySmall" style={[styles.title, { color: theme.colors.onBackground }]}>
              SharedMoney
            </Text>
            <Text
              variant="bodyLarge"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {isSignUp
                ? "Create an account for shared expenses, clearly settled."
                : "Shared expenses, clearly settled."}
            </Text>
          </View>

          <Surface style={styles.formContainer} elevation={0}>
            <TextInput
              label="Email"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (formError) setFormError(null);
              }}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel="Email"
              accessibilityHint="Enter the email address for your SharedMoney account"
              aria-describedby={formError ? "auth-form-error" : undefined}
              aria-invalid={emailInvalid || undefined}
              disabled={formDisabled}
              error={emailInvalid}
              style={styles.input}
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (formError) setFormError(null);
              }}
              mode="outlined"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              textContentType={isSignUp ? "newPassword" : "password"}
              accessibilityLabel="Password"
              accessibilityHint="Enter your SharedMoney password"
              aria-describedby={formError ? "auth-form-error" : undefined}
              aria-invalid={passwordInvalid || undefined}
              disabled={formDisabled}
              error={passwordInvalid}
              style={styles.input}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  forceTextInputFocus={false}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />

            {formError ? (
              <Text
                nativeID="auth-form-error"
                accessibilityRole="alert"
                variant="bodyMedium"
                style={[styles.formError, { color: theme.colors.error }]}
              >
                {formError}
              </Text>
            ) : null}

            <Button
              mode="contained"
              onPress={handleSubmit}
              disabled={formDisabled}
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

            {appleSignInAvailable && (
              <View
                pointerEvents={formDisabled ? "none" : "auto"}
                style={[
                  styles.appleButtonContainer,
                  formDisabled && styles.disabledSocialButton,
                ]}
              >
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={8}
                  onPress={handleAppleSignIn}
                  style={styles.appleButton}
                />
              </View>
            )}

            <Button
              mode="outlined"
              onPress={handleGoogleSignIn}
              disabled={formDisabled}
              loading={googleLoading}
              style={styles.googleButton}
              contentStyle={styles.buttonContent}
              icon="google"
            >
              Continue with Google
            </Button>

            <Button
              mode="text"
              onPress={onToggleMode}
              disabled={formDisabled}
              style={styles.toggleButton}
              contentStyle={styles.toggleButtonContent}
            >
              {isSignUp
                ? "Already have an account? Sign In"
                : "Don't have an account? Sign Up"}
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
    alignItems: "center",
    padding: 24,
    paddingVertical: 40,
  },
  header: {
    width: "100%",
    maxWidth: 440,
    marginBottom: 40,
    alignItems: "center",
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logoImage: {
    width: 80,
    height: 80,
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
    width: "100%",
    maxWidth: 440,
    backgroundColor: 'transparent',
  },
  input: {
    marginBottom: 16,
  },
  formError: {
    marginBottom: 16,
    fontWeight: "600",
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
  googleButton: {
    marginBottom: 16,
  },
  appleButtonContainer: {
    height: 48,
    marginBottom: 16,
  },
  appleButton: {
    width: "100%",
    height: 48,
  },
  disabledSocialButton: {
    opacity: 0.6,
  },
  toggleButton: {
    marginTop: 8,
  },
  toggleButtonContent: {
    minHeight: 44,
  },
});
