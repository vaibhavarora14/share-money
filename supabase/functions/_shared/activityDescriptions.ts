/**
 * Activity description generation functions
 */

import { formatCurrency } from './currency.ts';

interface TransactionSnapshot {
  id: number;
  amount: number;
  description: string;
  date: string;
  type: string;
  category?: string;
  currency: string;
  user_id: string;
  group_id: string;
  paid_by: string;
  split_among?: string[];
  created_at: string;
  updated_at?: string;
}

interface SettlementSnapshot {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

interface ChangesDiff {
  [field: string]: {
    old: unknown;
    new: unknown;
  };
}

interface HistoryChanges {
  action: 'created' | 'updated' | 'deleted';
  diff?: ChangesDiff;
  transaction?: TransactionSnapshot;
  settlement?: SettlementSnapshot;
  transaction_id?: number;
  settlement_id?: string;
}

interface HistorySnapshot {
  transaction?: TransactionSnapshot;
  settlement?: SettlementSnapshot;
}

function normalizeCurrency(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim().toUpperCase();
  }
  return undefined;
}

function resolveCurrencyCode(
  snapshot?: TransactionSnapshot | SettlementSnapshot,
  diff?: ChangesDiff,
  fallback: string = 'USD'
): string {
  const diffCurrency = diff?.currency as { old?: unknown; new?: unknown } | undefined;
  const newCurrency = normalizeCurrency(diffCurrency?.new);
  if (newCurrency) {
    return newCurrency;
  }

  const snapshotCurrency = normalizeCurrency(snapshot?.currency);
  if (snapshotCurrency) {
    return snapshotCurrency;
  }

  const oldCurrency = normalizeCurrency(diffCurrency?.old);
  if (oldCurrency) {
    return oldCurrency;
  }

  return fallback;
}

interface TransactionHistory {
  id: string;
  transaction_id: number | null;
  settlement_id: string | null;
  activity_type: 'transaction' | 'settlement';
  group_id: string;
  action: 'created' | 'updated' | 'deleted';
  changed_by: string;
  changed_at: string;
  changes: HistoryChanges;
  snapshot: HistorySnapshot | null;
}

export function formatFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    'amount': 'Amount',
    'description': 'Description',
    'date': 'Date',
    'category': 'Category',
    'type': 'Type',
    'paid_by': 'Paid by',
    'split_among': 'Splits',
    'currency': 'Currency',
    'notes': 'Notes',
    'from_user_id': 'From',
    'to_user_id': 'To',
  };
  return fieldMap[field] || field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
}

export function formatValue(field: string, value: unknown, currencyCode?: string): string {
  if (value === null || value === undefined) {
    return 'none';
  }
  
  if (field === 'amount') {
    if (typeof value === 'number') {
      return formatCurrency(value, currencyCode || 'USD');
    }
    if (typeof value === 'string') {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return formatCurrency(num, currencyCode || 'USD');
      }
    }
    return String(value);
  }
  
  if (field === 'date') {
    try {
      if (typeof value === 'string' || value instanceof Date) {
        return new Date(value).toLocaleDateString();
      }
    } catch {
      // Fall through
    }
  }
  
  if (field === 'split_among' && Array.isArray(value)) {
    return `${value.length} person${value.length !== 1 ? 's' : ''}`;
  }
  
  if (field === 'paid_by' && typeof value === 'string') {
    return 'User';
  }
  
  if (Array.isArray(value)) {
    return `${value.length} item${value.length !== 1 ? 's' : ''}`;
  }
  
  const str = String(value);
  if (str.length > 25) {
    return str.substring(0, 25) + '...';
  }
  
  return str;
}

function formatSplitChanges(
  oldSplits: string[],
  newSplits: string[],
  emailMap?: Map<string, string>
): string {
  const oldSet = new Set(oldSplits);
  const newSet = new Set(newSplits);
  
  const addedUsers = newSplits.filter((id: string) => !oldSet.has(id));
  const removedUsers = oldSplits.filter((id: string) => !newSet.has(id));
  
  if (addedUsers.length === 0 && removedUsers.length === 0) {
    return 'changed splits';
  }
  
  const changes: string[] = [];
  
  if (addedUsers.length > 0) {
    const userNames = addedUsers.map((userId: string) => {
      if (emailMap) {
        const email = emailMap.get(userId);
        if (email) {
          return email.split('@')[0];
        }
      }
      return userId.substring(0, 8) + '...';
    });
    
    if (addedUsers.length === 1) {
      changes.push(`added ${userNames[0]} to splits`);
    } else {
      changes.push(`added ${userNames.join(', ')} to splits`);
    }
  }
  
  if (removedUsers.length > 0) {
    const userNames = removedUsers.map((userId: string) => {
      if (emailMap) {
        const email = emailMap.get(userId);
        if (email) {
          return email.split('@')[0];
        }
      }
      return userId.substring(0, 8) + '...';
    });
    
    if (removedUsers.length === 1) {
      changes.push(`removed ${userNames[0]} from splits`);
    } else {
      changes.push(`removed ${userNames.join(', ')} from splits`);
    }
  }
  
  return changes.join(', ');
}

