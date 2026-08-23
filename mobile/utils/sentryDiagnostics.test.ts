import { assertEquals } from "jsr:@std/assert@1";
import {
  getSentryRuntimeTags,
  isSentryDiagnosticUrl,
} from "./sentryDiagnostics.ts";

Deno.test("diagnostic URL is accepted only when the compile-time gate is enabled", () => {
  assertEquals(
    isSentryDiagnosticUrl("sharedmoney://diagnostics/sentry", true),
    true,
  );
  assertEquals(
    isSentryDiagnosticUrl("sharedmoney://diagnostics/sentry", false),
    false,
  );
});

Deno.test("diagnostic matching rejects unrelated and parameterized URLs", () => {
  assertEquals(isSentryDiagnosticUrl("sharedmoney://join/abc", true), false);
  assertEquals(
    isSentryDiagnosticUrl("sharedmoney://diagnostics/sentry?token=secret", true),
    false,
  );
  assertEquals(isSentryDiagnosticUrl(null, true), false);
});

Deno.test("runtime tags distinguish physical devices from simulators", () => {
  assertEquals(
    getSentryRuntimeTags({
      isDevice: true,
      buildProfile: "verification",
      release: "2.20.1",
      buildNumber: "78",
      platform: "ios",
    }),
    {
      device_type: "physical",
      build_profile: "verification",
      release: "2.20.1",
      build_number: "78",
      platform: "ios",
    },
  );

  assertEquals(
    getSentryRuntimeTags({
      isDevice: false,
      buildProfile: undefined,
      release: undefined,
      buildNumber: undefined,
      platform: "android",
    }),
    {
      device_type: "simulator",
      build_profile: "development",
      release: "unknown",
      build_number: "unknown",
      platform: "android",
    },
  );
});
