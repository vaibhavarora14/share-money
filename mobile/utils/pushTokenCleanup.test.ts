import { assertEquals } from "jsr:@std/assert@1";
import { cleanupPushRegistration } from "./pushTokenCleanup.ts";

function dependencies(options: {
  token?: string | null;
  serverError?: Error;
  nativeError?: Error;
}) {
  const calls: string[] = [];
  return {
    calls,
    dependencies: {
      getStoredToken: async () => {
        calls.push("read-token");
        return options.token ?? null;
      },
      unregisterServer: async (_token: string) => {
        calls.push("server-delete");
        if (options.serverError) throw options.serverError;
      },
      unregisterNative: async () => {
        calls.push("native-revoke");
        if (options.nativeError) throw options.nativeError;
      },
      clearStoredToken: async () => {
        calls.push("clear-token");
      },
    },
  };
}

Deno.test("push cleanup on 200 deletes server token before local cleanup", async () => {
  const fixture = dependencies({ token: "ExponentPushToken[test]" });
  const result = await cleanupPushRegistration(fixture.dependencies);

  assertEquals(result.status, "server-unregistered");
  assertEquals(result.failureStages, []);
  assertEquals(fixture.calls, [
    "read-token",
    "server-delete",
    "native-revoke",
    "clear-token",
  ]);
});

for (const scenario of ["401", "network"] as const) {
  Deno.test(`push cleanup on ${scenario} still revokes native and local tokens`, async () => {
    const fixture = dependencies({
      token: "ExponentPushToken[test]",
      serverError: new Error(scenario),
    });
    const result = await cleanupPushRegistration(fixture.dependencies);

    assertEquals(result.status, "local-only");
    assertEquals(result.failureStages, ["server"]);
    assertEquals(fixture.calls, [
      "read-token",
      "server-delete",
      "native-revoke",
      "clear-token",
    ]);
  });
}

Deno.test("missing token skips server deletion but still revokes native registration", async () => {
  const fixture = dependencies({ token: null });
  const result = await cleanupPushRegistration(fixture.dependencies);

  assertEquals(result.status, "no-token");
  assertEquals(fixture.calls, ["read-token", "native-revoke", "clear-token"]);
});

Deno.test("local token clear still runs when native revocation fails", async () => {
  const fixture = dependencies({
    token: "ExponentPushToken[test]",
    nativeError: new Error("native unavailable"),
  });
  const result = await cleanupPushRegistration(fixture.dependencies);

  assertEquals(result.failureStages, ["native"]);
  assertEquals(fixture.calls.at(-1), "clear-token");
});
