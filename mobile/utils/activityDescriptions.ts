import { ActivityItem } from '../types';
import { formatCurrency } from './currency';

/**
 * Gets a display name for a user (email or "You")
 */
export function getUserDisplayName(
  userId: string,
  email: string,
  currentUserId?: string
): string {
  if (currentUserId && userId === currentUserId) {
    return 'You';
  }
  // Return email username part (before @)
  return email.split('@')[0] || email;
}

/**
 * Formats a value for display based on field type
 */
function formatValue(field: string, value: any): string {
  if (value === null || value === undefined) {
    return 'none';
  }
  
  if (field === 'amount') {
    return formatCurrency(value);
  }
  
  if (field === 'date') {
    return new Date(value).toLocaleDateString();
  }
  
  if (Array.isArray(value)) {
    return `${value.length} item(s)`;
  }
  
  return String(value);
}

/**
 * Generates a more detailed description for an activity item
 * (Backend already provides basic description, this adds context)
 */
export function getActivityDescription(
  activity: ActivityItem,
  currentUserId?: string
): string {
  // Use the description from backend, but we can enhance it here if needed
  return activity.description;
}

/**
 * Gets a color for the activity type (for UI)
 */
export function getActivityColor(type: ActivityItem['type']): string {
  switch (type) {
    case 'transaction_created':
      return '#4CAF50'; // Green
    case 'transaction_updated':
    case 'transaction_splits_updated':
      return '#FF9800'; // Orange
    case 'transaction_deleted':
      return '#F44336'; // Red
    default:
      return '#757575'; // Gray
  }
}

/**
 * Formats the timestamp for display
 */
export function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Groups activities by date for display
 */
export function groupActivitiesByDate(activities: ActivityItem[]): {
  [key: string]: ActivityItem[];
} {
  const groups: { [key: string]: ActivityItem[] } = {};
  
  activities.forEach(activity => {
    const date = new Date(activity.changed_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const activityDate = new Date(date);
    activityDate.setHours(0, 0, 0, 0);
    
    let key: string;
    const diffDays = Math.floor((today.getTime() - activityDate.getTime()) / 86400000);
    
    if (diffDays === 0) {
      key = 'Today';
    } else if (diffDays === 1) {
      key = 'Yesterday';
    } else if (diffDays < 7) {
      key = `${diffDays} days ago`;
    } else {
      key = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(activity);
  });
  
  return groups;
}
