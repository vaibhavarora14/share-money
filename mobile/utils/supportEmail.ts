export const SUPPORT_EMAIL = "varora1406@gmail.com";

export const SUPPORT_TOPICS = [
  {
    id: "account-access",
    label: "Account access",
    description: "Sign-in, email, or profile issues",
    icon: "account-key-outline",
  },
  {
    id: "groups-balances",
    label: "Groups & balances",
    description: "Group membership, totals, or settlement questions",
    icon: "account-group-outline",
  },
  {
    id: "transactions",
    label: "Transactions",
    description: "Expenses, edits, or payment records",
    icon: "receipt-text-outline",
  },
  {
    id: "something-else",
    label: "Something else",
    description: "Anything not covered above",
    icon: "message-text-outline",
  },
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export function buildSupportEmailUrl(
  topic: SupportTopic,
  registeredEmail?: string,
) {
  const subject = encodeURIComponent(`SharedMoney support — ${topic.label}`);
  const body = encodeURIComponent(
    `Hi SharedMoney Support,\n\nI need help with: ${topic.label}\n\nRegistered email: ${
      registeredEmail || "Not available"
    }\n\nDescribe your issue:\n`,
  );

  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}
