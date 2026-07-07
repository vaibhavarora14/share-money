import React from "react";
import { StyleSheet, View } from "react-native";
import {
  Icon,
  Surface,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProfileIcon } from "./ProfileIcon";

interface BottomNavBarProps {
  onGroupsPress: () => void;
  onProfilePress: () => void;
  currentRoute: string;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  onGroupsPress,
  onProfilePress,
  currentRoute,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isGroupsActive = currentRoute === "groups";
  const isProfileActive = currentRoute === "profile";

  const renderItem = (
    label: string,
    isActive: boolean,
    onPress: () => void,
    renderIcon: (color: string) => React.ReactNode
  ) => {
    const color = isActive
      ? theme.colors.onSecondaryContainer
      : theme.colors.onSurfaceVariant;

    return (
      <TouchableRipple
        onPress={onPress}
        style={styles.tab}
        borderless
        rippleColor={theme.colors.secondaryContainer}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: isActive }}
      >
        <View style={styles.tabContent}>
          <View
            style={[
              styles.iconContainer,
              isActive && {
                backgroundColor: theme.colors.secondaryContainer,
              },
            ]}
          >
            {renderIcon(color)}
          </View>
          <Text
            variant="labelMedium"
            style={[
              styles.label,
              { color, fontWeight: isActive ? "bold" : "normal" },
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
      style={[
        styles.container,
        // Keep the tabs clear of the home indicator / gesture area
        { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.content}>
        {renderItem("Home", isGroupsActive, onGroupsPress, (color) => (
          <Icon
            source={isGroupsActive ? "home" : "home-outline"}
            size={24}
            color={color}
          />
        ))}
        {renderItem("Profile", isProfileActive, onProfilePress, () => (
          <ProfileIcon />
        ))}
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
