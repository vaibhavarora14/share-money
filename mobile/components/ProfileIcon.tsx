import React, { useState } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { Avatar, Menu, useTheme } from "react-native-paper";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";

interface ProfileIconProps {
  onLogout: () => void;
}

export const ProfileIcon: React.FC<ProfileIconProps> = ({ onLogout }) => {
  const [menuVisible, setMenuVisible] = useState(false);
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

  const getDisplayName = () => {
    if (profile?.full_name) {
      return profile.full_name;
    }
    if (user?.email) {
      return user.email;
    }
    return "User";
  };

  return (
    <Menu
      visible={menuVisible}
      onDismiss={() => setMenuVisible(false)}
      anchor={
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Avatar.Text
            size={24}
            label={getInitials()}
            style={[
              styles.avatar,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          />
        </TouchableOpacity>
      }
      contentStyle={[
        styles.menuContent,
        { backgroundColor: theme.colors.surface },
      ]}
    >
      <Menu.Item
        title={getDisplayName()}
        titleStyle={styles.menuTitle}
        disabled
      />
      <Menu.Item
        leadingIcon="logout"
        onPress={() => {
          setMenuVisible(false);
          onLogout();
        }}
        title="Logout"
        titleStyle={{ color: theme.colors.error }}
      />
    </Menu>
  );
};

const styles = StyleSheet.create({
  avatar: {
    // Avatar styling handled by component
  },
  menuContent: {
    minWidth: 200,
  },
  menuTitle: {
    fontWeight: "bold",
  },
});

