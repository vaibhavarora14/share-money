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
  TRANSACTION: 'receipt-text-outline',
  SETTLEMENT: 'handshake-outline',
  EMPTY_STATE: 'clipboard-text-outline',
} as const;

export const ACTIVITY_COLORS = {
  CREATED: '#009688', // Teal 500
  UPDATED: '#F57C00', // Orange 700
  DELETED: '#D32F2F', // Red 700
  SETTLEMENT_CREATED: '#1976D2', // Blue 700
  SETTLEMENT_UPDATED: '#7B1FA2', // Purple 700
  DEFAULT: '#757575',
} as const;
