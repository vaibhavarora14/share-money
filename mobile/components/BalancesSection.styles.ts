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
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  balanceGroup: {
    marginTop: 8,
  },
  balanceGroupTitle: {
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  balanceContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  balanceLeft: {
    flex: 1,
    marginRight: 16,
  },
  balanceName: {
    fontWeight: "600",
  },
  balanceRight: {
    alignItems: "flex-end",
  },
  balanceAmount: {
    fontWeight: "bold",
  },
  groupBalanceTitle: {
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyStateContent: {
    alignItems: "center",
    paddingVertical: 16,
  },
});
