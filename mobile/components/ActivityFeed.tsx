import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";
import { ActivityIndicator, Card, Text, useTheme } from "react-native-paper";
import { ACTIVITY_FEED_UI, ACTIVITY_ICONS } from "../constants/activityFeed";
import { useAuth } from "../contexts/AuthContext";
import { ActivityItem } from "../types";
import {
    formatActivityTime,
    getActivityColor,
    getUserDisplayName,
    groupActivitiesByDate,
} from "../utils/activityDescriptions";
import { styles } from "./ActivityFeed.styles";

interface ActivityFeedProps {
  items: ActivityItem[];
  loading: boolean;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  items,
  loading,
}) => {
  const theme = useTheme();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  // Error boundary - catch any rendering errors
  try {
    if (loading) {
      return (
        <View style={styles.section}>
          <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
        </View>
      );
    }

    if (items.length === 0) {
      return (
        <View style={styles.section}>
          <Card style={styles.emptyStateCard} mode="outlined">
            <Card.Content style={styles.emptyStateContent}>
              <MaterialCommunityIcons
                name={ACTIVITY_ICONS.EMPTY_STATE}
                size={ACTIVITY_FEED_UI.EMPTY_STATE_ICON_SIZE}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                variant="titleMedium"
                style={[
                  styles.emptyStateTitle,
                  { color: theme.colors.onSurface },
                ]}
              >
                No Activity Yet
              </Text>
              <Text
                variant="bodyMedium"
                style={[
                  styles.emptyStateMessage,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Activity feed will show all transaction changes made in this
                group.
              </Text>
            </Card.Content>
          </Card>
        </View>
      );
    }

    // Group activities by date
    const groupedActivities = groupActivitiesByDate(items);
    const dateKeys = Object.keys(groupedActivities);

    return (
      <View style={styles.section}>
        {dateKeys.map((dateKey, dateIndex) => {
          const activitiesForDate = groupedActivities[dateKey];
          return (
            <React.Fragment key={dateKey}>
              {dateIndex > 0 && <View style={{ height: 16 }} />}
              <View style={styles.dateHeaderContainer}>
                <Text
                  variant="labelMedium"
                  style={[
                    styles.dateHeaderText,
                    { color: theme.colors.primary },
                  ]}
                >
                  {dateKey}
                </Text>
                <View
                  style={[
                    styles.dateHeaderLine,
                    { backgroundColor: theme.colors.outlineVariant },
                  ]}
                />
              </View>
              {activitiesForDate.map((activity, activityIndex) => {
                const userDisplayName = getUserDisplayName(
                  activity.changed_by.id,
                  activity.changed_by.email,
                  currentUserId,
                  activity.changed_by.full_name
                );
                const activityColor = getActivityColor(activity.type);

                // Get icon based on activity category (transaction vs settlement)
                // Action is indicated by color (green=created, orange=updated, red=deleted)
                const getActivityIcon = (
                  type: ActivityItem["type"]
                ): keyof typeof MaterialCommunityIcons.glyphMap => {
                  if (type.startsWith("settlement"))
                    return ACTIVITY_ICONS.SETTLEMENT;
                  return ACTIVITY_ICONS.TRANSACTION;
                };

                const activityIcon = getActivityIcon(activity.type);
                
                // Use Tonal colors for backgrounds:
                // Green -> SecondaryContainer-ish (but custom hex), Red -> ErrorContainer
                // For simplicity/consistency with Transactions, let's use a standard Tonal styling.
                // We'll use the specific activityColor for the ICON, and a generic Surface Variant for background if needed, 
                // OR just transparent with generic Tonal Icon background.
                
                // Let's use the exact same Tonal Icon style as TransactionsSection:
                // Background: SecondaryContainer (or calculated from activityColor with opacity)
                // Icon: activityColor (or OnSecondaryContainer)
                
                return (
                  <View key={activity.id} style={styles.activityItem}>
                      {/* Left: Tonal Icon */}
                      <View
                        style={[
                          styles.iconContainer,
                          {
                            backgroundColor: activityColor + "20", // 12% opacity roughly, similar to Tonal
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={activityIcon}
                          size={20} // Slightly smaller than generic 24
                          color={activityColor}
                        />
                      </View>

                      {/* Right: Content */}
                      <View style={styles.activityContent}>
                         <View style={styles.activityHeader}>
                            <Text variant="bodyLarge" style={[styles.activityUser, { color: theme.colors.onSurface }]}>
                                {userDisplayName}
                            </Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                {formatActivityTime(activity.changed_at)}
                            </Text>
                         </View>
                         
                         <Text 
                            variant="bodyMedium" 
                            style={[styles.activityDescription, { color: theme.colors.onSurfaceVariant }]}
                         >
                             {activity.description}
                         </Text>
                      </View>
                  </View>
                );
              })}
            </React.Fragment>
          );
        })}
      </View>
    );
  } catch (error) {
    // Error boundary - log and show user-friendly message
    console.error("Error rendering ActivityFeed:", error);
    return (
      <View style={styles.section}>
        <Card style={styles.emptyStateCard} mode="outlined">
          <Card.Content style={styles.emptyStateContent}>
            <Text
              variant="titleMedium"
              style={[styles.emptyStateTitle, { color: theme.colors.error }]}
            >
              Error Loading Activity
            </Text>
            <Text
              variant="bodyMedium"
              style={[
                styles.emptyStateMessage,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              There was an error loading the activity feed. Please try again.
            </Text>
          </Card.Content>
        </Card>
      </View>
    );
  }
};
