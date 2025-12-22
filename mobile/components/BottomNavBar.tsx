import React from "react";
import { StyleSheet, View } from "react-native";
import {
  Icon,
  Surface,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { ProfileIcon } from "./ProfileIcon";

interface BottomNavBarProps {
  onGroupsPress: () => void;
  onLogoutPress: () => void;
  onProfilePress: () => void;
  currentRoute: string;

}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  onGroupsPress,
  onLogoutPress,
  onProfilePress,
  currentRoute,
}) => {
  const theme = useTheme();
  const isGroupsActive = currentRoute === "groups";
  const isProfileActive = currentRoute === "profile";

  const renderItem = (
    label: string,
    icon: string,
    activeIcon: string,
    isActive: boolean,
    onPress: () => void,
    isLogout: boolean = false
  ) => {
    const iconColor = isLogout
      ? theme.colors.error
      : isActive
      ? theme.colors.onSecondaryContainer
      : theme.colors.onSurfaceVariant;

    const labelColor = isLogout
      ? theme.colors.error
      : isActive
      ? theme.colors.onSecondaryContainer
      : theme.colors.onSurfaceVariant;

    return (
      <TouchableRipple
        onPress={onPress}
        style={styles.tab}
        borderless
        rippleColor={
          isLogout
            ? theme.colors.errorContainer
            : theme.colors.secondaryContainer
        }
      >
        <View style={styles.tabContent}>
          <View
            style={[
              styles.iconContainer,
              isActive &&
                !isLogout && {
                  backgroundColor: theme.colors.secondaryContainer,
                },
            ]}
          >
            <Icon
              source={isActive ? activeIcon : icon}
              size={24}
              color={iconColor}
            />
          </View>
          <Text
            variant="labelMedium"
            style={[
              styles.label,
              { color: labelColor, fontWeight: isActive ? "bold" : "normal" },
            ]}
          >
            {label}
          </Text>
        </View>
      </TouchableRipple>
    );
  };

  return (
    <Surface
      elevation={2}
      style={[styles.container, { backgroundColor: theme.colors.surface }]}
    >
      <View style={styles.content}>
        {renderItem(
          "Home",
          "home-outline",
          "home",
          isGroupsActive,
          onGroupsPress
        )}
        <TouchableRipple
          onPress={onProfilePress}
          style={styles.tab}
          borderless
          rippleColor={theme.colors.secondaryContainer}
        >
          <View style={styles.tabContent}>
            <View
              style={[
                styles.iconContainer,
                isProfileActive && {
                  backgroundColor: theme.colors.secondaryContainer,
                },
              ]}
            >
              <ProfileIcon />
            </View>
            <Text
              variant="labelMedium"
              style={[
                styles.label,
                {
                  color: isProfileActive
                    ? theme.colors.onSecondaryContainer
                    : theme.colors.onSurfaceVariant,
                  fontWeight: isProfileActive ? "bold" : "normal",
                },
              ]}
            >
              Profile
            </Text>
          </View>
        </TouchableRipple>
      </View>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  content: {
    flexDirection: "row",
    height: 80,
    paddingBottom: 0, 
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  iconContainer: {
    width: 64,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  label: {
    textAlign: "center",
  },
});
