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
  split_among?: string[]; // Array of user IDs who the expense is split among
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

