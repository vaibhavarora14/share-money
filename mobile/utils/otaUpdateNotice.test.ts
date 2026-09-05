import { otaUpdateMessage, otaUpdateNotice } from "./otaUpdateNotice.ts";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message ?? "values differ"}\nexpected: ${JSON.stringify(expected)}\nactual: ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("hides OTA status on web and when updates are disabled", () => {
  assertEquals(
    otaUpdateNotice({
      platform: "web",
      isDownloading: true,
      isUpdatePending: true,
    }),
    { kind: "hidden" },
  );
  assertEquals(
    otaUpdateNotice({
      isEnabled: false,
      isDownloading: true,
      isUpdatePending: false,
    }),
    { kind: "hidden" },
  );
});

Deno.test("does not show a banner while only checking for updates", () => {
  assertEquals(
    otaUpdateNotice({
      isEnabled: true,
      isDownloading: false,
      isUpdatePending: false,
    }),
    { kind: "hidden" },
  );
});

Deno.test("shows download progress while an update is fetching", () => {
  const notice = otaUpdateNotice({
    isEnabled: true,
    isDownloading: true,
    isUpdatePending: false,
    downloadProgress: 0.42,
  });
  assertEquals(notice, { kind: "downloading", progressLabel: "42%" });
  assertEquals(otaUpdateMessage(notice), "Downloading update… 42%");
});

Deno.test("prefers restart once the update is ready", () => {
  const notice = otaUpdateNotice({
    isEnabled: true,
    isDownloading: true,
    isUpdatePending: true,
    downloadProgress: 1,
  });
  assertEquals(notice, { kind: "ready" });
  assertEquals(otaUpdateMessage(notice), "Update ready. Tap to restart.");
});
