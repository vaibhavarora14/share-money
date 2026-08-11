export type SignupMethod = "email" | "google" | "apple";

export type PendingSignup = {
  method: SignupMethod;
  startedAt: string;
};

const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CREATION_SKEW_MS = 10 * 60 * 1000;

export function matchesNewUser(
  pending: PendingSignup,
  userCreatedAt: string | undefined,
  now = Date.now(),
): boolean {
  const startedAt = Date.parse(pending.startedAt);
  const createdAt = userCreatedAt ? Date.parse(userCreatedAt) : Number.NaN;
  return Number.isFinite(startedAt) && Number.isFinite(createdAt) &&
    now >= startedAt && now - startedAt <= MAX_PENDING_AGE_MS &&
    Math.abs(createdAt - startedAt) <= MAX_CREATION_SKEW_MS;
}
