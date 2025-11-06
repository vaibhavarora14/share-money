export interface Transaction {
  id: number;
  amount: number;
  description: string;
  date: string;
  type: 'income' | 'expense';
  category?: string;
  created_at?: string;
}

export interface AmountInfo {
  text: string;
  color: string;
}

