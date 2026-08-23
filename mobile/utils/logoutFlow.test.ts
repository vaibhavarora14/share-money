import { assertEquals } from "jsr:@std/assert@1";
import { performLocalLogout } from "./logoutFlow.ts";

Deno.test("logout orders cleanup, one local sign-out, then auth-state clearing", async () => {
  const calls: string[] = [];

  const result = await performLocalLogout({
    cleanupPushToken: async () => {
      calls.push("cleanup");
      return { status: "server-unregistered", failureStages: [] };
    },
    signOut: async (options) => {
      calls.push(`sign-out:${options.scope}`);
      return { error: null };
    },
    clearAuthState: () => calls.push("clear-auth"),
  });

  assertEquals(calls, ["cleanup", "sign-out:local", "clear-auth"]);
  assertEquals(result.failureStages, []);
});

Deno.test("cleanup failure still signs out once and clears auth state", async () => {
  const calls: string[] = [];
  const result = await performLocalLogout({
    cleanupPushToken: async () => {
      calls.push("cleanup");
      throw new Error("offline");
    },
    signOut: async () => {
      calls.push("sign-out");
      return { error: null };
    },
    clearAuthState: () => calls.push("clear-auth"),
  });

  assertEquals(calls, ["cleanup", "sign-out", "clear-auth"]);
  assertEquals(result.failureStages, ["push-cleanup"]);
});

Deno.test("thrown local sign-out failure still clears auth state", async () => {
  let cleared = false;
  const result = await performLocalLogout({
    cleanupPushToken: async () => ({
      status: "no-token",
      failureStages: [],
    }),
    signOut: async () => {
      throw new Error("offline");
    },
    clearAuthState: () => {
      cleared = true;
    },
  });

  assertEquals(cleared, true);
  assertEquals(result.failureStages, ["local-sign-out"]);
});

for (const scenario of [
  { name: "valid", error: null },
  { name: "expired", error: null },
  { name: "offline", error: new Error("network unavailable") },
  {
    name: "already missing",
    error: Object.assign(new Error("Auth session missing!"), {
      name: "AuthSessionMissingError",
    }),
  },
] as const) {
  Deno.test(`${scenario.name} session always clears auth state`, async () => {
    let signOutCalls = 0;
    let cleared = false;
    const result = await performLocalLogout({
      cleanupPushToken: async () => ({
        status: "no-token",
        failureStages: [],
      }),
      signOut: async () => {
        signOutCalls += 1;
        return { error: scenario.error };
      },
      clearAuthState: () => {
        cleared = true;
      },
    });

    assertEquals(signOutCalls, 1);
    assertEquals(cleared, true);
    assertEquals(
      result.failureStages,
      scenario.name === "offline" ? ["local-sign-out"] : [],
    );
  });
}
