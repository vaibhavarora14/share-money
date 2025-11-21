import { formatDistanceToNow, format, parseISO, startOfDay, differenceInDays } from 'date-fns';
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
 * Gets a color for the activity action (for UI)
 * Color represents the action taken, not the entity type
 */
export function getActivityColor(type: ActivityItem['type']): string {
  // Action-based colors: consistent across transactions and settlements
  if (type.endsWith('_created')) {
    return '#4CAF50'; // Green - Something was added
  }
  if (type.endsWith('_updated')) {
    return '#FF9800'; // Orange - Something was changed
  }
  if (type.endsWith('_deleted')) {
    return '#F44336'; // Red - Something was removed
  }
  return '#757575'; // Gray - Fallback
}

/**
 * Formats the timestamp for display with timezone awareness
 * Uses date-fns for consistent timezone handling across platforms
 * @param timestamp - ISO timestamp string from database
 * @returns User-friendly relative or absolute time string
 */
export function formatActivityTime(timestamp: string): string {
  try {
    const date = parseISO(timestamp);
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
      // Format as "Jan 20, 2025 at 3:45 PM" for older dates
      // Using date-fns for consistent formatting across timezones
      return format(date, 'MMM d, yyyy') + ' at ' + format(date, 'h:mm a');
    }
  } catch (error) {
    // Fallback if date parsing fails
    console.error('Error formatting activity time:', error);
    return timestamp;
  }
}

/**
 * Groups activities by date for display
 * Uses date-fns for timezone-aware date calculations
 * @param activities - Array of activity items to group
 * @returns Object mapping date keys to arrays of activities
 */
export function groupActivitiesByDate(activities: ActivityItem[]): {
  [key: string]: ActivityItem[];
} {
  const groups: { [key: string]: ActivityItem[] } = {};
  
  activities.forEach(activity => {
    try {
      const date = parseISO(activity.changed_at);
      const today = startOfDay(new Date());
      const activityDate = startOfDay(date);
      
      let key: string;
      const diffDays = differenceInDays(today, activityDate);
      
      if (diffDays === 0) {
        key = 'Today';
      } else if (diffDays === 1) {
        key = 'Yesterday';
      } else if (diffDays < 7) {
        key = `${diffDays} days ago`;
      } else {
        // Use date-fns for consistent formatting
        key = format(date, 'MMMM d, yyyy');
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(activity);
    } catch (error) {
      // Fallback: use timestamp as key if parsing fails
      console.error('Error grouping activity by date:', error);
      const fallbackKey = 'Recent';
      if (!groups[fallbackKey]) {
        groups[fallbackKey] = [];
      }
      groups[fallbackKey].push(activity);
    }
  });
  
  return groups;
}
