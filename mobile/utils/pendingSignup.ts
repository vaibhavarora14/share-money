import AsyncStorage from "@react-native-async-storage/async-storage";
import { matchesNewUser, type PendingSignup, type SignupMethod } from "./pendingSignupCore";

export type { SignupMethod } from "./pendingSignupCore";

const PENDING_SIGNUP_KEY = "pending_signup_v1";
export async function markSignupStarted(method: SignupMethod): Promise<void> {
  await AsyncStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({
    method,
    startedAt: new Date().toISOString(),
  } satisfies PendingSignup));
}

export async function clearPendingSignup(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_SIGNUP_KEY);
}

export async function consumeCompletedSignup(
  userCreatedAt: string | undefined,
): Promise<SignupMethod | null> {
  const raw = await AsyncStorage.getItem(PENDING_SIGNUP_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(PENDING_SIGNUP_KEY);

  try {
    const pending = JSON.parse(raw) as PendingSignup;
    if (!["email", "google", "apple"].includes(pending.method)) return null;
    return matchesNewUser(pending, userCreatedAt) ? pending.method : null;
  } catch {
    return null;
  }
}
