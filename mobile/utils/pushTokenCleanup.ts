export type PushTokenCleanupStatus =
  | "no-token"
  | "server-unregistered"
  | "local-only";

export type PushTokenCleanupFailureStage =
  | "storage-read"
  | "server"
  | "native"
  | "storage-clear";

export type PushTokenCleanupResult = {
  status: PushTokenCleanupStatus;
  failureStages: PushTokenCleanupFailureStage[];
};

export type PushTokenCleanupDependencies = {
  getStoredToken: () => Promise<string | null>;
  unregisterServer: (token: string) => Promise<void>;
  unregisterNative: () => Promise<void>;
  clearStoredToken: () => Promise<void>;
};

export async function cleanupPushRegistration(
  dependencies: PushTokenCleanupDependencies,
): Promise<PushTokenCleanupResult> {
  const failureStages: PushTokenCleanupFailureStage[] = [];
  let token: string | null = null;

  try {
    token = await dependencies.getStoredToken();
  } catch {
    failureStages.push("storage-read");
  }

  let status: PushTokenCleanupStatus = token ? "local-only" : "no-token";
  if (token) {
    try {
      await dependencies.unregisterServer(token);
      status = "server-unregistered";
    } catch {
      failureStages.push("server");
    }
  } else if (failureStages.includes("storage-read")) {
    status = "local-only";
  }

  try {
    await dependencies.unregisterNative();
  } catch {
    failureStages.push("native");
  }

  try {
    await dependencies.clearStoredToken();
  } catch {
    failureStages.push("storage-clear");
  }

  return { status, failureStages };
}