function getUserName(userId: string, emailMap?: Map<string, string>): string {
  if (emailMap) {
    const email = emailMap.get(userId);
    if (email) {
      return email.split('@')[0];
    }
  }
  return 'User';
}

function generateTransactionCreatedDescription(transaction: TransactionSnapshot): string {
  const amount = transaction.amount || 0;
  const currency = transaction.currency || 'USD';
  const description = transaction.description || 'transaction';
  const descriptionGlimpse = description.length > 30 
    ? description.substring(0, 30) + '...' 
    : description;
  return `${formatCurrency(amount, currency)} - ${descriptionGlimpse}`;
}

function generateTransactionUpdatedDescription(
  transaction: TransactionSnapshot | undefined,
  diff: ChangesDiff,
  emailMap?: Map<string, string>
): string {
  const userVisibleFields = Object.keys(diff).filter(field => 
    !['updated_at', 'created_at', 'id'].includes(field)
  );
  
  if (userVisibleFields.length === 0) {
    return 'Updated transaction';
  }

  const currency = resolveCurrencyCode(transaction, diff);
  const descriptionGlimpse = transaction?.description 
    ? (transaction.description.length > 25 
        ? transaction.description.substring(0, 25) + '...' 
        : transaction.description)
    : null;

  const fieldChanges: string[] = [];
  
  userVisibleFields.forEach(field => {
    const { old: oldVal, new: newVal } = diff[field];
    const fieldDisplayName = formatFieldName(field);
    
    if (field === 'split_among') {
      const oldSplits = Array.isArray(oldVal) ? oldVal : [];
      const newSplits = Array.isArray(newVal) ? newVal : [];
      fieldChanges.push(formatSplitChanges(oldSplits, newSplits, emailMap));
    } else {
      const currencyCode = field === 'amount' ? currency : undefined;
      fieldChanges.push(`${fieldDisplayName}: ${formatValue(field, oldVal, currencyCode)} → ${formatValue(field, newVal, currencyCode)}`);
    }
  });

  if (descriptionGlimpse) {
    return `${descriptionGlimpse} - ${fieldChanges.join(', ')}`;
  } else {
    return fieldChanges.join(', ');
  }
}

function generateTransactionDeletedDescription(transaction: TransactionSnapshot): string {
  const amount = transaction.amount || 0;
  const currency = transaction.currency || 'USD';
  const description = transaction.description || 'transaction';
  const descriptionGlimpse = description.length > 30 
    ? description.substring(0, 30) + '...' 
    : description;
  return `Deleted: ${formatCurrency(amount, currency)} - ${descriptionGlimpse}`;
}

function generateSettlementCreatedDescription(
  settlement: SettlementSnapshot,
  emailMap?: Map<string, string>
): string {
  const amount = settlement.amount || 0;
  const currency = settlement.currency || 'USD';
  const fromUserId = settlement.from_user_id;
  const toUserId = settlement.to_user_id;
  const notes = settlement.notes;
  
  const fromName = getUserName(fromUserId, emailMap);
  const toName = getUserName(toUserId, emailMap);
  
  let description = `${fromName} paid ${toName} ${formatCurrency(amount, currency)}`;
  if (notes) {
    const notesGlimpse = notes.length > 20 ? notes.substring(0, 20) + '...' : notes;
    description += ` - ${notesGlimpse}`;
  }
  return description;
}

