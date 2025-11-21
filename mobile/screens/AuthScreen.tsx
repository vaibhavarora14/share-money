import React, { useState } from "react";
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
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const theme = useTheme();

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const result = isSignUp
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);

      if (result.error) {
        const errorMessage = result.error.message || "An error occurred";
        const errorTitle = isSignUp ? "Sign Up Failed" : "Sign In Failed";
        
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
                source={require('../assets/icon.png')} 
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel="ShareMoney app icon"
              />
            </View>
            <Text variant="displaySmall" style={styles.title}>
              {isSignUp ? "Create Account" : "Welcome Back"}
            </Text>
            <Text
              variant="bodyLarge"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {isSignUp
                ? "Sign up to start tracking your transactions"
                : "Sign in to continue"}
            </Text>
          </View>

          <Surface style={styles.formContainer} elevation={0}>
            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              disabled={loading || googleLoading}
              style={styles.input}
              left={<TextInput.Icon icon="email" />}
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              disabled={loading || googleLoading}
              style={styles.input}
              left={<TextInput.Icon icon="lock" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />

            <Button
              mode="contained"
              onPress={handleSubmit}
              disabled={loading || googleLoading}
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

            <Button
              mode="outlined"
              onPress={handleGoogleSignIn}
              disabled={loading || googleLoading}
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
              disabled={loading || googleLoading}
              style={styles.toggleButton}
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
  input: {
    marginBottom: 16,
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
  toggleButton: {
    marginTop: 8,
  },
});
