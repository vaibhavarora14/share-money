import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Local "seen groups" tracking for the NEW badge on the groups list.
 *
 * A group the user has never opened shows a NEW tag; opening it marks it
 * seen. On the very first load for a user (no stored state), all current
 * groups are baselined as seen so long-time members don't get a wall of
 * NEW badges.
 */

const keyFor = (userId: string) => `seen_groups_v1:${userId}`;

async function readSet(userId: string): Promise<Set<string> | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (raw === null) return null;
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
}

async function writeSet(userId: string, ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify([...ids]));
  } catch {
    // Best-effort persistence; the badge is cosmetic.
  }
}

/**
 * Returns the set of group ids the user has seen, baselining all current
 * groups as seen when no state exists yet (first run / fresh install).
 */
export async function getSeenGroupIds(
  userId: string,
  currentGroupIds: string[]
): Promise<Set<string>> {
  const existing = await readSet(userId);
  if (existing !== null) return existing;

  const baseline = new Set(currentGroupIds);
  await writeSet(userId, baseline);
  return baseline;
}

/** Marks a group as seen (idempotent). */
export async function markGroupSeen(
  userId: string,
  groupId: string
): Promise<void> {
  const existing = (await readSet(userId)) ?? new Set<string>();
  if (existing.has(groupId)) return;
  existing.add(groupId);
  await writeSet(userId, existing);
}