function generateSettlementUpdatedDescription(
  settlement: SettlementSnapshot | undefined,
  diff: ChangesDiff,
  emailMap?: Map<string, string>
): string {
  const userVisibleFields = Object.keys(diff).filter(field => 
    !['created_at', 'id'].includes(field)
  );
  
  if (userVisibleFields.length === 0) {
    return 'Updated settlement';
  }
  
  const amount = settlement?.amount || 0;
  const currency = resolveCurrencyCode(settlement, diff);
  const fromUserId = settlement?.from_user_id;
  const toUserId = settlement?.to_user_id;
  
  const fromName = getUserName(fromUserId || '', emailMap);
  const toName = getUserName(toUserId || '', emailMap);
  
  const fieldChanges: string[] = [];
  userVisibleFields.forEach(field => {
    const { old: oldVal, new: newVal } = diff[field];
    const fieldDisplayName = formatFieldName(field);
    
    if (field === 'amount') {
      fieldChanges.push(`Amount: ${formatValue(field, oldVal, currency)} → ${formatValue(field, newVal, currency)}`);
    } else if (field === 'notes') {
      const oldNotes = oldVal || 'none';
      const newNotes = newVal || 'none';
      fieldChanges.push(`Notes: ${oldNotes} → ${newNotes}`);
    } else {
      fieldChanges.push(`${fieldDisplayName}: ${formatValue(field, oldVal)} → ${formatValue(field, newVal)}`);
    }
  });
  
  return `${fromName} paid ${toName} ${formatCurrency(amount, currency)} - ${fieldChanges.join(', ')}`;
}

function generateSettlementDeletedDescription(
  settlement: SettlementSnapshot,
  emailMap?: Map<string, string>
): string {
  const amount = settlement.amount || 0;
  const currency = settlement.currency || 'USD';
  const fromUserId = settlement.from_user_id;
  const toUserId = settlement.to_user_id;
  
  const fromName = getUserName(fromUserId, emailMap);
  const toName = getUserName(toUserId, emailMap);
  
  return `Deleted settlement: ${fromName} paid ${toName} ${formatCurrency(amount, currency)}`;
}

function extractTransactionFromSnapshot(
  snapshot: HistorySnapshot | null,
  changes: HistoryChanges | undefined,
  activityType: 'transaction' | 'settlement'
): TransactionSnapshot | SettlementSnapshot | undefined {
  if (!snapshot) {
    return changes?.transaction || changes?.settlement;
  }

  // Check if snapshot has nested structure
  if (activityType === 'settlement') {
    if ((snapshot as any).settlement) {
      return (snapshot as any).settlement;
    }
    // Check if snapshot itself is a settlement (flat structure)
    if ('from_user_id' in snapshot && 'to_user_id' in snapshot) {
      return snapshot as unknown as SettlementSnapshot;
    }
  } else {
    if ((snapshot as any).transaction) {
      return (snapshot as any).transaction;
    }
    // Check if snapshot itself is a transaction (flat structure)
    if ('amount' in snapshot && 'currency' in snapshot && 'group_id' in snapshot) {
      return snapshot as unknown as TransactionSnapshot;
    }
  }

  return changes?.transaction || changes?.settlement;
}

export function generateActivityDescription(
  history: TransactionHistory,
  emailMap?: Map<string, string>
): string {
  const action = history.action;
  const changes = history.changes;
  const snapshot = history.snapshot;
  const activityType = history.activity_type || 'transaction';
  
  switch (action) {
    case 'created': {
      if (activityType === 'settlement') {
        const settlement = extractTransactionFromSnapshot(snapshot, changes, 'settlement') as SettlementSnapshot | undefined;
        if (settlement) {
          return generateSettlementCreatedDescription(settlement, emailMap);
        }
        return 'Created settlement';
      } else {
        const transaction = extractTransactionFromSnapshot(snapshot, changes, 'transaction') as TransactionSnapshot | undefined;
        if (transaction) {
          return generateTransactionCreatedDescription(transaction);
        }
        return 'Added transaction';
      }
    }

    case 'updated': {
      if (activityType === 'settlement') {
        const diff = changes?.diff || {};
        const settlement = extractTransactionFromSnapshot(snapshot, changes, 'settlement') as SettlementSnapshot | undefined;
        return generateSettlementUpdatedDescription(settlement, diff, emailMap);
      } else {
        const diff = changes?.diff || {};
        const transaction = extractTransactionFromSnapshot(snapshot, changes, 'transaction') as TransactionSnapshot | undefined;
        return generateTransactionUpdatedDescription(transaction, diff, emailMap);
      }
    }

    case 'deleted': {
      if (activityType === 'settlement') {
        const settlement = extractTransactionFromSnapshot(snapshot, changes, 'settlement') as SettlementSnapshot | undefined;
        if (settlement) {
          return generateSettlementDeletedDescription(settlement, emailMap);
        }
        return 'Deleted settlement';
      } else {
        const transaction = extractTransactionFromSnapshot(snapshot, changes, 'transaction') as TransactionSnapshot | undefined;
        if (transaction) {
          return generateTransactionDeletedDescription(transaction);
        }
        return 'Deleted transaction';
      }
    }

    default:
      return 'Transaction activity';
  }
}
