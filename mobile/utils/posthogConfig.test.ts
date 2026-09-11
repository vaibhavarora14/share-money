import { assertEquals } from "jsr:@std/assert@1";
import {
  DEFAULT_POSTHOG_HOST,
  isPostHogConfigured,
  resolvePostHogEnvConfig,
} from "./posthogConfig.ts";

Deno.test("PostHog stays disabled when the project key is unset", () => {
  assertEquals(isPostHogConfigured({}), false);
  assertEquals(
    resolvePostHogEnvConfig({
      EXPO_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    }),
    {
      key: null,
      host: "https://us.i.posthog.com",
      enabled: false,
    },
  );
});

Deno.test("PostHog treats blank keys as unset", () => {
  assertEquals(
    isPostHogConfigured({ EXPO_PUBLIC_POSTHOG_KEY: "   " }),
    false,
  );
});

Deno.test("PostHog enables when a key is present and defaults the host", () => {
  assertEquals(
    resolvePostHogEnvConfig({
      EXPO_PUBLIC_POSTHOG_KEY: " phc_example ",
    }),
    {
      key: "phc_example",
      host: DEFAULT_POSTHOG_HOST,
      enabled: true,
    },
  );
});

Deno.test("PostHog accepts an explicit SharedMoney Production host", () => {
  assertEquals(
    resolvePostHogEnvConfig({
      EXPO_PUBLIC_POSTHOG_KEY: "phc_example",
      EXPO_PUBLIC_POSTHOG_HOST: " https://us.i.posthog.com ",
    }),
    {
      key: "phc_example",
      host: "https://us.i.posthog.com",
      enabled: true,
    },
  );
});
