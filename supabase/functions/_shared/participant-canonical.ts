/**
 * When a user joins after being invited, a stale `invited` participant row can remain
 * alongside their `member` row (same email). Splits and balances key by participant_id,
 * so we map invited IDs to the canonical member/former row for that email.
 */

export interface ParticipantForCanonical {
  id: string;
  user_id: string | null;
  email: string | null;
  type: string;
}

function normEmail(e: string): string {
  return e.toLowerCase().trim();
}

function emailForParticipant(
  p: ParticipantForCanonical,
  userIdToEmail: Map<string, string>
): string | null {
  if (p.email) return normEmail(p.email);
  if (p.user_id) {
    const e = userIdToEmail.get(p.user_id);
    return e ? normEmail(e) : null;
  }
  return null;
}

function rankForType(type: string): number {
  if (type === 'member') return 2;
  if (type === 'former') return 1;
  return 0;
}

/**
 * Returns a function participantId -> canonical participant id (same or merged target).
 */
export function buildParticipantCanonicalResolver(
  participants: ParticipantForCanonical[],
  userIdToEmail: Map<string, string>
): (participantId: string) => string {
  const emailBest = new Map<string, { id: string; rank: number }>();

  for (const p of participants) {
    const em = emailForParticipant(p, userIdToEmail);
    if (!em) continue;
    const rank = rankForType(p.type);
    const cur = emailBest.get(em);
    if (!cur || rank > cur.rank) {
      emailBest.set(em, { id: p.id, rank });
    }
  }

  const remap = new Map<string, string>();
  for (const p of participants) {
    const em = emailForParticipant(p, userIdToEmail);
    if (!em) continue;
    const best = emailBest.get(em);
    if (best && best.id !== p.id) {
      remap.set(p.id, best.id);
    }
  }

  return (participantId: string) => remap.get(participantId) ?? participantId;
}

/**
 * Drop invited participants that are redundant with a member/former row for the same email.
 */
export function filterRedundantInvitedParticipants<T extends ParticipantForCanonical>(
  participants: T[],
  userIdToEmail: Map<string, string>
): T[] {
  const canonical = buildParticipantCanonicalResolver(participants, userIdToEmail);
  return participants.filter((p) => {
    if (p.type !== 'invited') return true;
    return canonical(p.id) === p.id;
  });
}
