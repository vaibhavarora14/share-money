import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { Avatar, useTheme } from "react-native-paper";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";

interface ProfileIconProps {
  onProfilePress: () => void;
}

export const ProfileIcon: React.FC<ProfileIconProps> = ({ onProfilePress }) => {
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
    <TouchableOpacity onPress={onProfilePress}>
      <Avatar.Text
        size={24}
        label={getInitials()}
        style={[
          styles.avatar,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  avatar: {
    // Avatar styling handled by component
  },
});
