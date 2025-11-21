/**
 * Constants for Activity Feed UI
 */

export const ACTIVITY_FEED_UI = {
  ICON_OPACITY: '20', // 12.5% opacity in hex
  DEFAULT_LIMIT: 50,
  MAX_DESCRIPTION_LINES: 3,
  EMPTY_STATE_ICON_SIZE: 48,
  ACTIVITY_ICON_SIZE: 24,
} as const;

export const ACTIVITY_ICONS = {
  TRANSACTION: 'receipt',
  SETTLEMENT: 'handshake',
  EMPTY_STATE: 'clipboard-text-outline',
} as const;

export const ACTIVITY_COLORS = {
  CREATED: '#4CAF50',
  UPDATED: '#FF9800',
  DELETED: '#F44336',
  SETTLEMENT_CREATED: '#2196F3',
  SETTLEMENT_UPDATED: '#9C27B0',
  DEFAULT: '#757575',
} as const;
