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
import { requestPasswordReset } from "../utils/resetPassword";

interface RequestPasswordResetScreenProps {
  onBack: () => void;
  onSuccess: () => void;
  onEnterToken?: () => void;
}

export const RequestPasswordResetScreen: React.FC<
  RequestPasswordResetScreenProps
> = ({ onBack, onSuccess, onEnterToken }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const handleSubmit = async () => {
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

    setLoading(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());

      Alert.alert(
        "Reset Link Sent",
        "If an account with that email exists, a password reset link has been sent. Please check your email.",
        [
          {
            text: "OK",
            onPress: onSuccess,
          },
        ]
      );
    } catch (error: any) {
      const errorMessage =
        error.message || "Failed to send reset link. Please try again.";
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
              Reset Password
            </Text>
            <Text
              variant="bodyLarge"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Enter your email address and we'll send you a link to reset your
              password
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
              disabled={loading}
              style={styles.input}
              left={<TextInput.Icon icon="email" />}
            />

            <Button
              mode="contained"
              onPress={handleSubmit}
              disabled={loading}
              loading={loading}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              Send Reset Link
            </Button>

            {onEnterToken && (
              <Button
                mode="text"
                onPress={onEnterToken}
                disabled={loading}
                style={styles.enterTokenButton}
              >
                Already have a reset token? Enter it here
              </Button>
            )}

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
  button: {
    marginTop: 8,
    marginBottom: 16,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  enterTokenButton: {
    marginTop: 8,
  },
  backButton: {
    marginTop: 8,
  },
});
