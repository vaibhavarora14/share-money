/**
 * Constants for Activity Feed functionality
 */

export const ACTIVITY_FEED_CONFIG = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
} as const;

export const ACTIVITY_COLORS = {
  CREATED: '#4CAF50',
  UPDATED: '#FF9800',
  DELETED: '#F44336',
  SETTLEMENT_CREATED: '#2196F3',
  SETTLEMENT_UPDATED: '#9C27B0',
  DEFAULT: '#757575',
} as const;

export const ACTIVITY_ICONS = {
  TRANSACTION: 'receipt',
  SETTLEMENT: 'handshake',
  EMPTY_STATE: 'clipboard-text-outline',
} as const;
