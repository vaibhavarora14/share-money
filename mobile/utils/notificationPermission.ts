import type { NotificationPreference } from "../types/notifications";

interface NotificationPrimerEligibility {
  platform: string;
  activeGroupCount: number;
  preference: NotificationPreference | undefined;
}

export function shouldShowNotificationPrimer({
  platform,
  activeGroupCount,
  preference,
}: NotificationPrimerEligibility): boolean {
  return (
    (platform === "ios" || platform === "android") &&
    activeGroupCount > 0 &&
    preference?.permission_status === "not_requested" &&
    !preference.nudge_dismissed_at
  );
}
