import { assertEquals } from "jsr:@std/assert@1";
import {
  OPEN_EXTERNAL_URL_ERROR,
  openExternalUrl,
} from "./openExternalUrl.ts";

Deno.test("prefers in-app browser and skips Linking when browser succeeds", async () => {
  const calls: string[] = [];
  const alerts: Array<[string, string]> = [];

  const result = await openExternalUrl(
    "https://sharedmoney.app/terms",
    {
      openBrowserAsync: async (url) => {
        calls.push(`browser:${url}`);
      },
      openURL: async (url) => {
        calls.push(`linking:${url}`);
      },
      alert: (title, message) => alerts.push([title, message]),
      logFailure: () => {
        calls.push("log");
      },
    },
    { showUserError: true },
  );

  assertEquals(result, { ok: true, method: "browser" });
  assertEquals(calls, ["browser:https://sharedmoney.app/terms"]);
  assertEquals(alerts, []);
});

Deno.test("falls back to Linking when in-app browser fails", async () => {
  const calls: string[] = [];

  const result = await openExternalUrl("https://sharedmoney.app/privacy", {
    openBrowserAsync: async () => {
      throw new Error("Unable to open URL: https://sharedmoney.app/privacy");
    },
    openURL: async (url) => {
      calls.push(`linking:${url}`);
    },
    alert: () => {
      calls.push("alert");
    },
    logFailure: () => {
      calls.push("log");
    },
  });

  assertEquals(result, { ok: true, method: "linking" });
  assertEquals(calls, ["log", "linking:https://sharedmoney.app/privacy"]);
});

Deno.test("surfaces a user-visible error when both open strategies fail", async () => {
  const alerts: Array<[string, string]> = [];

  const result = await openExternalUrl("https://sharedmoney.app/terms", {
    openBrowserAsync: async () => {
      throw new Error("browser failed");
    },
    openURL: async () => {
      throw new Error("Unable to open URL: https://sharedmoney.app/terms");
    },
    alert: (title, message) => alerts.push([title, message]),
    logFailure: () => {},
  });

  assertEquals(result, { ok: false, error: OPEN_EXTERNAL_URL_ERROR });
  assertEquals(alerts, [["Couldn't open link", OPEN_EXTERNAL_URL_ERROR]]);
});

Deno.test("can suppress the alert while still returning failure", async () => {
  const alerts: Array<[string, string]> = [];

  const result = await openExternalUrl(
    "https://sharedmoney.app/terms",
    {
      openBrowserAsync: async () => {
        throw new Error("browser failed");
      },
      openURL: async () => {
        throw new Error("linking failed");
      },
      alert: (title, message) => alerts.push([title, message]),
      logFailure: () => {},
    },
    { showUserError: false },
  );

  assertEquals(result.ok, false);
  assertEquals(alerts, []);
});
