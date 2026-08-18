export type NotificationAction = "created" | "updated" | "deleted";

export interface ExpenseParticipantSnapshot {
  participantId: string;
  userId: string | null;
  share: number;
}

export interface ExpenseSnapshot {
  id: number;
  groupId: string;
  groupName: string;
  description: string;
  type: "expense" | "income";
  amount: number;
  currency: string;
  payerParticipantId: string | null;
  participants: ExpenseParticipantSnapshot[];
}

export interface FinancialPosition {
  participantId: string;
  currency: string;
  isPayer: boolean;
  shareMinor: number;
  paidMinor: number;
  netMinor: number;
  payerParticipantId: string | null;
}

export interface NotificationImpact {
  userId: string;
  before: FinancialPosition | null;
  after: FinancialPosition | null;
}

interface BuildNotificationImpactsInput {
  actorUserId: string;
  action: NotificationAction;
  before: ExpenseSnapshot | null;
  after: ExpenseSnapshot | null;
}

function toMinorUnits(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

function buildPositions(
  snapshot: ExpenseSnapshot | null,
): Map<string, FinancialPosition> {
  const positions = new Map<string, FinancialPosition>();
  if (!snapshot || snapshot.type !== "expense") return positions;

  for (const participant of snapshot.participants) {
    if (!participant.userId) continue;
    const isPayer = participant.participantId === snapshot.payerParticipantId;
    const shareMinor = toMinorUnits(participant.share);
    const paidMinor = isPayer ? toMinorUnits(snapshot.amount) : 0;
    positions.set(participant.userId, {
      participantId: participant.participantId,
      currency: snapshot.currency,
      isPayer,
      shareMinor,
      paidMinor,
      netMinor: paidMinor - shareMinor,
      payerParticipantId: snapshot.payerParticipantId,
    });
  }

  return positions;
}

function positionsDiffer(
  before: FinancialPosition | null,
  after: FinancialPosition | null,
): boolean {
  if (!before || !after) return before !== after;
  return before.participantId !== after.participantId ||
    before.currency !== after.currency ||
    before.isPayer !== after.isPayer ||
    before.shareMinor !== after.shareMinor ||
    before.paidMinor !== after.paidMinor ||
    before.netMinor !== after.netMinor ||
    before.payerParticipantId !== after.payerParticipantId;
}

export function buildNotificationImpacts({
  actorUserId,
  action,
  before,
  after,
}: BuildNotificationImpactsInput): NotificationImpact[] {
  if (action === "created" && after?.type !== "expense") return [];
  if (action === "deleted" && before?.type !== "expense") return [];
  if (
    action === "updated" &&
    (before?.type !== "expense" || after?.type !== "expense")
  ) {
    return [];
  }

  const beforePositions = buildPositions(before);
  const afterPositions = buildPositions(after);
  const userIds = new Set([...beforePositions.keys(), ...afterPositions.keys()]);

  return [...userIds]
    .filter((userId) => userId !== actorUserId)
    .sort()
    .map((userId) => ({
      userId,
      before: beforePositions.get(userId) ?? null,
      after: afterPositions.get(userId) ?? null,
    }))
    .filter(({ before: oldPosition, after: newPosition }) =>
      action !== "updated" || positionsDiffer(oldPosition, newPosition)
    );
}
