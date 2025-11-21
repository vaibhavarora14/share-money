import { StyleSheet } from "react-native";

// 8pt grid spacing system for consistency
const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const styles = StyleSheet.create({
  section: {
    // No top margin needed - parent container handles spacing
  },
  dateHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  dateHeaderText: {
    fontWeight: "700",
    marginRight: SPACING.md,
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 1,
  },
  dateHeaderLine: {
    flex: 1,
    height: 1,
    opacity: 0.3,
  },
  activityCard: {
    marginBottom: SPACING.sm,
    borderRadius: SPACING.md,
    overflow: "hidden",
    // Subtle shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 0,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: SPACING.md,
    justifyContent: "center",
    alignItems: "center",
  },
  activityContent: {
    flex: 1,
    minWidth: 0,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  activityUser: {
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: -0.2,
  },
  activityTime: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  activityDescription: {
    marginBottom: SPACING.sm,
    lineHeight: 22,
    fontSize: 14,
    paddingRight: SPACING.sm,
  },
  emptyStateCard: {
    marginTop: SPACING.lg,
  },
  emptyStateContent: {
    alignItems: "center",
    paddingVertical: SPACING.xxl,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: SPACING.lg,
  },
  emptyStateTitle: {
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  emptyStateMessage: {
    textAlign: "center",
    paddingHorizontal: SPACING.lg,
  },
});
