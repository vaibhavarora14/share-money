import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  memberCard: {
    marginBottom: 0,
  },
  memberCardRemoving: {
    opacity: 0.7,
  },
  memberContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  memberLeft: {
    flex: 1,
    marginRight: 8,
  },
  memberRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  memberName: {
    fontWeight: "600",
    marginBottom: 4,
  },
  roleChip: {
    height: 28,
  },
  removeMemberButton: {
    margin: 0,
  },
  removingIndicator: {
    marginHorizontal: 8,
  },
});
