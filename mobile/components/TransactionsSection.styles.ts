import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  sectionSurface: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  sectionTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitle: {
    fontWeight: "600",
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  sectionContent: {
    paddingBottom: 8,
  },
  transactionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  transactionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  transactionLeft: {
    flex: 1,
    marginRight: 16,
  },
  transactionDescription: {
    fontWeight: "600",
    marginBottom: 4,
  },
  transactionRight: {
    alignItems: "flex-end",
  },
  transactionAmount: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  emptyStateContent: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateMessage: {
    textAlign: "center",
    lineHeight: 20,
  },
});

