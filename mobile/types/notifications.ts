export type NotificationEventType =
  | "transaction_created"
  | "transaction_updated"
  | "transaction_deleted";

export interface NotificationPosition {
  participantId: string;
  currency: string;
  isPayer: boolean;
  shareMinor: number;
  paidMinor: number;
  netMinor: number;
  payerParticipantId: string | null;
}

export interface TransactionNotificationSnapshot {
  version: number;
  action: "created" | "updated" | "deleted";
  actor: { id: string; name: string; avatar_url: string | null };
  group: { id: string; name: string };
  transaction: {
    id: number;
    description: string;
    type: "expense";
    amount: number;
    currency: string;
    deleted: boolean;
  };
  impact: {
    before: NotificationPosition | null;
    after: NotificationPosition | null;
    before_share: number | null;
    after_share: number | null;
    share_delta: number | null;
  };
}

export interface TransactionNotification {
  id: string;
  recipient_user_id: string;
  actor_user_id: string | null;
  group_id: string | null;
  transaction_id: number | null;
  transaction_reference_id?: number;
  source_history_id: string;
  event_type: NotificationEventType;
  title: string;
  body: string;
  snapshot: TransactionNotificationSnapshot;
  read_at: string | null;
  created_at: string;
  superseded_at?: string | null;
  superseded_by_id?: string | null;
}

export interface NotificationPreference {
  push_enabled: boolean;
  permission_status: "not_requested" | "granted" | "denied" | "unavailable";
  permission_prompted_at: string | null;
  nudge_dismissed_at: string | null;
}

export interface NotificationCursor {
  created_at: string;
  id: string;
}

export interface NotificationsResponse {
  feature_enabled?: boolean;
  items: TransactionNotification[];
  unread_count: number;
  unread_by_group: Record<string, number>;
  has_more: boolean;
  next_cursor: NotificationCursor | null;
  preference: NotificationPreference;
  is_offline_cache?: boolean;
}
