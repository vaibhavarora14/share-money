// Centralized TanStack Query keys; keep in sync with server resources.
export const queryKeys = {
  groups: ["groups"] as const,
  group: (groupId: string) => ["group", groupId] as const,
  profile: (userId: string | null) => ["profile", userId] as const,
  userProfiles: (userIds: string[]) => ["userProfiles", ...userIds.sort()] as const,
  transactions: (groupId: string) => ["transactions", groupId] as const,
  transactionsFeed: (groupId: string) => ["transactions", groupId, "feed"] as const,
  lastGroupTransactionCurrency: (groupId: string) =>
    ["transactions", groupId, "latest-currency"] as const,
  groupStats: (groupId: string) => ["groupStats", groupId] as const,
  balances: (groupId: string) => ["balances", groupId] as const,
  activity: (groupId: string) => ["activity", groupId] as const,
  invitations: (groupId: string) => ["invitations", groupId] as const,
  settlements: (groupId: string) => ["settlements", groupId] as const,
  participants: (groupId: string) => ["participants", groupId] as const,
  notificationRoot: ["notifications"] as const,
  notifications: (userId: string | null) => ["notifications", "inbox", userId] as const,
  notification: (userId: string | null, notificationId: string) =>
    ["notifications", "detail", userId, notificationId] as const,
};
