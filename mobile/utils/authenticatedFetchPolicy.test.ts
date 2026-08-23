import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { handleUnauthorizedResponse } from "./authenticatedFetchPolicy.ts";

Deno.test("default unauthorized policy signs out locally before throwing", async () => {
  const calls: string[] = [];

  await assertRejects(
    () =>
      handleUnauthorizedResponse(undefined, async (options) => {
        calls.push(`sign-out:${options.scope}`);
        return { error: null };
      }),
    Error,
    "Unauthorized",
  );

  assertEquals(calls, ["sign-out:local"]);
});

Deno.test("throw unauthorized policy never signs out", async () => {
  let signOutCalls = 0;

  await assertRejects(
    () =>
      handleUnauthorizedResponse("throw", async () => {
        signOutCalls += 1;
        return { error: null };
      }),
    Error,
    "Unauthorized",
  );

  assertEquals(signOutCalls, 0);
});

Deno.test("missing local session is idempotent for default unauthorized policy", async () => {
  await assertRejects(
    () =>
      handleUnauthorizedResponse("sign-out-local", async () => ({
        error: Object.assign(new Error("Auth session missing!"), {
          name: "AuthSessionMissingError",
        }),
      })),
    Error,
    "Unauthorized",
  );
});
