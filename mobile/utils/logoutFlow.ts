import { isAuthSessionMissingError } from "./authErrors";
import type { PushTokenCleanupResult } from "./pushTokenCleanup";

export type LogoutFailureStage = "push-cleanup" | "local-sign-out";

export type LocalLogoutResult = {
  cleanupResult?: PushTokenCleanupResult;
  failureStages: LogoutFailureStage[];
};

export type LocalLogoutDependencies = {
  cleanupPushToken: () => Promise<PushTokenCleanupResult>;
  signOut: (options: {
    scope: "local";
  }) => Promise<{ error: unknown | null }>;
  clearAuthState: () => void;
};

export async function performLocalLogout(
  dependencies: LocalLogoutDependencies,
): Promise<LocalLogoutResult> {
  const failureStages: LogoutFailureStage[] = [];
  let cleanupResult: PushTokenCleanupResult | undefined;

  try {
    cleanupResult = await dependencies.cleanupPushToken();
  } catch {
    failureStages.push("push-cleanup");
  }

  try {
    const { error } = await dependencies.signOut({ scope: "local" });
    if (error && !isAuthSessionMissingError(error)) {
      failureStages.push("local-sign-out");
    }
  } catch (error) {
    if (!isAuthSessionMissingError(error)) {
      failureStages.push("local-sign-out");
    }
  } finally {
    dependencies.clearAuthState();
  }

  return { cleanupResult, failureStages };
}
