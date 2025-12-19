export interface TransactionSplit {
  id: string;
  transaction_id: number;
  user_id: string;
  amount: number; // Individual split amount (for equal splits: transaction.amount / split_count)
  created_at?: string;
  email?: string; // Populated from API join with users
  full_name?: string | null; // Populated from API join with profiles
  avatar_url?: string | null; // Populated from API join with profiles
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
  status?: 'active' | 'left';
  joined_at: string;
  left_at?: string | null;
  email?: string;
  full_name?: string | null;
  avatar_url?: string | null;
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

export type CurrencyCode = 'USD' | 'INR' | 'EUR' | 'GBP' | 'JPY' | 'KRW' | 'CNY' | 'AUD' | 'CAD';

export interface Balance {
  user_id: string;
  email?: string; // Enriched by API
  full_name?: string | null; // Enriched by API
  avatar_url?: string | null; // Enriched by API
  amount: number;
  currency: string; // Keeping as string for flexibility, but could be CurrencyCode
} // Positive = they owe you, Negative = you owe them

export interface GroupBalance {
  group_id: string;
  group_name: string;
  balances: Balance[];
}

export interface BalancesResponse {
  group_balances: GroupBalance[];
  overall_balances: Balance[];
}

export interface Settlement {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  notes?: string;
  created_by: string;
  created_at: string;
  from_user_email?: string;
  to_user_email?: string;
}

export interface SettlementsResponse {
  settlements: Settlement[];
}

export interface ActivityItem {
  id: string;
  type: 'transaction_created' | 'transaction_updated' | 'transaction_deleted' | 'settlement_created' | 'settlement_updated' | 'settlement_deleted';
  transaction_id?: number;
  settlement_id?: string;
  group_id: string;
  changed_by: {
    id: string;
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
  };
  changed_at: string;
  description: string;
  details: {
    action: 'created' | 'updated' | 'deleted';
    changes?: {
      [field: string]: {
        old: any;
        new: any;
      };
    };
    transaction?: Transaction;
    settlement?: Settlement;
  };
}

export interface ActivityFeedResponse {
  activities: ActivityItem[];
  total: number;
  has_more: boolean;
}

