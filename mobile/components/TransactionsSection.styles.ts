import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: 12,
  },
  transactionCard: {
    marginBottom: 0,
    borderRadius: 12,
    elevation: 0,
    borderWidth: 0,
    backgroundColor: '#f2eded',
  },
  transactionContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  transactionDescription: {
    fontWeight: "700",
    marginBottom: 8,
    fontSize: 14,
    textTransform: "capitalize",
  },
  amountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  transactionLeft: {
    flex: 1,
  },
  splitAmountContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  transactionMeta: {
    fontSize: 12,
    fontWeight: "400",
    marginRight: 8
  },
  splitCount: {
    fontSize: 12,
    fontWeight: "400",
  },
  transactionAmount: {
    fontWeight: "400",
    fontSize: 13,
  },
  transactionRight: {
    alignItems: "flex-end",
  },
  emptyStateCard: {
    marginTop: 8,
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

