import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useProfile } from "../hooks/useProfile";
import { useAuth } from "../contexts/AuthContext";
import { showErrorAlert } from "../utils/errorHandling";

interface ProfileSetupScreenProps {
  onComplete: () => void;
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  onComplete,
}) => {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { updateProfile } = useProfile();
  const { signOut } = useAuth();

  const handleComplete = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }

    setLoading(true);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        profile_completed: true,
      });
      onComplete();
    } catch (error) {
      showErrorAlert(error, signOut, "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
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
          <View style={styles.header}>
            <Text variant="headlineMedium" style={styles.title}>
              Welcome to ShareMoney!
            </Text>
            <Text
              variant="bodyLarge"
              style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Let's set up your profile to get started.
            </Text>
          </View>

          <TextInput
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            mode="outlined"
            disabled={loading}
            style={styles.input}
            left={<TextInput.Icon icon="account" />}
            placeholder="Enter your full name"
            autoCapitalize="words"
          />

          <TextInput
            label="Phone Number (Optional)"
            value={phone}
            onChangeText={setPhone}
            mode="outlined"
            disabled={loading}
            style={styles.input}
            left={<TextInput.Icon icon="phone" />}
            placeholder="Enter your phone number"
            keyboardType="phone-pad"
          />

          <Button
            mode="contained"
            onPress={handleComplete}
            disabled={loading || !fullName.trim()}
            loading={loading}
            style={styles.button}
          >
            Complete Setup
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 32,
  },
  header: {
    marginBottom: 32,
    alignItems: "center",
  },
  title: {
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
});

