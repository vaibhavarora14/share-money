export interface TransactionSplit {
  id: string;
  transaction_id: number;
  user_id: string;
  amount: number; // Individual split amount (for equal splits: transaction.amount / split_count)
  created_at?: string;
  email?: string; // Populated from API join with users
}

export interface Transaction {
  id: number;
  amount: number;
  description: string;
  date: string;
  type: 'income' | 'expense';
  category?: string;
  created_at?: string;
  user_id?: string;
  group_id?: string;
  currency?: string;
  paid_by?: string; // User ID of who paid for the expense
  split_among?: string[]; // Array of user IDs (backward compatibility, prefer splits)
  splits?: TransactionSplit[]; // New: from transaction_splits table (preferred)
}

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export interface AmountInfo {
  text: string;
  color: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  email?: string;
}

export interface GroupInvitation {
  id: string;
  group_id: string;
  email: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  token?: string;
  expires_at: string;
  created_at: string;
  accepted_at?: string;
}

export interface GroupWithMembers extends Group {
  members?: GroupMember[];
  invitations?: GroupInvitation[];
}

export interface Balance {
  user_id: string;
  email?: string;
  amount: number; // Positive = they owe you, Negative = you owe them
}

export interface GroupBalance {
  group_id: string;
  group_name: string;
  balances: Balance[];
}

export interface BalancesResponse {
  group_balances: GroupBalance[];
  overall_balances: Balance[];
}

