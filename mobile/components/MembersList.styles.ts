import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  memberCardRemoving: {
    opacity: 0.7,
  },
  memberContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    marginBottom: 2,
  },
  removeMemberButton: {
    margin: 0,
  },
  removingIndicator: {
    marginHorizontal: 8,
  },
});
