import AsyncStorage from "@react-native-async-storage/async-storage";

function keyFor(userId: string): string {
  return `profile-completion-skip:${userId}`;
}

/** Soft-skip persists so incomplete profiles are not nagged every launch. */
export async function getProfileCompletionSkipped(
  userId: string
): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(keyFor(userId));
    return value === "1";
  } catch {
    return false;
  }
}

export async function setProfileCompletionSkipped(
  userId: string
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), "1");
  } catch {
    // Best-effort: failing to persist still lets the user continue this session.
  }
}

export async function clearProfileCompletionSkipped(
  userId: string
): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // Ignore storage failures when clearing after a successful complete.
  }
}
