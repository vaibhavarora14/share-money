import React from "react";
import { StyleSheet, View } from "react-native";
import { IconButton, Surface, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

interface BottomNavBarProps {
  onGroupsPress: () => void;
  onLogoutPress: () => void;
  currentRoute: string;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  onGroupsPress,
  onLogoutPress,
  currentRoute,
}) => {
  const theme = useTheme();
  const isGroupsActive = currentRoute === "groups";

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.surface }]}
    >
      <Surface
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.outlineVariant,
          },
        ]}
        elevation={4}
      >
        <View style={styles.navContent}>
          <View style={styles.navItem}>
            <IconButton
              icon={isGroupsActive ? "account-group" : "account-group-outline"}
              size={24}
              iconColor={isGroupsActive ? theme.colors.primary : theme.colors.onSurfaceVariant}
              onPress={onGroupsPress}
            />
            <Text
              variant="labelSmall"
              style={[
                styles.navLabel,
                {
                  color: isGroupsActive
                    ? theme.colors.primary
                    : theme.colors.onSurfaceVariant,
                },
              ]}
            >
              Groups
            </Text>
          </View>

          <View style={styles.navItem}>
            <IconButton
              icon="logout"
              size={24}
              iconColor={theme.colors.error}
              onPress={onLogoutPress}
            />
            <Text
              variant="labelSmall"
              style={[styles.navLabel, { color: theme.colors.error }]}
            >
              Logout
            </Text>
          </View>
        </View>
      </Surface>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {},
  bar: {
    borderTopWidth: 1,
  },
  navContent: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 4,
  },
  navItem: {
    alignItems: "center",
    flex: 1,
  },
  navLabel: {
    marginTop: -8,
    marginBottom: 4,
  },
});
