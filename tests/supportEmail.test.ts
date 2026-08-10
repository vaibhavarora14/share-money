import {
  buildSupportEmailUrl,
  SUPPORT_TOPICS,
} from "../mobile/utils/supportEmail.ts";

Deno.test("builds a prefilled email for the selected support topic", () => {
  const url = new URL(
    buildSupportEmailUrl(SUPPORT_TOPICS[1], "vaibhav@example.com"),
  );

  if (url.protocol !== "mailto:") throw new Error("expected a mailto URL");
  if (url.pathname !== "varora1406@gmail.com") {
    throw new Error("expected the SharedMoney support address");
  }
  if (
    url.searchParams.get("subject") !==
      "SharedMoney support — Groups & balances"
  ) {
    throw new Error("expected a topic-specific subject");
  }
  if (
    url.searchParams.get("body") !==
      "Hi SharedMoney Support,\n\nI need help with: Groups & balances\n\nRegistered email: vaibhav@example.com\n\nDescribe your issue:\n"
  ) {
    throw new Error(
      "expected the selected topic and registered email in the body",
    );
  }
});

Deno.test("uses a useful fallback when the account email is unavailable", () => {
  const url = new URL(buildSupportEmailUrl(SUPPORT_TOPICS[3]));

  if (
    !url.searchParams.get("body")?.includes("Registered email: Not available")
  ) {
    throw new Error("expected the email fallback");
  }
});
