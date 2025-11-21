import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  dateHeader: {
    marginBottom: 12,
    marginTop: 8,
    fontWeight: "600",
  },
  activityCard: {
    marginBottom: 0,
  },
  activityContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  activityLeft: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  activityIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  activityUser: {
    fontWeight: "600",
    marginRight: 8,
  },
  activityDescription: {
    marginBottom: 6,
    lineHeight: 20,
  },
  activityTime: {
    marginTop: 4,
    fontSize: 12,
  },
  emptyStateCard: {
    marginTop: 16,
  },
  emptyStateContent: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateMessage: {
    textAlign: "center",
    paddingHorizontal: 16,
  },
});
