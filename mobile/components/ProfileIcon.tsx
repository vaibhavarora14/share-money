import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar, useTheme } from "react-native-paper";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";

interface ProfileIconProps {
  // Removed onProfilePress - parent component handles touch events
  // Removed onProfilePress - parent component handles touch events
}

export const ProfileIcon: React.FC<ProfileIconProps> = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const getInitials = () => {
    if (profile?.full_name) {
      const names = profile.full_name.trim().split(" ");
      if (names.length >= 2) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
      }
      return profile.full_name[0].toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "?";
  };

  return (
    <View style={styles.container}>
      <Avatar.Text
        size={24}
        label={getInitials()}
        style={[
          styles.avatar,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      />

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  avatar: {
    // Avatar styling handled by component
  },

});
