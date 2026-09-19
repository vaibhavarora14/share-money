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
  onSettlementsPress: () => void;
  onLogoutPress: () => void;
  onProfilePress: () => void;
  currentRoute: string;
  settlementsCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  onGroupsPress,
  onSettlementsPress,
  onLogoutPress,
  onProfilePress,
  currentRoute,
  settlementsCount = 0,
}) => {
  const theme = useTheme();
  const isGroupsActive = currentRoute === "groups";
  const isSettlementsActive = currentRoute === "settlements";
  const isProfileActive = currentRoute === "profile";

  const renderItem = (
    label: string,
    icon: string,
    activeIcon: string,
    isActive: boolean,
    onPress: () => void,
    options?: { testID?: string; badge?: number; isLogout?: boolean }
  ) => {
    const isLogout = options?.isLogout === true;
    const iconColor = isLogout
      ? theme.colors.error
      : isActive
        ? theme.colors.onPrimaryContainer
        : theme.colors.onSurfaceVariant;

    const labelColor = isLogout
      ? theme.colors.error
      : isActive
        ? theme.colors.onPrimaryContainer
        : theme.colors.onSurfaceVariant;

    return (
      <TouchableRipple
        testID={options?.testID}
        onPress={onPress}
        style={styles.tab}
        borderless
        rippleColor={
          isLogout
            ? theme.colors.errorContainer
            : theme.colors.primaryContainer
        }
      >
        <View style={styles.tabContent}>
          <View
            style={[
              styles.iconContainer,
              isActive &&
                !isLogout && {
                  backgroundColor: theme.colors.primaryContainer,
                },
            ]}
          >
            <Icon
              source={isActive ? activeIcon : icon}
              size={24}
              color={iconColor}
            />
            {options?.badge && options.badge > 0 ? (
              <View
                testID={`${options.testID || "tab"}-badge`}
                style={[styles.badge, { backgroundColor: theme.colors.error }]}
              >
                <Text style={[styles.badgeText, { color: theme.colors.onError }]}>
                  {options.badge > 9 ? "9+" : String(options.badge)}
                </Text>
              </View>
            ) : null}
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
        {renderItem(
          "Settle",
          "hand-coin-outline",
          "hand-coin",
          isSettlementsActive,
          onSettlementsPress,
          { testID: "settlements-tab", badge: settlementsCount }
        )}
        <TouchableRipple
          testID="profile-tab"
          onPress={onProfilePress}
          style={styles.tab}
          borderless
          rippleColor={theme.colors.primaryContainer}
        >
          <View style={styles.tabContent}>
            <View
              style={[
                styles.iconContainer,
                isProfileActive && {
                  backgroundColor: theme.colors.primaryContainer,
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
                    ? theme.colors.onPrimaryContainer
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
    minHeight: 80,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabContent: {
    paddingVertical: 14,
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
  badge: {
    position: "absolute",
    top: -2,
    right: 8,
    minWidth: 16,
    minHeight: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
});
