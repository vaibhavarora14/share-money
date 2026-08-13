import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    alignSelf: "center",
    flexGrow: 1,
    justifyContent: "center",
    maxWidth: 480,
    paddingHorizontal: 24,
    paddingVertical: 32,
    width: "100%",
  },
  heading: {
    alignItems: "center",
  },
  iconContainer: {
    alignItems: "center",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginBottom: 20,
    width: 56,
  },
  title: {
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    lineHeight: 24,
    marginTop: 10,
    textAlign: "center",
  },
  rulesCard: {
    borderRadius: 12,
    gap: 12,
    marginTop: 28,
    padding: 20,
  },
  rulesTitle: {
    fontWeight: "700",
    marginBottom: 2,
  },
  rule: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  ruleText: {
    flex: 1,
    lineHeight: 20,
  },
  agreement: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 20,
    minHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  agreementText: {
    flex: 1,
    lineHeight: 20,
    paddingRight: 8,
  },
  pressed: {
    opacity: 0.75,
  },
  links: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
    marginTop: 4,
  },
  error: {
    marginBottom: 12,
    textAlign: "center",
  },
  continueButtonContent: {
    minHeight: 48,
  },
  signOutButton: {
    marginTop: 8,
  },
});
