import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Appbar,
  Avatar,
  Button,
  Icon,
  Surface,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CountryCodePicker } from "../components/CountryCodePicker";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";
import {
  CountryCode,
  formatPhoneNumber,
  getCountryByCode,
  getDefaultCountry,
  parsePhoneNumber,
} from "../utils/countryCodes";
import { showErrorAlert } from "../utils/errorHandling";

interface ProfileSetupScreenProps {
  onComplete: () => void;
  onBack?: () => void;
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  onComplete,
  onBack,
}) => {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(""); // Phone number without country code
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(
    getDefaultCountry()
  );
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: profile, updateProfile } = useProfile();
  const { signOut } = useAuth();

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      const phoneValue = profile.phone || "";

      // Parse existing phone number to extract country code
      if (phoneValue) {
        const parsed = parsePhoneNumber(phoneValue);

        // If multiple countries share the same dial code (e.g., +1 for US and Canada),
        // use the country_code from the database if available
        if (parsed.possibleCountries.length > 1) {
          if (profile.country_code) {
            const savedCountry = parsed.possibleCountries.find(
              (c) => c.code === profile.country_code?.toUpperCase()
            );
            if (savedCountry) {
              setSelectedCountry(savedCountry);
            } else {
              // If saved country not in possible countries, use first one
              setSelectedCountry(parsed.possibleCountries[0]);
            }
          } else {
            // No country_code in DB, use first in list
            setSelectedCountry(parsed.possibleCountries[0]);
          }
        } else {
          // Only one country with this dial code, or use country_code from DB if available
          if (profile.country_code) {
            const country =
              parsed.possibleCountries.find(
                (c) => c.code === profile.country_code?.toUpperCase()
              ) || parsed.possibleCountries[0];
            setSelectedCountry(country);
          } else {
            setSelectedCountry(parsed.possibleCountries[0]);
          }
        }

        setPhoneNumber(parsed.number);
        setPhone(phoneValue);
      } else {
        // If no phone but country_code exists, use it
        if (profile.country_code) {
          const country = getCountryByCode(profile.country_code.toUpperCase());
          if (country) {
            setSelectedCountry(country);
          } else {
            setSelectedCountry(getDefaultCountry());
          }
        } else {
          setSelectedCountry(getDefaultCountry());
        }
        setPhoneNumber("");
        setPhone("");
      }
    }
  }, [profile]);

  // Update phone when phoneNumber or selectedCountry changes
  useEffect(() => {
    if (phoneNumber.trim()) {
      const formattedPhone = formatPhoneNumber(
        selectedCountry.dialCode,
        phoneNumber
      );
      setPhone(formattedPhone);
    } else {
      setPhone("");
    }
  }, [phoneNumber, selectedCountry]);

  // Check if there are any changes from the original profile
  const hasChanges = useMemo(() => {
    if (!profile) return false;
    const originalFullName = (profile.full_name || "").trim();
    const originalPhone = (profile.phone || "").trim();
    const originalCountryCode = (profile.country_code || "").toUpperCase();
    const currentFullName = fullName.trim();
    const currentPhone = phone.trim();
    const currentCountryCode = selectedCountry.code.toUpperCase();

    return (
      originalFullName !== currentFullName ||
      originalPhone !== currentPhone ||
      originalCountryCode !== currentCountryCode
    );
  }, [profile, fullName, phone, selectedCountry]);

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
        country_code: selectedCountry.code,
        profile_completed: true,
      });
      onComplete();
    } catch (error) {
      showErrorAlert(error, signOut, "Error");
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => {
    if (fullName.trim()) {
      const names = fullName.trim().split(" ");
      if (names.length >= 2) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
      }
      return fullName.trim()[0].toUpperCase();
    }
    return "?";
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
        { paddingTop: 0 }, // Appbar handles top padding
        { paddingBottom: insets.bottom },
      ]}
    >
      <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
        {onBack ? (
          <>
            <Appbar.BackAction onPress={onBack} />
            <Appbar.Content
              title="Edit Profile"
              titleStyle={{ fontWeight: "bold" }}
            />
          </>
        ) : (
          <Appbar.Content title="Profile" titleStyle={{ fontWeight: "bold" }} />
        )}
        <Appbar.Action
          icon="logout"
          iconColor={theme.colors.error}
          onPress={() => {
            Alert.alert(
              "Logout",
              "Are you sure you want to logout?",
              [
                {
                  text: "Cancel",
                  style: "cancel",
                },
                {
                  text: "Logout",
                  style: "destructive",
                  onPress: signOut,
                },
              ],
              { cancelable: true }
            );
          }}
        />
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
          <View style={styles.header}>
            <View
              style={[
                styles.avatarContainer,
                { backgroundColor: theme.colors.secondaryContainer },
              ]}
            >
              <Avatar.Text
                size={80}
                label={getInitials()}
                style={{ backgroundColor: theme.colors.primary }}
              />
            </View>
            <Text
              variant="headlineSmall"
              style={[styles.title, { color: theme.colors.onSurface }]}
            >
              {fullName || "Your Profile"}
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Update your personal details
            </Text>
          </View>

          <Surface
            style={[styles.formCard, { backgroundColor: theme.colors.surface }]}
            elevation={2}
          >
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

            <View style={styles.phoneInputWrapper}>
              <TouchableOpacity
                onPress={() => setShowCountryPicker(true)}
                disabled={loading}
                activeOpacity={0.7}
                style={[
                  styles.countryCodeSelector,
                  {
                    borderRightColor: theme.colors.outline,
                    backgroundColor: theme.colors.surfaceVariant,
                    borderColor: theme.colors.outline,
                  },
                ]}
              >
                <Text style={styles.flag}>{selectedCountry.flag}</Text>
                <Text
                  variant="bodySmall"
                  style={[
                    styles.dialCodeText,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  {selectedCountry.dialCode}
                </Text>
                <Icon
                  source="chevron-down"
                  size={18}
                  style={styles.chevronIcon}
                />
              </TouchableOpacity>
              <TextInput
                label="Phone Number (Optional)"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                mode="outlined"
                disabled={loading}
                style={[styles.input, styles.phoneInput]}
                placeholder="Enter your phone number"
                keyboardType="phone-pad"
                contentStyle={styles.phoneInputContent}
              />
            </View>

            <Button
              mode="contained"
              onPress={handleComplete}
              disabled={loading || !fullName.trim() || !hasChanges}
              loading={loading}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              Save Changes
            </Button>
          </Surface>
        </ScrollView>
      </KeyboardAvoidingView>

      <CountryCodePicker
        visible={showCountryPicker}
        onDismiss={() => setShowCountryPicker(false)}
        onSelect={setSelectedCountry}
        selectedCountry={selectedCountry}
      />
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
    padding: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 16,
  },
  avatarContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
  },
  formCard: {
    borderRadius: 16,
    padding: 16,
    paddingVertical: 24,
  },
  input: {
    marginBottom: 16,
    backgroundColor: "transparent",
  },
  phoneInputWrapper: {
    flexDirection: "row",
    marginBottom: 16,
    alignItems: "flex-start",
    position: "relative",
  },
  countryCodeSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 0,
    borderRightWidth: 1,
    borderTopLeftRadius: 16, // Match theme roundness
    borderBottomLeftRadius: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    minWidth: 100,
    height: 56, // Match TextInput height
    marginTop: 8, // Account for label
    gap: 6,
  },
  flag: {
    fontSize: 20,
  },
  dialCodeText: {
    fontWeight: "600",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  chevronIcon: {
    margin: 0,
    opacity: 0.6,
  },
  phoneInput: {
    flex: 1,
    marginBottom: 0,
    marginLeft: -1, // Overlap border to connect with country selector
  },
  phoneInputContent: {
    paddingLeft: 12,
    paddingRight: 12,
  },
  button: {
    marginTop: 8,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 6,
  },
});
