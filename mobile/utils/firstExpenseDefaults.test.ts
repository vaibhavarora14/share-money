import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  defaultPaidByParticipantId,
  getFirstExpenseDefaults,
} from "./firstExpenseDefaults.ts";

Deno.test("first expense defaults: you paid + equal + all active", () => {
  const defaults = getFirstExpenseDefaults();
  assertEquals(defaults.paidBy, "current_user");
  assertEquals(defaults.splitMode, "equal");
  assertEquals(defaults.splitAmong, "all_active_members");
});

Deno.test("defaultPaidByParticipantId picks current user participant", () => {
  assertEquals(
    defaultPaidByParticipantId("u1", [
      { id: "p2", user_id: "u2" },
      { id: "p1", user_id: "u1" },
    ]),
    "p1",
  );
  assertEquals(defaultPaidByParticipantId("u9", [{ id: "p1", user_id: "u1" }]), null);
  assertEquals(defaultPaidByParticipantId(null, [{ id: "p1", user_id: "u1" }]), null);
});
