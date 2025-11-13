export const queryKeys = {
  groups: ["groups"] as const,
  group: (groupId: string | null) => ["group", groupId] as const,
  transactions: () => ["transactions"] as const,
  transactionsByGroup: (groupId: string) => ["transactions", "group", groupId] as const,
  invitationsByGroup: (groupId: string) => ["group-invitations", groupId] as const,
  balances: (groupId?: string) => groupId ? ["balances", "group", groupId] as const : ["balances"] as const,
} as const;
