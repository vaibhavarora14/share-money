export const queryKeys = {
  groups: ["groups"] as const,
  group: (groupId: string | null) => ["group", groupId] as const,
  transactions: () => ["transactions"] as const,
  transactionsByGroup: (groupId: string) => ["transactions", "group", groupId] as const,
  invitationsByGroup: (groupId: string) => ["group-invitations", groupId] as const,
} as const;
