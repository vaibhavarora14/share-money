import * as AppleAuthentication from "expo-apple-authentication";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Button,
  Surface,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";

type AuthStep = "methods" | "email";

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
  const [authStep, setAuthStep] = useState<AuthStep>("methods");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const emailInputRef = useRef<any>(null);
  const { signIn, signUp, signInWithGoogle, signInWithApple } = useAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 960;
  const socialLoading = googleLoading || appleLoading;
  const formDisabled = loading || socialLoading;
  const emailInvalid = Boolean(formError && formError.toLowerCase().includes("email"));
  const passwordInvalid = Boolean(
    formError && formError.toLowerCase().includes("password")
  );
  const accountPrompt = isSignUp
    ? "Already have an account?"
    : "New to SharedMoney?";
  const accountAction = isSignUp ? "Sign In" : "Create account";

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

  useEffect(() => {
    if (authStep !== "email") return;

    const focusTimer = setTimeout(() => emailInputRef.current?.focus(), 0);
    return () => clearTimeout(focusTimer);
  }, [authStep]);

  const clearFormError = () => {
    if (formError) setFormError(null);
  };

  const showEmailForm = () => {
    clearFormError();
    setAuthStep("email");
  };

  const showMethods = () => {
    Keyboard.dismiss();
    clearFormError();
    setAuthStep("methods");
  };

  const toggleMode = () => {
    clearFormError();
    onToggleMode();
  };

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
        Alert.alert(errorTitle, errorMessage, [{ text: "OK", style: "default" }]);
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
        Alert.alert("Google Sign In Failed", error.message || "Failed to sign in with Google", [
          { text: "OK", style: "default" },
        ]);
      }
    } catch (err) {
      console.error("Error in Google sign in:", err);
      Alert.alert("Error", "An unexpected error occurred. Please try again.", [
        { text: "OK", style: "default" },
      ]);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    try {
      const { error } = await signInWithApple();
      if (error) {
        Alert.alert("Apple Sign In Failed", error.message || "Failed to sign in with Apple", [
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

  const renderLogo = (size: "compact" | "desktop") => (
    <Image
      source={require("../assets/logo.png")}
      style={size === "desktop" ? styles.desktopLogo : styles.logo}
      resizeMode="contain"
      accessibilityLabel="SharedMoney app icon"
    />
  );

  const renderAccountToggle = () => (
    <View style={styles.accountToggle}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {accountPrompt}{" "}
      </Text>
      <Button
        mode="text"
        compact
        onPress={toggleMode}
        disabled={formDisabled}
        contentStyle={styles.accountToggleButtonContent}
        labelStyle={styles.accountToggleButtonLabel}
      >
        {accountAction}
      </Button>
    </View>
  );

  const renderMethods = () => (
    <View style={styles.methodScreen}>
      {!isDesktopWeb ? renderLogo("compact") : null}
      <Text variant="headlineSmall" style={[styles.methodTitle, { color: theme.colors.onBackground }]}>
        {isSignUp ? "Create your account" : "Log in to SharedMoney"}
      </Text>

      <View style={styles.methodStack}>
        <Button
          mode="contained"
          icon="google"
          onPress={handleGoogleSignIn}
          disabled={formDisabled}
          loading={googleLoading}
          style={styles.methodButton}
          contentStyle={styles.methodButtonContent}
        >
          Continue with Google
        </Button>

        {appleSignInAvailable ? (
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
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={8}
              onPress={handleAppleSignIn}
              style={styles.appleButton}
              accessibilityLabel="Continue with Apple"
            />
          </View>
        ) : null}

        <Button
          mode="outlined"
          onPress={showEmailForm}
          disabled={formDisabled}
          style={styles.methodButton}
          contentStyle={styles.methodButtonContent}
        >
          Continue with email
        </Button>
      </View>

      {renderAccountToggle()}
    </View>
  );

  const renderEmailForm = () => (
    <View style={styles.emailScreen}>
      <Button
        mode="text"
        icon="arrow-left"
        onPress={showMethods}
        disabled={formDisabled}
        style={styles.backButton}
        contentStyle={styles.backButtonContent}
      >
        All sign-in methods
      </Button>

      <Text variant="headlineSmall" style={[styles.emailTitle, { color: theme.colors.onBackground }]}>
        {isSignUp ? "Create your account" : "Log in with email"}
      </Text>

      <TextInput
        ref={emailInputRef}
        label="Email"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          clearFormError();
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
          clearFormError();
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
        style={styles.methodButton}
        contentStyle={styles.methodButtonContent}
      >
        {isSignUp ? "Create account" : "Sign In"}
      </Button>

      {renderAccountToggle()}
    </View>
  );

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
          contentContainerStyle={[
            styles.scrollContent,
            isDesktopWeb && styles.desktopScrollContent,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {isDesktopWeb ? (
            <View style={styles.desktopBrandPane}>
              <View style={styles.desktopBrandTop}>{renderLogo("desktop")}</View>
              <View style={styles.desktopStatement}>
                <Text variant="displaySmall" style={[styles.desktopStatementTitle, { color: theme.colors.onBackground }]}>
                  One shared record for group money.
                </Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                  Shared expenses, clearly settled.
                </Text>
              </View>
              <View style={styles.desktopProof}>
                <View style={[styles.proofLine, { backgroundColor: theme.colors.primary }]} />
                <View style={[styles.proofDot, { backgroundColor: theme.colors.tertiary }]} />
                <View style={[styles.proofDot, { backgroundColor: theme.colors.secondary }]} />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Add · See · Settle
                </Text>
              </View>
            </View>
          ) : null}

          <Surface
            style={[
              styles.authPane,
              isDesktopWeb && styles.desktopAuthPane,
              { backgroundColor: isDesktopWeb ? theme.colors.surface : theme.colors.background },
            ]}
            elevation={0}
          >
            {authStep === "methods" ? renderMethods() : renderEmailForm()}
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
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  desktopScrollContent: {
    flexDirection: "row",
    minHeight: "100%",
    padding: 0,
  },
  desktopBrandPane: {
    flex: 1.32,
    justifyContent: "space-between",
    paddingHorizontal: 72,
    paddingVertical: 56,
  },
  desktopBrandTop: {
    alignItems: "flex-start",
  },
  desktopLogo: {
    width: 56,
    height: 56,
  },
  desktopStatement: {
    maxWidth: 620,
    gap: 20,
  },
  desktopStatementTitle: {
    fontWeight: "700",
    letterSpacing: -1.6,
    lineHeight: 60,
  },
  desktopProof: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  proofLine: {
    width: 26,
    height: 3,
    borderRadius: 2,
  },
  proofDot: {
    width: 6,
    height: 3,
    borderRadius: 2,
  },
  authPane: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  desktopAuthPane: {
    flex: 0.68,
    minWidth: 420,
    paddingHorizontal: 48,
  },
  methodScreen: {
    alignItems: "center",
    width: "100%",
    maxWidth: 342,
  },
  logo: {
    width: 50,
    height: 50,
    marginBottom: 28,
  },
  methodTitle: {
    fontWeight: "700",
    textAlign: "center",
  },
  methodStack: {
    gap: 12,
    marginTop: 30,
    width: "100%",
  },
  methodButton: {
    width: "100%",
  },
  methodButtonContent: {
    minHeight: 48,
  },
  appleButtonContainer: {
    height: 48,
  },
  appleButton: {
    height: 48,
    width: "100%",
  },
  disabledSocialButton: {
    opacity: 0.6,
  },
  accountToggle: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  accountToggleButtonContent: {
    minHeight: 32,
  },
  accountToggleButtonLabel: {
    marginHorizontal: 0,
  },
  emailScreen: {
    width: "100%",
    maxWidth: 342,
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: 20,
    marginLeft: -8,
  },
  backButtonContent: {
    minHeight: 40,
  },
  emailTitle: {
    fontWeight: "700",
    marginBottom: 28,
  },
  input: {
    marginBottom: 16,
  },
  formError: {
    fontWeight: "600",
    marginBottom: 16,
  },
});
