import React from "react";
import { StyleSheet, View } from "react-native";
import { Appbar, Text, useTheme } from "react-native-paper";

interface NotificationBellProps {
  unreadCount: number;
  onPress: () => void;
}

export function NotificationBell({ unreadCount, onPress }: NotificationBellProps) {
  const theme = useTheme();
  const label = unreadCount > 0
    ? `Notifications, ${unreadCount > 99 ? "99 plus" : unreadCount} unread`
    : "Notifications";

  return (
    <View style={styles.container}>
      <Appbar.Action
        icon="bell-outline"
        onPress={onPress}
        accessibilityLabel={label}
        testID="notification-bell"
        style={styles.action}
      />
      {unreadCount > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.badge, { backgroundColor: theme.colors.primary }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="notification-badge"
        >
          <Text style={[styles.badgeText, { color: theme.colors.onPrimary }]}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 44,
    height: 44,
  },
  container: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 1,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
  },
});
