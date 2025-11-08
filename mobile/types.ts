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
  currency?: string;
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
  role: 'owner' | 'member';
  invited_by: string;
  created_at: string;
  accepted_at: string | null;
}

export interface GroupWithMembers extends Group {
  members?: GroupMember[];
  invitations?: GroupInvitation[];
}

